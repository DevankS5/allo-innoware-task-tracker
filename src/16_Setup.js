/* Workbook construction (docs/06 phase 1, 3, 5): tabs, headers, formats, validation, conditional formatting,
 * seed data, dashboard, protections and filter views. Repeatable: formats and empty tables only; never deletes data.
 * Apps Script services only: exercised by hand on the live sheet (see README), not by the Node tests. */

const DATETIME_FMT = 'yyyy-mm-dd hh:mm';
const DATETIME_COLS = {
  Task_Master: ['Initial_Due_At', 'Created_At', 'Updated_At'],
  Task_Cycles: ['Due_At', 'Completed_At', 'Manager_Ack_At', 'Manager_Ack_Deadline_At', 'Manager_Reminder_Sent_At', 'Leadership_Escalated_At', 'Created_At', 'Updated_At', 'Resolved_After_Escalation_At'],
  Alert_Log: ['Created_At', 'Attempted_At', 'Sent_At'], Audit_Log: ['Event_At'], Error_Log: ['Occurred_At'],
};
const CHECKBOX_COLS = {
  Task_Master: ['Is_Active', 'Working_Days_Only', 'Proof_Required', 'Escalate_If_Manager_Unacknowledged', 'Escalate_If_Task_Unresolved'],
  Team: ['Is_Active', 'Can_Edit_Task_Master', 'Can_Acknowledge'], Holiday_Calendar: ['Is_Non_Working'], Error_Log: ['Resolved'],
};
const LIST_COLS = [['Task_Master', 'Frequency_Type'], ['Task_Master', 'Recurrence_Mode'], ['Task_Master', 'Non_Working_Day_Policy'],
  ['Task_Master', 'Priority'], ['Task_Master', 'Required_Proof_Type'], ['Team', 'Role']];
const EDITABLE_CYCLE_COLS = ['Employee_Proof', 'Evidence_URL', 'Employee_Notes', 'Submit_Complete', 'Manager_Acknowledged', 'Manager_Notes'];

function colL_(n) { let s = ''; for (; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + (n - 1) % 26) + s; return s; }
const hCol_ = (sheet, h) => HEADERS[sheet].indexOf(h) + 1;
const body_ = (sh, col) => sh.getRange(2, col, sh.getMaxRows() - 1, 1);

function setupWorkbook() {
  const ss = SpreadsheetApp.getActive(), problems = [];
  const run = (label, fn) => { try { fn(); } catch (e) { problems.push(label + ': ' + e.message); try { logError('setupWorkbook:' + label, e, '', 'ERROR'); } catch (x) { /* log tab not ready */ } } };

  [SHEETS.DASHBOARD].concat(Object.keys(HEADERS)).forEach(n => { if (!ss.getSheetByName(n)) ss.insertSheet(n); });
  const blank = ss.getSheetByName('Sheet1'); if (blank && ss.getSheets().length > 1 && blank.getLastRow() === 0) ss.deleteSheet(blank);
  Object.keys(HEADERS).forEach((n, i) => {
    const sh = ss.getSheetByName(n), h = HEADERS[n];
    sh.getRange(1, 1, 1, h.length).setValues([h]).setFontWeight('bold').setBackground('#e8eaed'); sh.setFrozenRows(1);
    ss.setActiveSheet(sh); ss.moveActiveSheet(i + 2); // Dashboard stays first
  });
  ss.setActiveSheet(ss.getSheetByName(SHEETS.DASHBOARD)); ss.moveActiveSheet(1);
  // Plain text so '17:00' and 'TRUE' stay exactly what was typed (Sheets would turn them into time/boolean values).
  body_(ss.getSheetByName(SHEETS.SETTINGS), 2).setNumberFormat('@');
  body_(ss.getSheetByName(SHEETS.TASK_MASTER), hCol_(SHEETS.TASK_MASTER, 'Due_Time')).setNumberFormat('@');

  run('seed', () => {
    resetCaches(); setStore(null); seedSettings(); resetCaches();
    ss.setSpreadsheetTimeZone(tz());
    let me = ''; try { me = Session.getEffectiveUser().getEmail(); } catch (x) { /* unavailable */ }
    if (me && !cfg('AUTOMATION_OWNER_EMAIL')) setSetting('AUTOMATION_OWNER_EMAIL', me);
    if (!tbl(SHEETS.HOLIDAYS).rows().length) seedHolidays();
    if (!tbl(SHEETS.TEAM).rows().length) {
      seedTeam(); resetCaches();
      const admin = tbl(SHEETS.TEAM).rows().find(r => r.Role === 'ADMIN');
      if (me && admin) tbl(SHEETS.TEAM).update(admin.__row, { Member_Email: me }); // so the person running setup keeps admin rights
    }
    if (!tbl(SHEETS.TASK_MASTER).rows().length) { resetCaches(); seedTasks(firstWorkingDay_()); }
    resetCaches();
  });
  run('formats', () => {
    Object.keys(DATETIME_COLS).forEach(n => DATETIME_COLS[n].forEach(h => body_(ss.getSheetByName(n), hCol_(n, h)).setNumberFormat(DATETIME_FMT)));
    body_(ss.getSheetByName(SHEETS.HOLIDAYS), 1).setNumberFormat('yyyy-mm-dd');
  });
  run('validation', () => {
    LIST_COLS.forEach(([n, h]) => body_(ss.getSheetByName(n), hCol_(n, h)).setDataValidation(
      SpreadsheetApp.newDataValidation().requireValueInList(ENUMS[h], true).setAllowInvalid(false).build()));
    Object.keys(CHECKBOX_COLS).forEach(n => CHECKBOX_COLS[n].forEach(h => body_(ss.getSheetByName(n), hCol_(n, h)).insertCheckboxes()));
    const cyc = ss.getSheetByName(CYCLES); // existing rows only; new rows get their checkboxes on append
    const last = db().lastRow(cyc);
    if (last > 1) EDITABLE_CYCLE_COLS.filter(h => /Submit|Acknowledged/.test(h)).forEach(h => cyc.getRange(2, hCol_(CYCLES, h), last - 1, 1).insertCheckboxes());
  });
  run('conditional formatting', () => conditionalFormats_(ss));
  run('dashboard', () => buildDashboard_(ss));
  run('protections', () => applyProtections_(ss));
  run('filter views', () => createFilterViews());

  const hc = healthCheck();
  return (problems.length ? 'Setup finished with problems:\n- ' + problems.join('\n- ') + '\n\n' : 'Workbook ready.\n\n') +
    'Next:\n1. Team + Task_Master: replace the example.com addresses with real ones.\n2. Settings: set TEST_RECIPIENT_EMAIL, then SEND_EMAILS=TRUE for the demo.\n' +
    '3. Tasks > Create Initial Cycles, then Run Health Check.\n4. Tasks > Install/Repair Triggers (as the operations account).\n\nHealth now: ' +
    (hc.ok ? 'OK' : 'needs attention:\n- ' + hc.errors.join('\n- '));
}

function firstWorkingDay_() {
  const l = localParts(new Date()); let ymd = l.ymd;
  if (!isWorkingDay(ymd) || l.mins >= 17 * 60) ymd = nextWorkingDate(ymd);
  return ymd;
}

function conditionalFormats_(ss) {
  const sh = ss.getSheetByName(CYCLES), st = '$' + colL_(hCol_(CYCLES, 'Status')) + '2', esc = '$' + colL_(hCol_(CYCLES, 'Leadership_Escalated_At')) + '2';
  const range = sh.getRange(2, 1, sh.getMaxRows() - 1, HEADERS[CYCLES].length);
  const rule = (formula, bg, fg) => {
    let b = SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied(formula).setRanges([range]);
    if (bg) b = b.setBackground(bg); if (fg) b = b.setFontColor(fg); return b.build();
  };
  sh.setConditionalFormatRules([
    rule('=AND(' + esc + '<>"",' + st + '<>"COMPLETED",' + st + '<>"CANCELLED")', '#d9c2f0'), // escalated and still open
    rule('=' + st + '="OVERDUE"', '#f4c7c3'), rule('=' + st + '="DUE"', '#fce8b2'),
    rule('=' + st + '="COMPLETED"', '#e6f4ea', '#5f6368'), rule('=' + st + '="SCHEDULED"', null, '#80868b'),
  ]);
}

function buildDashboard_(ss) {
  const sh = ss.getSheetByName(SHEETS.DASHBOARD); sh.clear();
  const col = h => 'Task_Cycles!$' + colL_(hCol_(CYCLES, h)) + ':$' + colL_(hCol_(CYCLES, h));
  const L = h => colL_(hCol_(CYCLES, h));
  const S = col('Status'), EM = col('Assigned_To_Email'), ACK = col('Manager_Ack_At'), ESC = col('Leadership_Escalated_At'), DUE = col('Due_At'), DONE = col('Completed_At');
  const all = 'Task_Cycles!$A:$' + colL_(HEADERS[CYCLES].length), openN = 'COUNTIF(' + S + ',"DUE")+COUNTIF(' + S + ',"OVERDUE")';
  const today = c => 'COUNTIFS(' + c + ',">="&TODAY(),' + c + ',"<"&TODAY()+1';

  sh.getRange('A1').setValue('Allo Innoware - Recurring Task Tracker: manager dashboard').setFontSize(14).setFontWeight('bold');
  sh.getRange('A2').setFormula('="Calculated "&TEXT(NOW(),"yyyy-mm-dd hh:mm")&" - with a simulated test clock, the *today* tiles still follow the real date"').setFontColor('#80868b');
  const kpis = [['Open (due + overdue)', '=' + openN], ['Scheduled', '=COUNTIF(' + S + ',"SCHEDULED")'],
    ['Due today', '=' + today(DUE) + ',' + S + ',"<>COMPLETED",' + S + ',"<>CANCELLED")'], ['Overdue', '=COUNTIF(' + S + ',"OVERDUE")'],
    ['Awaiting manager ack', '=COUNTIFS(' + S + ',"OVERDUE",' + ACK + ',"")'],
    ['Escalated (open)', '=COUNTIFS(' + ESC + ',"<>",' + S + ',"<>COMPLETED",' + S + ',"<>CANCELLED")'],
    ['Completed today', '=' + today(DONE) + ',' + S + ',"COMPLETED")']];
  sh.getRange(4, 1, 1, 7).setValues([kpis.map(k => k[0])]).setFontWeight('bold').setBackground('#e8eaed');
  sh.getRange(5, 1, 1, 7).setFormulas([kpis.map(k => k[1])]).setFontSize(18).setHorizontalAlignment('left');

  sh.getRange('A8').setValue('Employee scorecard').setFontWeight('bold');
  sh.getRange(9, 1, 1, 7).setValues([['Employee', 'Open due', 'Scheduled', 'Overdue', 'Awaiting manager ack', 'Escalated open', 'Latest completion']]).setFontWeight('bold').setBackground('#e8eaed');
  const rows = [];
  for (let i = 0; i < 15; i++) {
    const r = 10 + i, a = '$A' + r, g = (st, extra) => 'COUNTIFS(' + EM + ',' + a + ',' + S + ',"' + st + '"' + (extra || '') + ')';
    rows.push(['=IFERROR(INDEX(FILTER(Team!$A$2:$A,Team!$C$2:$C="EMPLOYEE",Team!$E$2:$E=TRUE),' + (i + 1) + '),"")',
      '=IF(' + a + '="","",' + g('DUE') + '+' + g('OVERDUE') + ')', '=IF(' + a + '="","",' + g('SCHEDULED') + ')', '=IF(' + a + '="","",' + g('OVERDUE') + ')',
      '=IF(' + a + '="","",' + g('OVERDUE', ',' + ACK + ',""') + ')',
      '=IF(' + a + '="","",COUNTIFS(' + EM + ',' + a + ',' + ESC + ',"<>",' + S + ',"<>COMPLETED",' + S + ',"<>CANCELLED"))',
      '=IF(' + a + '="","",IF(MAXIFS(' + DONE + ',' + EM + ',' + a + ',' + S + ',"COMPLETED")=0,"",MAXIFS(' + DONE + ',' + EM + ',' + a + ',' + S + ',"COMPLETED")))']);
  }
  sh.getRange(10, 1, 15, 7).setFormulas(rows); sh.getRange(10, 7, 15, 1).setNumberFormat(DATETIME_FMT);

  const q = (title, row, sel, where, order) => {
    sh.getRange(row, 1).setValue(title).setFontWeight('bold');
    sh.getRange(row + 1, 1).setFormula('=IFERROR(QUERY(' + all + ',"select ' + sel.map(L).join(', ') + ' where ' + where + ' order by ' + order + ' limit 10",1),"None")');
  };
  q('Oldest overdue', 26, ['Task_Name_Snapshot', 'Assigned_To_Name', 'Due_At', 'Employee_Proof', 'Manager_Ack_At', 'Manager_Notes'], L('Status') + " = 'OVERDUE'", L('Due_At'));
  q('Escalated and still open', 40, ['Task_Name_Snapshot', 'Assigned_To_Name', 'Due_At', 'Leadership_Escalated_At', 'Manager_Ack_At', 'Manager_Notes'],
    L('Leadership_Escalated_At') + " is not null and " + L('Status') + " <> 'COMPLETED' and " + L('Status') + " <> 'CANCELLED'", L('Leadership_Escalated_At') + ' desc');
  q('Recent completions', 54, ['Task_Name_Snapshot', 'Assigned_To_Name', 'Completed_At', 'Employee_Proof', 'Completed_By_Source'], L('Status') + " = 'COMPLETED'", L('Completed_At') + ' desc');
  sh.setColumnWidths(1, 7, 170); sh.setFrozenRows(0);
}

/** System columns are admin/script-only; the six human-input columns stay open (docs/07 section 3). */
function applyProtections_(ss) {
  const admins = activeMembers('ADMIN').map(m => str(m.Member_Email)).concat([cfg('AUTOMATION_OWNER_EMAIL')]).filter(e => e);
  const lock = (p, desc) => {
    p.setDescription('Tracker: ' + desc); p.removeEditors(p.getEditors()); p.setDomainEdit(false);
    admins.forEach(e => { try { p.addEditor(e); } catch (x) { /* not a Google account */ } });
  };
  ss.getSheets().forEach(sh => sh.getProtections(SpreadsheetApp.ProtectionType.SHEET).concat(sh.getProtections(SpreadsheetApp.ProtectionType.RANGE))
    .filter(p => /^Tracker:/.test(p.getDescription())).forEach(p => p.remove()));
  Object.keys(HEADERS).filter(n => n !== CYCLES).concat([SHEETS.DASHBOARD]).forEach(n => lock(ss.getSheetByName(n).protect(), n + ' is admin/script only'));
  const sh = ss.getSheetByName(CYCLES); let start = 0;
  HEADERS[CYCLES].concat(['']).forEach((h, i) => { // contiguous runs of non-editable columns
    const system = h !== '' && EDITABLE_CYCLE_COLS.indexOf(h) < 0;
    if (system && !start) start = i + 1;
    if (!system && start) { // whole columns ('C:F'), so rows appended later are covered too
      lock(sh.getRange(colL_(start) + ':' + colL_(i)).protect(), 'Task_Cycles system columns'); start = 0;
    }
  });
  lock(sh.getRange(1, 1, 1, HEADERS[CYCLES].length).protect(), 'Task_Cycles header'); // covers headers above the editable columns
}

/** Saved filter views per employee / manager plus 'All Escalated'. Needs the Sheets advanced service (enabled in appsscript.json). */
function createFilterViews() {
  const ss = SpreadsheetApp.getActive(), sh = ss.getSheetByName(CYCLES), id = ss.getId(), sheetId = sh.getSheetId();
  const ix = h => hCol_(CYCLES, h) - 1, mine = /^(My Open Tasks|Manager Pending|All Escalated)/, reqs = [];
  resetCaches();
  (Sheets.Spreadsheets.get(id, { fields: 'sheets(properties.sheetId,filterViews(filterViewId,title))' }).sheets || [])
    .filter(s => s.properties.sheetId === sheetId).forEach(s => (s.filterViews || []).filter(f => mine.test(f.title)).forEach(f => reqs.push({ deleteFilterView: { filterId: f.filterViewId } })));
  const range = { sheetId, startRowIndex: 0, startColumnIndex: 0, endColumnIndex: HEADERS[CYCLES].length };
  const view = (title, criteria, sortBy) => ({ addFilterView: { filter: { title, range, sortSpecs: [{ dimensionIndex: ix(sortBy), sortOrder: 'ASCENDING' }], criteria } } });
  const eq = v => ({ condition: { type: 'TEXT_EQ', values: [{ userEnteredValue: v }] } });
  activeMembers('EMPLOYEE').forEach(m => reqs.push(view('My Open Tasks - ' + m.Display_Name,
    { [ix('Assigned_To_Email')]: eq(m.Member_Email), [ix('Status')]: { hiddenValues: ['COMPLETED', 'CANCELLED'] } }, 'Due_At')));
  activeMembers('MANAGER').forEach(m => reqs.push(view('Manager Pending - ' + m.Display_Name,
    { [ix('Manager_Email')]: eq(m.Member_Email), [ix('Status')]: { hiddenValues: ['SCHEDULED', 'COMPLETED', 'CANCELLED'] } }, 'Due_At')));
  reqs.push(view('All Escalated', { [ix('Leadership_Escalated_At')]: { condition: { type: 'NOT_BLANK' } }, [ix('Status')]: { hiddenValues: ['COMPLETED', 'CANCELLED'] } }, 'Leadership_Escalated_At'));
  Sheets.Spreadsheets.batchUpdate({ requests: reqs }, id);
  return 'Filter views refreshed (' + reqs.filter(r => r.addFilterView).length + ').';
}
