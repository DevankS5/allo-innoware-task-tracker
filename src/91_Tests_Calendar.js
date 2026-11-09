function registerCalendarTests(def) {
  def('calendar: local time round-trips in Asia/Kolkata', () => {
    const d = fromLocal('2026-11-10', '17:00');
    assertEq(d.toISOString(), '2026-11-10T11:30:00.000Z', 'IST is UTC+5:30');
    assertEq(localParts(d).ymd + ' ' + localParts(d).hh, '2026-11-10 17');
  });
  def('calendar: weekends and Holiday_Calendar rows drive isWorkingDay', () => {
    assert(isWorkingDay('2026-11-10') && !isWorkingDay('2026-11-14') && !isWorkingDay('2026-11-15'), 'Tue yes, Sat/Sun no');
    tbl(SHEETS.HOLIDAYS).append({ Date: fromLocal('2026-11-11', '00:00'), Is_Non_Working: true });
    tbl(SHEETS.HOLIDAYS).append({ Date: fromLocal('2026-11-14', '00:00'), Is_Non_Working: false }); // working Saturday
    resetCaches();
    assert(!isWorkingDay('2026-11-11') && isWorkingDay('2026-11-14'), 'holiday closes, override opens');
    assertEq(nextWorkingDate('2026-11-10'), '2026-11-12', 'skips the holiday');
  });
  def('calendar: addBusinessMinutes stays inside 09:30-18:30 and skips weekends', () => {
    const f = (ymd, hm) => fromLocal(ymd, hm);
    assertEq(addBusinessMinutes(f('2026-11-10', '17:15'), 60).toISOString(), f('2026-11-10', '18:15').toISOString(), 'same day');
    assertEq(addBusinessMinutes(f('2026-11-10', '17:15'), 75).toISOString(), f('2026-11-10', '18:30').toISOString(), 'lands exactly on close');
    assertEq(addBusinessMinutes(f('2026-11-13', '18:00'), 60).toISOString(), f('2026-11-16', '10:00').toISOString(), 'Fri evening -> Monday morning');
    assertEq(addBusinessMinutes(f('2026-11-14', '12:00'), 30).toISOString(), f('2026-11-16', '10:00').toISOString(), 'Saturday start');
    assertEq(addBusinessMinutes(f('2026-11-10', '08:00'), 30).toISOString(), f('2026-11-10', '10:00').toISOString(), 'before open');
  });
  def('calendar: simulated clock only applies in TEST', () => {
    setTestNow('2026-11-10 17:14');
    assertEq(getEffectiveNow().toISOString(), fromLocal('2026-11-10', '17:14').toISOString());
    setSetting('ENVIRONMENT', 'PRODUCTION'); resetCaches();
    assert(Math.abs(getEffectiveNow() - new Date()) < 5000, 'PRODUCTION ignores TEST_NOW_OVERRIDE');
  });
}
