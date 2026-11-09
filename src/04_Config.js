/* Settings, team directory and task definitions. Cached per execution; entry points call resetCaches() first. */

let _settings = null, _team = null, _tasks = null, _holidays = null;
function resetCaches() { _settings = _team = _tasks = _holidays = null; _execId = null; }

function settingsMap() {
  if (!_settings) { _settings = {}; tbl(SHEETS.SETTINGS).rows().forEach(r => { _settings[str(r.Key)] = r.Value; }); }
  return _settings;
}
function cfgRaw(key) { return settingsMap()[key]; }
function cfg(key, dflt) { const v = cfgRaw(key); return isBlank(v) ? (dflt === undefined ? '' : dflt) : str(v); }
function cfgNum(key, dflt) { return num(cfgRaw(key), dflt); }
function cfgBool(key) { return toBool(cfgRaw(key)); }

function setSetting(key, value) {
  const t = tbl(SHEETS.SETTINGS), row = t.rows().find(r => str(r.Key) === key);
  if (row) t.update(row.__row, { Value: value }); else t.append({ Key: key, Value: value, Notes: '' });
  _settings = null;
}

function teamMembers() { return _team || (_team = tbl(SHEETS.TEAM).rows()); }
function memberByEmail(email) { const e = lc(email); return e ? (teamMembers().find(m => lc(m.Member_Email) === e) || null) : null; }
function activeMembers(role) { return teamMembers().filter(m => toBool(m.Is_Active) && (!role || m.Role === role)); }
function leadershipEmails() { return activeMembers('LEADERSHIP').map(m => str(m.Member_Email)); }
function isAdminEmail(email) {
  const m = memberByEmail(email);
  return !!m && toBool(m.Is_Active) && (m.Role === 'ADMIN' || toBool(m.Can_Edit_Task_Master));
}

function allTasks() { return _tasks || (_tasks = tbl(SHEETS.TASK_MASTER).rows()); }
function taskById(id) { return allTasks().find(t => str(t.Task_ID) === str(id)) || null; }
function activeTasks() { return allTasks().filter(t => toBool(t.Is_Active)); }

/** Per-task SLA parameters with Settings defaults. Pass {} for an orphaned cycle. */
function taskParams(t) {
  return {
    graceMin: num(t.First_Manager_Alert_Minutes, cfgNum('DEFAULT_FIRST_ALERT_MINUTES', 15)),
    ackMin: num(t.Manager_Ack_SLA_Business_Minutes, cfgNum('DEFAULT_MANAGER_ACK_BUSINESS_MINUTES', 120)),
    reminderMin: num(t.Manager_Reminder_Offset_Minutes, cfgNum('DEFAULT_MANAGER_REMINDER_BUSINESS_MINUTES', 60)),
    dueTime: isBlank(t.Due_Time) ? cfg('DEFAULT_DUE_TIME', '17:00') : t.Due_Time,
    escUnack: isBlank(t.Escalate_If_Manager_Unacknowledged) ? true : toBool(t.Escalate_If_Manager_Unacknowledged),
    escUnres: isBlank(t.Escalate_If_Task_Unresolved) ? true : toBool(t.Escalate_If_Task_Unresolved),
  };
}
