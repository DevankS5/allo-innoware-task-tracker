/* Recurrence rules (docs/03-RECURRENCE-SLA.md section 3). Pure date maths: no sheet writes. */

function keyDaily(taskId, ymd) { return taskId + '|DAILY|' + ymd; }
function keyInterval(taskId, dueAt) {
  const l = localParts(dueAt);
  return taskId + '|INTERVAL|' + l.ymd + '|' + String(l.hh).padStart(2, '0') + ':' + String(l.mi).padStart(2, '0');
}

/** Next interval due date after a completion. Returns {dueAt, skipped} (skipped = fixed-cadence slots missed). */
function intervalNextDue(task, cycle, completedAt) {
  const p = taskParams(task), n = num(task.Interval_Days, 1);
  const mode = str(cycle.Recurrence_Mode_Snapshot) || str(task.Recurrence_Mode);
  const adjust = ymd => (toBool(task.Working_Days_Only) && task.Non_Working_Day_Policy === 'NEXT_WORKING_DAY') ? rollForward(ymd) : ymd;
  const doneYmd = localParts(completedAt).ymd;
  if (mode === 'FIXED_CADENCE') {
    // Grid anchored on the task's first due date; first grid date strictly after the completion date.
    const origin = localParts(toDate(task.Initial_Due_At)).ymd;
    const k0 = Math.floor(ymdDiff(origin, localParts(toDate(cycle.Due_At)).ymd) / n);
    let k = k0 + 1;
    while (adjust(ymdAdd(origin, k * n)) <= doneYmd) k++;
    return { dueAt: fromLocal(adjust(ymdAdd(origin, k * n)), p.dueTime), skipped: k - (k0 + 1) };
  }
  // AFTER_COMPLETION: completion date + N calendar days, then the non-working-day policy.
  return { dueAt: fromLocal(adjust(ymdAdd(doneYmd, n)), p.dueTime), skipped: 0 };
}
