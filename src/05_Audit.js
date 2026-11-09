/* Append-only audit trail and error log. Neither mutates cycle state. */

let _execId = null;
function execId() { return _execId || (_execId = uuid()); }

function audit(type, o) {
  o = o || {};
  tbl(SHEETS.AUDIT_LOG).append({
    Event_ID: uuid(), Event_At: getEffectiveNow(), Event_Type: type, Cycle_ID: o.cycleId || '', Task_ID: o.taskId || '',
    Actor_Email: o.actor || '', Actor_Source: o.source || '', Old_Status: o.from || '', New_Status: o.to || '',
    Event_Details_JSON: o.details ? JSON.stringify(o.details) : '', Execution_ID: execId(),
  });
}

/** Logs once per unresolved (function, cycle, message): a 5-minute dispatcher must not flood the sheet. */
function logError(fn, err, cycleId, severity) {
  try {
    const msg = String(err && err.message !== undefined ? err.message : err).slice(0, 500);
    const t = tbl(SHEETS.ERROR_LOG);
    if (t.rows().some(r => !toBool(r.Resolved) && r.Function_Name === fn && str(r.Cycle_ID) === str(cycleId) && r.Error_Message === msg)) return;
    t.append({
      Error_ID: uuid(), Occurred_At: getEffectiveNow(), Function_Name: fn, Cycle_ID: cycleId || '', Severity: severity || 'ERROR',
      Error_Message: msg, Stack_Summary: err && err.stack ? String(err.stack).split('\n').slice(0, 3).join(' | ').slice(0, 300) : '',
      Execution_ID: execId(), Resolved: false,
    });
  } catch (e) { logLine('logError failed: ' + e.message + ' / original: ' + (err && err.message)); }
}
