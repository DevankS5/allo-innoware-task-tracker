/* Spreadsheet-facing glue: edit trigger, custom menu, trigger installation. Thin on purpose: rules live in the services. */

let _toast = msg => SpreadsheetApp.getActive().toast(msg, 'Task tracker', 10);
function setToast(fn) { _toast = fn; }

const cycCol = name => HEADERS[SHEETS.TASK_CYCLES].indexOf(name) + 1;

/** Installable onEdit. Only the two checkboxes are transitions; typing a proof or note does nothing by itself. */
function handleTaskCyclesEdit(e) {
  if (!e || !e.range) return;
  const sh = e.range.getSheet(); if (sh.getName() !== SHEETS.TASK_CYCLES) return;
  const cSub = cycCol('Submit_Complete'), cAck = cycCol('Manager_Acknowledged');
  const r0 = e.range.getRow(), r1 = r0 + e.range.getNumRows() - 1, c0 = e.range.getColumn(), c1 = c0 + e.range.getNumColumns() - 1;
  const hit = c => c >= c0 && c <= c1, msgs = [];
  if (!hit(cSub) && !hit(cAck)) return;
  for (let r = Math.max(r0, 2); r <= r1; r++) { // a paste or fill-down can tick many rows at once
    const id = str(sh.getRange(r, 1).getValue()); if (!id) continue;
    try {
      if (hit(cSub) && sh.getRange(r, cSub).getValue() === true)
        msgs.push(processCompletion(id, resolveActor(e, str(sh.getRange(r, cycCol('Assigned_To_Email')).getValue()))).message);
      if (hit(cAck) && sh.getRange(r, cAck).getValue() === true)
        msgs.push(processManagerAcknowledgement(id, resolveActor(e, '')).message); // no row-derived fallback for acknowledgements
    } catch (err) {
      logError('handleTaskCyclesEdit', err, id, 'ERROR');
      msgs.push(err.message === 'LOCK_TIMEOUT' ? 'System busy: untick the box and try again in a minute.' : 'Error: please tell an admin (see Error_Log).');
    }
  }
  if (msgs.length) _toast(msgs.join(' | '));
}

function onOpen() {
  SpreadsheetApp.getUi().createMenu('Tasks')
    .addItem('Run Health Check', 'menuHealthCheck').addItem('Create Initial Cycles', 'menuCreateInitialCycles')
    .addItem('Run Dispatcher Now', 'menuRunDispatcher').addItem('Install/Repair Triggers', 'menuInstallTriggers')
    .addSeparator()
    .addItem('Set up workbook (first run)', 'menuSetup').addItem('Refresh filter views', 'menuFilterViews')
    .addItem('Set Test Clock (TEST only)', 'menuSetClock').addItem('Run Demo Test Suite', 'menuRunTests')
    .addItem('Reset Demo Data (TEST only)', 'menuResetDemo')
    .addToUi();
}

function say_(msg) { SpreadsheetApp.getUi().alert(msg); }

/** Menu actions are admin-only: Team ADMIN / Can_Edit_Task_Master, the spreadsheet owner, or anyone while no admin exists yet. */
function requireAdmin_() {
  resetCaches();
  let email = '', owner = '';
  try { email = Session.getActiveUser().getEmail(); } catch (x) { /* unavailable */ }
  try { const o = SpreadsheetApp.getActive().getOwner(); owner = o ? o.getEmail() : ''; } catch (x) { /* shared drive */ }
  let admins = 0; try { admins = activeMembers('ADMIN').length; } catch (x) { /* Team tab not created yet */ }
  if (admins && !(email && (isAdminEmail(email) || lc(email) === lc(owner)))) throw new Error('Admin only (Team role ADMIN or spreadsheet owner).');
}
function guarded_(fn) { try { requireAdmin_(); fn(); } catch (e) { say_(e.message); } }

function menuHealthCheck() {
  guarded_(() => { const h = healthCheck(); say_(h.ok ? 'Healthy.' + (h.warnings.length ? '\n\nWarnings:\n- ' + h.warnings.join('\n- ') : '') : 'Problems:\n- ' + h.errors.join('\n- ')); });
}
function menuCreateInitialCycles() { guarded_(() => say_('Created ' + createInitialCycles() + ' initial cycle(s).')); }
function menuRunDispatcher() { guarded_(() => say_('Dispatcher: ' + JSON.stringify(runDispatcher()))); }
function menuSetup() { guarded_(() => say_(setupWorkbook())); }
function menuFilterViews() { guarded_(() => say_(createFilterViews())); }
function menuInstallTriggers() { guarded_(() => say_(installAutomationTriggers())); }
function menuRunTests() { guarded_(() => { const r = runSelfTests(); say_(r.passed + '/' + r.total + ' passed' + (r.failed ? '\n\n' + r.failures.join('\n') : '') + '\n\nThe live workbook was not touched.'); }); }

function menuSetClock() {
  guarded_(() => {
    resetCaches(); if (cfg('ENVIRONMENT') !== 'TEST') throw new Error('Only available when ENVIRONMENT=TEST.');
    const ui = SpreadsheetApp.getUi(), r = ui.prompt('Simulated now (business timezone), e.g. 2026-11-10 17:16. Leave empty to use the real clock.', ui.ButtonSet.OK_CANCEL);
    if (r.getSelectedButton() === ui.Button.OK) { setTestNow(r.getResponseText().trim()); say_('Test clock: ' + (r.getResponseText().trim() || 'real time')); }
  });
}

function menuResetDemo() {
  guarded_(() => {
    resetCaches(); if (cfg('ENVIRONMENT') !== 'TEST') throw new Error('Refused: ENVIRONMENT is not TEST.');
    const ui = SpreadsheetApp.getUi();
    if (ui.alert('Delete ALL rows in Task_Cycles, Alert_Log, Audit_Log and Error_Log?', ui.ButtonSet.YES_NO) !== ui.Button.YES) return;
    [SHEETS.TASK_CYCLES, SHEETS.ALERT_LOG, SHEETS.AUDIT_LOG, SHEETS.ERROR_LOG].forEach(n => db().clear(n));
    SpreadsheetApp.getActive().getSheetByName(SHEETS.TASK_CYCLES).getProtections(SpreadsheetApp.ProtectionType.RANGE)
      .filter(p => /^(employee input|manager action) /.test(p.getDescription())).forEach(p => p.remove());
    setTestNow(''); say_('Demo data cleared. Run Tasks > Create Initial Cycles next.');
  });
}

/** Installs exactly one edit trigger and one dispatcher trigger, as the account running this. Run it as the operations account. */
function installAutomationTriggers() {
  resetCaches();
  const hc = healthCheck(); if (!hc.ok) throw new Error('Fix these before installing triggers:\n- ' + hc.errors.join('\n- '));
  const ss = SpreadsheetApp.getActive(), mins = cfgNum('DISPATCH_INTERVAL_MINUTES', 5), me = Session.getEffectiveUser().getEmail();
  ScriptApp.getProjectTriggers().forEach(t => { if (['handleTaskCyclesEdit', 'runDispatcher'].indexOf(t.getHandlerFunction()) >= 0) ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('handleTaskCyclesEdit').forSpreadsheet(ss).onEdit().create();
  ScriptApp.newTrigger('runDispatcher').timeBased().everyMinutes(mins).create();
  setSetting('TRIGGERS_INSTALLED_BY', me); setSetting('TRIGGERS_INSTALLED_AT', fmtLocal(new Date()));
  const owner = cfg('AUTOMATION_OWNER_EMAIL');
  return 'Installed: edit trigger + dispatcher every ' + mins + ' min, owned by ' + me + '.' +
    (owner && lc(owner) !== lc(me) ? '\nWARNING: AUTOMATION_OWNER_EMAIL is ' + owner + '. Re-run this as that account.' : '') +
    (hc.warnings.length ? '\n\nWarnings:\n- ' + hc.warnings.join('\n- ') : '');
}
