/* Notifications: routing, templates and sendAlertOnce (docs/04 section 12).
 * Alert_Log is the idempotency ledger: SENDING is written BEFORE the mail call, so an interrupted run leaves a
 * SENDING row that reconciliation turns into AMBIGUOUS instead of a blind duplicate. */

/** Why mail may not leave right now ('' = ok). */
function sendGateReason() {
  if (!cfgBool('SEND_EMAILS')) return 'SEND_EMAILS is not TRUE: alerts are held until it is enabled';
  const env = cfg('ENVIRONMENT');
  if (env === 'TEST') return /^\S+@\S+\.\S+$/.test(cfg('TEST_RECIPIENT_EMAIL')) ? '' : 'ENVIRONMENT=TEST needs a valid TEST_RECIPIENT_EMAIL';
  return env === 'PRODUCTION' ? '' : 'ENVIRONMENT must be TEST or PRODUCTION';
}

/** Recipients per stage. TEST mode routes everything to the test inbox (the intended list goes in the body). */
function routeRecipients(stage, c) {
  const mgr = str(c.Manager_Email); let to, cc = [];
  if (stage === STAGE.FIRST || stage === STAGE.REMINDER) to = [mgr];
  else { const lead = leadershipEmails(); to = lead.length ? lead : [mgr]; cc = lead.length && mgr ? [mgr] : []; }
  to = to.filter(Boolean); cc = cc.filter(Boolean);
  if (cfg('ENVIRONMENT') === 'TEST') return { to: [cfg('TEST_RECIPIENT_EMAIL')], cc: [], intended: { to, cc } };
  return { to, cc, intended: { to, cc } };
}

function buildEmail(c, stage, now, idx) {
  const r = routeRecipients(stage, c), due = toDate(c.Due_At), p = taskParams(taskById(c.Task_ID) || {});
  const name = str(c.Assigned_To_Name) || c.Assigned_To_Email, tag = cfg('ENVIRONMENT') === 'TEST' ? '[TEST] ' : '';
  const first = idx[dedupeKey(c.Cycle_ID, STAGE.FIRST)];
  const subjects = {
    [STAGE.FIRST]: '[ACTION REQUIRED] Overdue task: ' + c.Task_Name_Snapshot + ' - ' + name,
    [STAGE.REMINDER]: '[REMINDER] Manager acknowledgement pending: ' + c.Task_Name_Snapshot,
    [STAGE.UNACK]: '[ESCALATION] ' + c.Task_Name_Snapshot + ' remains unresolved - ' + name,
    [STAGE.UNRESOLVED]: '[ESCALATION] ' + c.Task_Name_Snapshot + ' remains unresolved - ' + name,
  };
  const lines = [
    'Task: ' + c.Task_Name_Snapshot + ' (' + c.Task_ID + ')', 'Assigned to: ' + name + ' <' + c.Assigned_To_Email + '>',
    'Due: ' + fmtLocal(due), 'Overdue by: ' + fmtDuration(now - due), 'Status: ' + c.Status,
    'Required proof: ' + c.Required_Proof_Type + ' | Employee proof so far: ' + (str(c.Employee_Proof) || '(none)'),
  ];
  if (stage === STAGE.FIRST || stage === STAGE.REMINDER) {
    lines.push('Acknowledge by: ' + fmtLocal(toDate(c.Manager_Ack_Deadline_At) || ackDeadline(due, p)));
    if (stage === STAGE.REMINDER && first && first.Sent_At) lines.push('First alert sent: ' + fmtLocal(toDate(first.Sent_At)));
    lines.push('', 'Open the row, enter a short action note in Manager_Notes and tick Manager_Acknowledged.',
      'Acknowledging records your review; the task stays open until the employee completes it.');
  } else {
    const acked = !isBlank(c.Manager_Ack_At);
    lines.push('Escalation reason: ' + (stage === STAGE.UNACK ? 'MANAGER_NOT_ACKNOWLEDGED' : 'TASK_UNRESOLVED_AFTER_ACK'),
      'First manager alert: ' + (first && first.Sent_At ? fmtLocal(toDate(first.Sent_At)) : '(not sent)'),
      'Manager reminder: ' + (isBlank(c.Manager_Reminder_Sent_At) ? '(none)' : fmtLocal(toDate(c.Manager_Reminder_Sent_At))),
      'Manager (' + c.Manager_Email + ') acknowledged: ' + (acked ? fmtLocal(toDate(c.Manager_Ack_At)) : 'NO'));
    if (acked) lines.push('Manager notes: ' + str(c.Manager_Notes));
  }
  lines.push('', 'Row: ' + db().rowLink(CYCLES, c.__row));
  if (cfg('ENVIRONMENT') === 'TEST') lines.push('', '[TEST MODE] Intended recipients - to: ' + r.intended.to.join(', ') + (r.intended.cc.length ? ' | cc: ' + r.intended.cc.join(', ') : ''));
  return { to: r.to, cc: r.cc, subject: tag + subjects[stage], body: lines.join('\n'), count: r.to.length + r.cc.length, recipientList: r.to.concat(r.cc).join(';') };
}

/** Sends at most one email per (cycle, stage). Returns SENT | FAILED | SKIPPED | QUOTA | DUPLICATE. */
function sendAlertOnce(c, stage, now, idx) {
  const dk = dedupeKey(c.Cycle_ID, stage), prev = idx[dk];
  if (!canSend(prev)) return 'DUPLICATE';
  const gate = sendGateReason();
  if (gate) { logError('sendAlertOnce', gate, '', 'INFO'); return 'SKIPPED'; }
  const msg = buildEmail(c, stage, now, idx);
  if (mailer().quota() < msg.count) { logError('sendAlertOnce', 'Email quota exhausted; alerts stay pending', '', 'ERROR'); return 'QUOTA'; }
  const token = 'ALRT-' + uuid().slice(0, 8).toUpperCase();
  msg.body += '\n\n--\nRef: ' + token + ' | Cycle: ' + c.Cycle_ID;
  let rec;
  if (prev) {
    rec = prev; tbl(SHEETS.ALERT_LOG).update(prev.__row, { Status: 'SENDING', Attempted_At: now, Retry_Count: num(prev.Retry_Count, 0) + 1, Unique_Email_Token: token, Error_Message: '' });
  } else {
    rec = idx[dk] = tbl(SHEETS.ALERT_LOG).append({ Alert_ID: uuid(), Dedupe_Key: dk, Cycle_ID: c.Cycle_ID, Task_ID: c.Task_ID, Alert_Stage: stage,
      Recipient_List: msg.recipientList, Subject: msg.subject, Status: 'SENDING', Created_At: now, Attempted_At: now, Retry_Count: 0, Unique_Email_Token: token });
  }
  try { mailer().send(msg); } catch (e) {
    tbl(SHEETS.ALERT_LOG).update(rec.__row, { Status: 'FAILED', Error_Message: String(e.message).slice(0, 300) });
    idx[dk] = Object.assign({}, rec, { Status: 'FAILED', Retry_Count: num(rec.Retry_Count, 0) });
    logError('sendAlertOnce', e, c.Cycle_ID, 'ERROR'); return 'FAILED';
  }
  tbl(SHEETS.ALERT_LOG).update(rec.__row, { Status: 'SENT', Sent_At: now });
  idx[dk] = Object.assign({}, rec, { Status: 'SENT', Sent_At: now });
  const patch = { Last_Alert_Stage: stage, Updated_At: now };
  if (stage === STAGE.REMINDER) patch.Manager_Reminder_Sent_At = now;
  if ((stage === STAGE.UNACK || stage === STAGE.UNRESOLVED) && isBlank(c.Leadership_Escalated_At)) patch.Leadership_Escalated_At = now;
  tbl(CYCLES).update(c.__row, patch);
  const type = stage === STAGE.FIRST ? 'MANAGER_ALERT_SENT' : stage === STAGE.REMINDER ? 'MANAGER_REMINDER_SENT' : 'LEADERSHIP_ESCALATED';
  audit(type, { cycleId: c.Cycle_ID, taskId: c.Task_ID, details: { stage, to: msg.recipientList, token } });
  return 'SENT';
}

/** One pass over open cycles; returns the number of emails sent. */
function processAlerts(now) {
  const idx = alertIndex(); let sent = 0;
  tbl(CYCLES).rows().filter(c => c.Status === STATUS.DUE || c.Status === STATUS.OVERDUE).forEach(c => {
    eligibleStages(c, taskById(c.Task_ID), now, idx).forEach(stage => { if (sendAlertOnce(c, stage, now, idx) === 'SENT') sent++; });
  });
  return sent;
}
