/* SLA timing (docs/03-RECURRENCE-SLA.md section 6) and alert eligibility. Pure: decides, never sends. */

/** Manager acknowledgement deadline: alert + ack SLA business minutes, capped at that day's close. */
function ackDeadline(dueAt, p) {
  const alertAt = new Date(dueAt.getTime() + p.graceMin * 60000), biz = addBusinessMinutes(alertAt, p.ackMin);
  const ymd = localParts(alertAt).ymd;
  if (isWorkingDay(ymd)) {
    const close = fromLocal(ymd, cfg('WORKDAY_END', '18:30'));
    if (alertAt < close && close < biz) return close; // late-day task: same-day escalation stays possible
  }
  return biz;
}

/** Acknowledged-but-open escalation: next working day after the due date, at UNRESOLVED_ESCALATION_TIME. */
function unresolvedThreshold(dueAt) {
  return fromLocal(nextWorkingDate(localParts(dueAt).ymd), cfg('UNRESOLVED_ESCALATION_TIME', '11:00'));
}

function dedupeKey(cycleId, stage) { return cycleId + '|' + stage; }
function alertIndex() { const m = {}; tbl(SHEETS.ALERT_LOG).rows().forEach(a => { m[a.Dedupe_Key] = a; }); return m; }
// A stage may be (re)sent only if it has no record yet, or its last attempt FAILED with retries left.
function canSend(rec) { return !rec || (rec.Status === 'FAILED' && num(rec.Retry_Count, 0) < MAX_ALERT_RETRIES); }

/** Which alert stages are due for an open cycle at `now`, honouring the dedupe index. Order: first, reminder, escalations. */
function eligibleStages(c, task, now, idx) {
  const p = taskParams(task || {}), due = toDate(c.Due_At), out = [];
  const alertAt = new Date(due.getTime() + p.graceMin * 60000);
  const acked = !isBlank(c.Manager_Ack_At), ackBy = toDate(c.Manager_Ack_Deadline_At) || ackDeadline(due, p);
  if (now >= alertAt) out.push(STAGE.FIRST);
  const remAt = addBusinessMinutes(alertAt, p.reminderMin);
  if (!acked && now >= remAt && remAt < ackBy && now < ackBy) out.push(STAGE.REMINDER);
  if (!acked && p.escUnack && now >= ackBy) out.push(STAGE.UNACK);
  if (acked && p.escUnres && now >= unresolvedThreshold(due)) out.push(STAGE.UNRESOLVED);
  return out.filter(s => canSend(idx[dedupeKey(c.Cycle_ID, s)]));
}
