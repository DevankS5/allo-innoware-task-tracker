/* The scheduled control loop (docs/04 section 5). Safe to run any number of times: every step is idempotent. */

function runDispatcher() {
  resetCaches();
  try { return withLock(runDispatcher_, 5000); } catch (e) {
    if (e.message === 'LOCK_TIMEOUT') { logError('runDispatcher', 'Another run holds the lock; skipped this pass', '', 'WARN'); return { skipped: true }; }
    throw e;
  }
}

function runDispatcher_() {
  const now = getEffectiveNow(), summary = { cyclesCreated: 0, statusChanges: 0, alertsSent: 0, errors: 0 };
  const hc = healthCheck();
  if (!hc.ok) { logError('runDispatcher', 'Health check failed: ' + hc.errors.join(' | '), '', 'CRITICAL'); summary.errors = hc.errors.length; summary.blocked = true; return summary; }
  const step = (name, fn) => { try { fn(); } catch (e) { summary.errors++; logError(name, e, '', 'ERROR'); } };
  step('createInitialCycles', () => { summary.cyclesCreated += createInitialCycles_(now); });
  step('ensureDailyCycles', () => { summary.cyclesCreated += ensureDailyCycles(now); });
  step('refreshOpenCycleStatuses', () => { summary.statusChanges += refreshOpenCycleStatuses(now); });
  step('processAlerts', () => { summary.alertsSent += processAlerts(now); });
  step('reconcile', () => reconcile(now));
  step('heartbeat', () => setSetting('LAST_HEALTH_CHECK_AT', now));
  return summary;
}

/** Detects and safely repairs interrupted transitions (docs/04 section 13). Never resends mail, never deletes rows. */
function reconcile(now) {
  const repaired = (cycleId, taskId, note) => audit('RECONCILIATION_REPAIRED', { cycleId, taskId, details: { note } });
  const cycles = tbl(CYCLES).rows(), seen = {};

  cycles.forEach(c => {
    if (seen[c.Cycle_Key]) logError('reconcile', 'Duplicate Cycle_Key ' + c.Cycle_Key, c.Cycle_ID, 'ERROR'); seen[c.Cycle_Key] = true;
    if (!taskById(c.Task_ID)) logError('reconcile', 'Cycle references unknown Task_ID ' + c.Task_ID, c.Cycle_ID, 'ERROR');
    if (!memberByEmail(c.Assigned_To_Email)) logError('reconcile', 'Assignee not in Team: ' + c.Assigned_To_Email, c.Cycle_ID, 'WARN');
    if (c.Status === STATUS.COMPLETED && isBlank(c.Completed_At)) logError('reconcile', 'COMPLETED cycle has no Completed_At', c.Cycle_ID, 'ERROR');
    if (OPEN_STATUSES.indexOf(c.Status) >= 0 && toBool(c.Submit_Complete)) logError('reconcile', 'Submit_Complete is ticked but the cycle is still open: the edit trigger may have failed', c.Cycle_ID, 'WARN');
    if (toBool(c.Manager_Acknowledged) && isBlank(c.Manager_Ack_At)) logError('reconcile', 'Manager_Acknowledged is ticked but not recorded: the edit trigger may have failed', c.Cycle_ID, 'WARN');
  });

  // Active interval task whose newest cycle is COMPLETED but has no open successor: recreate it (deterministic key).
  activeTasks().filter(t => t.Frequency_Type === 'INTERVAL').forEach(t => {
    const mine = cycles.filter(c => c.Task_ID === t.Task_ID).sort((a, b) => num(a.Cycle_No, 0) - num(b.Cycle_No, 0));
    const last = mine[mine.length - 1];
    if (!last || last.Status !== STATUS.COMPLETED || isBlank(last.Completed_At)) return;
    const nx = intervalNextDue(t, last, toDate(last.Completed_At)), made = createCycle(t, nx.dueAt, keyInterval(t.Task_ID, nx.dueAt), now);
    if (made) repaired(made.Cycle_ID, t.Task_ID, 'recreated missing next cycle after ' + last.Cycle_ID);
  });

  tbl(SHEETS.ALERT_LOG).rows().forEach(a => {
    const attempted = toDate(a.Attempted_At);
    if (a.Status === 'SENDING' && attempted && now - attempted > AMBIGUOUS_AFTER_MIN * 60000) {
      tbl(SHEETS.ALERT_LOG).update(a.__row, { Status: 'AMBIGUOUS', Error_Message: 'Run interrupted while sending; check the sender Sent folder for ' + a.Unique_Email_Token });
      logError('reconcile', 'Alert ' + a.Dedupe_Key + ' is AMBIGUOUS: confirm in Sent mail (token ' + a.Unique_Email_Token + ') before any manual resend', a.Cycle_ID, 'ERROR');
      repaired(a.Cycle_ID, a.Task_ID, 'SENDING -> AMBIGUOUS ' + a.Alert_Stage);
    } else if (a.Status === 'SENT' && isBlank(a.Sent_At) && attempted) {
      tbl(SHEETS.ALERT_LOG).update(a.__row, { Sent_At: attempted }); repaired(a.Cycle_ID, a.Task_ID, 'filled missing Sent_At from Attempted_At');
    }
  });
}
