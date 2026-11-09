function registerRecurrenceTests(def) {
  const task = o => Object.assign({ Task_ID: 'T', Interval_Days: 7, Recurrence_Mode: 'AFTER_COMPLETION', Working_Days_Only: true,
    Non_Working_Day_Policy: 'NEXT_WORKING_DAY', Due_Time: '17:00', Initial_Due_At: fromLocal('2026-11-10', '17:00') }, o);
  const cyc = (due, mode) => ({ Due_At: fromLocal(due, '17:00'), Recurrence_Mode_Snapshot: mode || 'AFTER_COMPLETION' });
  const ymdTime = d => localParts(d).ymd + ' ' + String(localParts(d).hh).padStart(2, '0') + ':00';

  def('recurrence: AFTER_COMPLETION = completion date + N, not the old due date (spec example)', () => {
    const r = intervalNextDue(task(), cyc('2026-11-10'), fromLocal('2026-11-12', '14:20'));
    assertEq(ymdTime(r.dueAt), '2026-11-19 17:00');
  });
  def('recurrence: AFTER_COMPLETION rolls a weekend landing to Monday (N07) unless KEEP_DATE', () => {
    const done = fromLocal('2026-11-14', '10:00'); // Saturday + 15 = Sunday 29 Nov
    assertEq(ymdTime(intervalNextDue(task({ Interval_Days: 15 }), cyc('2026-11-10'), done).dueAt), '2026-11-30 17:00');
    assertEq(ymdTime(intervalNextDue(task({ Interval_Days: 15, Non_Working_Day_Policy: 'KEEP_DATE' }), cyc('2026-11-10'), done).dueAt), '2026-11-29 17:00');
  });
  def('recurrence: FIXED_CADENCE skips missed slots and reports them (spec example)', () => {
    const t = task({ Interval_Days: 15, Recurrence_Mode: 'FIXED_CADENCE', Non_Working_Day_Policy: 'KEEP_DATE', Initial_Due_At: fromLocal('2026-11-01', '17:00') });
    const r = intervalNextDue(t, cyc('2026-11-01', 'FIXED_CADENCE'), fromLocal('2026-11-20', '10:00'));
    assertEq(ymdTime(r.dueAt), '2026-12-01 17:00', 'grid 1 Nov, 16 Nov, 1 Dec: next after 20 Nov');
    assertEq(r.skipped, 1, 'the 16 Nov slot was missed');
    assertEq(intervalNextDue(t, cyc('2026-11-01', 'FIXED_CADENCE'), fromLocal('2026-11-05', '10:00')).skipped, 0, 'on time, nothing skipped');
  });
  def('recurrence: cycle keys are deterministic and timezone-stable', () => {
    assertEq(keyDaily('OPS', '2026-11-10'), 'OPS|DAILY|2026-11-10');
    assertEq(keyInterval('P7', fromLocal('2026-11-19', '17:00')), 'P7|INTERVAL|2026-11-19|17:00');
  });
  def('sla: ack deadline is alert+120 business min, capped at 18:30 for a 17:00 task', () => {
    const p = taskParams({});
    assertEq(fmtLocal(ackDeadline(fromLocal('2026-11-10', '17:00'), p)), '2026-11-10 18:30 (Asia/Kolkata)');
    assertEq(fmtLocal(ackDeadline(fromLocal('2026-11-10', '10:00'), p)), '2026-11-10 12:15 (Asia/Kolkata)', '10:00 task -> 10:15 + 2h');
  });
  def('sla: unresolved threshold is 11:00 next working day (Friday -> Monday)', () => {
    assertEq(fmtLocal(unresolvedThreshold(fromLocal('2026-11-10', '17:00'))), '2026-11-11 11:00 (Asia/Kolkata)');
    assertEq(fmtLocal(unresolvedThreshold(fromLocal('2026-11-13', '17:00'))), '2026-11-16 11:00 (Asia/Kolkata)');
  });
}
