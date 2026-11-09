/* Configuration validation. Errors block the dispatcher and trigger installation; warnings are advisory. */

function healthCheck() {
  const errors = [], warnings = [];
  const err = m => errors.push(m), warn = m => warnings.push(m);
  try {
    db().checkHeaders().forEach(err);
    const zones = db().timezones();
    if (zones.spreadsheet !== tz() || zones.script !== tz()) err('Timezone mismatch: Settings.TIMEZONE=' + tz() + ', spreadsheet=' + zones.spreadsheet + ', script=' + zones.script + ' (all three must match)');
    const env = cfg('ENVIRONMENT');
    if (env !== 'TEST' && env !== 'PRODUCTION') err('ENVIRONMENT must be TEST or PRODUCTION');
    [['WORKDAY_START', '09:30'], ['WORKDAY_END', '18:30'], ['DEFAULT_DUE_TIME', '17:00'], ['UNRESOLVED_ESCALATION_TIME', '11:00']]
      .forEach(k => { if (isNaN(parseHHmm(cfg(k[0], k[1])))) err(k[0] + ' is not a valid HH:mm time'); });
    if (parseHHmm(cfg('WORKDAY_START', '09:30')) >= parseHHmm(cfg('WORKDAY_END', '18:30'))) err('WORKDAY_START must be before WORKDAY_END');
    if ([1, 5, 10, 15, 30].indexOf(cfgNum('DISPATCH_INTERVAL_MINUTES', 5)) < 0) err('DISPATCH_INTERVAL_MINUTES must be 1, 5, 10, 15 or 30');
    if (!isBlank(cfgRaw('TEST_NOW_OVERRIDE'))) { try { toDate(cfgRaw('TEST_NOW_OVERRIDE')); } catch (e) { err('TEST_NOW_OVERRIDE is not a valid date'); } if (env === 'PRODUCTION') warn('TEST_NOW_OVERRIDE is ignored in PRODUCTION; clear it'); }
    if (cfgBool('SEND_EMAILS')) { const g = sendGateReason(); if (g) err(g); }
    if (env === 'PRODUCTION' && !cfgBool('SEND_EMAILS')) warn('PRODUCTION but SEND_EMAILS is not TRUE: no alerts will leave');
    if (!leadershipEmails().length) err('Team needs at least one active LEADERSHIP member');

    const seen = {};
    teamMembers().forEach(m => {
      const e = lc(m.Member_Email);
      if (seen[e]) err('Duplicate Team member ' + e); seen[e] = true;
      if (ENUMS.Role.indexOf(m.Role) < 0) err('Team ' + e + ': Role must be one of ' + ENUMS.Role.join('/'));
      if (env === 'PRODUCTION' && /@example\.com$/.test(e) && toBool(m.Is_Active)) warn('Team ' + e + ' is a seed address');
    });
    const ids = {};
    allTasks().forEach(t => {
      const id = str(t.Task_ID), at = 'Task ' + id + ': ';
      if (!id) { err('Task_Master row ' + t.__row + ' has no Task_ID'); return; }
      if (ids[id]) err('Duplicate Task_ID ' + id); ids[id] = true;
      if (!toBool(t.Is_Active)) return;
      [['Frequency_Type', t.Frequency_Type], ['Recurrence_Mode', t.Recurrence_Mode], ['Non_Working_Day_Policy', t.Non_Working_Day_Policy], ['Priority', t.Priority], ['Required_Proof_Type', t.Required_Proof_Type]]
        .forEach(f => { if (ENUMS[f[0]].indexOf(f[1]) < 0) err(at + f[0] + ' must be one of ' + ENUMS[f[0]].join('/')); });
      if (t.Frequency_Type === 'DAILY' && t.Recurrence_Mode !== 'DAILY_WORKDAY') err(at + 'DAILY needs Recurrence_Mode=DAILY_WORKDAY');
      if (t.Frequency_Type === 'INTERVAL') {
        if (!(num(t.Interval_Days, 0) >= 1) || num(t.Interval_Days, 0) % 1) err(at + 'INTERVAL needs a whole Interval_Days >= 1');
        if (t.Recurrence_Mode !== 'AFTER_COMPLETION' && t.Recurrence_Mode !== 'FIXED_CADENCE') err(at + 'INTERVAL needs AFTER_COMPLETION or FIXED_CADENCE');
      }
      if (t.Required_Proof_Type === 'TICKET_ID' && !toBool(t.Proof_Required)) err(at + 'TICKET_ID requires Proof_Required=TRUE');
      try { if (!toDate(t.Initial_Due_At)) err(at + 'Initial_Due_At is required'); } catch (e) { err(at + 'Initial_Due_At is not a valid date'); }
      const dt = parseHHmm(isBlank(t.Due_Time) ? cfg('DEFAULT_DUE_TIME', '17:00') : t.Due_Time);
      if (isNaN(dt)) err(at + 'Due_Time must be HH:mm text'); else if (dt > 17 * 60) warn(at + 'Due_Time after 17:00 needs a reviewed SLA (default assumes a cutoff no later than 17:00)');
      ['Assigned_To_Email', 'Manager_Email'].forEach(f => {
        const m = memberByEmail(t[f]);
        if (!m || !toBool(m.Is_Active)) err(at + f + ' "' + str(t[f]) + '" is not an active Team member');
      });
    });
  } catch (e) { err('Health check crashed: ' + e.message); }
  return { ok: errors.length === 0, errors, warnings };
}
