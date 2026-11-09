/* Required assignment tests 4, 5 (escalation side), 6, 7, 8 and negative cases N09, N10, N12. */

function registerAlertTests(def) {
  const OPS = 'OPS-DAILY-001', lead = m => /ESCALATION/.test(m.subject);
  const stages = cid => W.alerts(cid).map(a => a.Alert_Stage + ':' + a.Status).join(',');

  def('Test 4 same-day manager alert: none before due+15, exactly one after, none on re-run', ({ mail }) => {
    W.isolate(OPS);
    W.at('2026-11-10 17:14'); assertEq(mail.sent.length, 0, 'inside the 15 minute grace');
    W.at('2026-11-10 17:16');
    const c = W.cycles(OPS)[0], m = mail.sent[0];
    assertEq(c.Status, 'OVERDUE'); assertEq(mail.sent.length, 1);
    assert(/^\[TEST\] \[ACTION REQUIRED\] Overdue task: Daily Operations Update - Employee A/.test(m.subject), 'subject: ' + m.subject);
    assertEq(m.to.join(), 'inbox@example.com', 'TEST mode routes to the test inbox');
    ['Due: 2026-11-10 17:00', 'WHATSAPP_ATTESTATION', 'mgr@example.com', 'Acknowledge by: 2026-11-10 18:30', c.Cycle_ID].forEach(s => assert(m.body.indexOf(s) >= 0, 'body has ' + s));
    assertEq(stages(c.Cycle_ID), 'MANAGER_FIRST_ALERT:SENT');
    W.at('2026-11-10 17:20'); assertEq(mail.sent.length, 1, 'no duplicate first alert');
  });

  def('Test 5 acknowledgement suppresses unack escalation; completing before 11:00 suppresses the unresolved one', ({ mail }) => {
    W.isolate(OPS);
    W.at('2026-11-10 17:16');
    const c = W.cycles(OPS)[0];
    assert(W.ack(c.Cycle_ID, 'Called employee; ETA 18:00').accepted);
    W.at('2026-11-10 18:31');
    assertEq(stages(c.Cycle_ID), 'MANAGER_FIRST_ALERT:SENT', 'acknowledged: no reminder, no unack escalation');
    W.at('2026-11-11 09:00');
    assert(W.submit(c.Cycle_ID, { Employee_Proof: 'Posted 17:40 - daily operations summary' }).accepted);
    W.at('2026-11-11 11:01');
    assertEq(mail.sent.filter(lead).length, 0, 'no leadership email at all');
    assertEq(W.cycle(c.Cycle_ID).Status, 'COMPLETED');
  });

  def('Test 6a leadership escalation: manager never acknowledges -> reminder, then one unack escalation', ({ mail }) => {
    W.isolate(OPS);
    W.at('2026-11-10 17:16'); W.at('2026-11-10 18:16');
    const c = W.cycles(OPS)[0];
    assertEq(stages(c.Cycle_ID), 'MANAGER_FIRST_ALERT:SENT,MANAGER_REMINDER:SENT');
    W.at('2026-11-10 18:31');
    const esc = mail.sent.filter(lead);
    assertEq(esc.length, 1); assertEq(W.alerts(c.Cycle_ID, 'LEADERSHIP_UNACK_ESCALATION')[0].Status, 'SENT');
    ['MANAGER_NOT_ACKNOWLEDGED', 'First manager alert: 2026-11-10 17:16', 'Manager reminder: 2026-11-10 18:16', 'acknowledged: NO', 'lead1@example.com, lead2@example.com'].forEach(s => assert(esc[0].body.indexOf(s) >= 0, 'escalation body has ' + s));
    assert(!isBlank(W.cycle(c.Cycle_ID).Leadership_Escalated_At), 'Leadership_Escalated_At stamped');
    W.at('2026-11-10 18:35'); W.at('2026-11-10 18:40'); assertEq(mail.sent.filter(lead).length, 1, 'escalated once');
    W.at('2026-11-11 09:00');
    assert(W.submit(c.Cycle_ID, { Employee_Proof: 'Posted 09:05 - late summary' }).accepted);
    assert(!isBlank(W.cycle(c.Cycle_ID).Resolved_After_Escalation_At), 'resolution after escalation recorded');
    W.at('2026-11-11 12:00'); assertEq(mail.sent.filter(lead).length, 1, 'no further escalation after completion');
  });

  def('Test 6b leadership escalation: acknowledged but unresolved -> one escalation at next working day 11:00', ({ mail }) => {
    W.isolate(OPS);
    W.at('2026-11-10 17:16');
    const c = W.cycles(OPS)[0];
    W.ack(c.Cycle_ID, 'Portal access issue; ETA 10:30 tomorrow');
    W.at('2026-11-11 10:59'); assertEq(mail.sent.filter(lead).length, 0, 'one minute early');
    W.at('2026-11-11 11:00');
    const esc = mail.sent.filter(lead);
    assertEq(esc.length, 1);
    ['TASK_UNRESOLVED_AFTER_ACK', 'Portal access issue; ETA 10:30 tomorrow', 'acknowledged: 2026-11-10 17:16'].forEach(s => assert(esc[0].body.indexOf(s) >= 0, 'body has ' + s));
    W.at('2026-11-11 11:05'); assertEq(mail.sent.filter(lead).length, 1, 'once');
  });

  def('Test 7 timing boundaries (same-day SLA ladder and the Friday -> Monday weekend rule)', ({ mail }) => {
    W.isolate(OPS);
    const ladder = [['16:59', 0], ['17:14', 0], ['17:15', 1], ['18:14', 1], ['18:15', 2], ['18:29', 2], ['18:30', 3]];
    ladder.forEach(([hm, n]) => { W.at('2026-11-10 ' + hm); assertEq(mail.sent.length, n, 'emails at ' + hm); });
    assertEq(mail.sent.map(m => m.subject.replace(/^\[TEST\] /, '').split(' ')[0]).join(' '), '[ACTION [REMINDER] [ESCALATION]', 'first, reminder, escalation in order');
    // Friday task acknowledged: threshold is Monday 11:00, not Saturday.
    mail.sent.length = 0;
    W.at('2026-11-13 17:16'); const fri = W.cycles(OPS).filter(c => localParts(toDate(c.Due_At)).ymd === '2026-11-13')[0];
    W.ack(fri.Cycle_ID, 'Will chase Monday');
    W.at('2026-11-14 11:30'); W.at('2026-11-16 10:59'); assertEq(mail.sent.filter(lead).length, 0);
    W.at('2026-11-16 11:00'); assertEq(mail.sent.filter(lead).length, 1);
  });

  def('Test 8 idempotency: repeated dispatcher runs, completions, acknowledgements and next-cycle creation', ({ mail }) => {
    for (let i = 0; i < 5; i++) W.at('2026-11-10 17:16');
    assertEq(mail.sent.length, 4, 'four overdue cycles, one first alert each');
    assertEq(W.alerts().length, 4); assertEq(new Set(W.alerts().map(a => a.Dedupe_Key)).size, 4, 'unique dedupe keys');
    assertEq(tbl(SHEETS.TASK_CYCLES).rows().length, 4); assertEq(new Set(tbl(SHEETS.TASK_CYCLES).rows().map(c => c.Cycle_Key)).size, 4, 'unique cycle keys');
    const c = W.cycles('PORTAL-7D-001')[0], r = W.submit(c.Cycle_ID, { Employee_Proof: 'TCK-77' });
    W.submit(c.Cycle_ID, {}); W.submit(c.Cycle_ID, {});
    const nxt = W.cycle(r.nextCycleId);
    assertEq(createCycle(taskById('PORTAL-7D-001'), toDate(nxt.Due_At), nxt.Cycle_Key, getEffectiveNow()), null, 'same key never inserts twice');
    for (let i = 0; i < 3; i++) W.at('2026-11-10 17:17');
    assertEq(W.cycles('PORTAL-7D-001').length, 2); assertEq(W.audits('CYCLE_COMPLETED', c.Cycle_ID).length, 1);
    const o = W.cycles(OPS)[0]; W.ack(o.Cycle_ID, 'on it'); W.ack(o.Cycle_ID, 'on it');
    assertEq(W.audits('MANAGER_ACKNOWLEDGED', o.Cycle_ID).length, 1);
    assertEq(mail.sent.length, 4, 'completed cycle stops further mail; no repeats anywhere');
  });

  def('N09 quota exhausted: nothing marked SENT, error logged, sent once quota returns', ({ mail }) => {
    W.isolate(OPS); mail.left = 0;
    W.at('2026-11-10 17:16');
    assertEq(mail.sent.length, 0); assertEq(W.alerts().length, 0, 'no alert row, still retriable');
    assert(tbl(SHEETS.ERROR_LOG).rows().some(e => /quota/i.test(e.Error_Message)), 'quota error logged');
    mail.left = 10; W.at('2026-11-10 17:17');
    assertEq(mail.sent.length, 1);
  });

  def('Failed send is retried (bounded) under the same dedupe key', ({ mail }) => {
    W.isolate(OPS); mail.failNext = true;
    W.at('2026-11-10 17:16');
    const c = W.cycles(OPS)[0];
    assertEq(stages(c.Cycle_ID), 'MANAGER_FIRST_ALERT:FAILED'); assertEq(mail.sent.length, 0);
    W.at('2026-11-10 17:17');
    assertEq(stages(c.Cycle_ID), 'MANAGER_FIRST_ALERT:SENT'); assertEq(W.alerts(c.Cycle_ID)[0].Retry_Count, 1); assertEq(mail.sent.length, 1);
  });

  def('N10 interrupted send: a stale SENDING row becomes AMBIGUOUS and is never blindly resent', ({ mail }) => {
    W.isolate(OPS); W.at('2026-11-10 17:16');
    const c = W.cycles(OPS)[0];
    tbl(SHEETS.ALERT_LOG).append({ Alert_ID: uuid(), Dedupe_Key: c.Cycle_ID + '|MANAGER_REMINDER', Cycle_ID: c.Cycle_ID, Task_ID: OPS, Alert_Stage: 'MANAGER_REMINDER',
      Status: 'SENDING', Attempted_At: fromLocal('2026-11-10', '18:00'), Unique_Email_Token: 'ALRT-DEADBEEF' });
    W.at('2026-11-10 18:16'); W.at('2026-11-10 18:20');
    assertEq(W.alerts(c.Cycle_ID, 'MANAGER_REMINDER')[0].Status, 'AMBIGUOUS');
    assertEq(mail.sent.length, 1, 'only the first alert ever left');
    assert(tbl(SHEETS.ERROR_LOG).rows().some(e => /AMBIGUOUS/.test(e.Error_Message) && /ALRT-DEADBEEF/.test(e.Error_Message)), 'admin pointed at the token');
  });

  def('SEND_EMAILS gate holds alerts without losing them; production routes to real recipients', ({ mail }) => {
    W.isolate(OPS); setSetting('SEND_EMAILS', 'FALSE');
    W.at('2026-11-10 17:16'); assertEq(mail.sent.length, 0); assertEq(W.alerts().length, 0);
    setSetting('SEND_EMAILS', 'TRUE'); W.at('2026-11-10 17:17'); assertEq(mail.sent.length, 1, 'held alert goes out once enabled');
    setSetting('ENVIRONMENT', 'PRODUCTION'); resetCaches();
    const c = { Manager_Email: MGR };
    assertEq(routeRecipients(STAGE.FIRST, c).to.join(), MGR);
    const e = routeRecipients(STAGE.UNACK, c);
    assertEq(e.to.join(), 'lead1@example.com,lead2@example.com'); assertEq(e.cc.join(), MGR, 'leadership to, manager cc');
  });

  def('N12 timezone mismatch: health check fails, dispatcher refuses to run', ({ mem, mail }) => {
    assert(healthCheck().ok, 'baseline config is healthy: ' + healthCheck().errors);
    mem.spreadsheetTz = 'UTC'; resetCaches();
    const hc = healthCheck();
    assert(!hc.ok && /Timezone mismatch/.test(hc.errors.join()), 'mismatch reported');
    const r = W.at('2026-11-10 17:16');
    assert(r.blocked, 'dispatcher blocked'); assertEq(mail.sent.length, 0); assertEq(tbl(SHEETS.TASK_CYCLES).rows().length, 0);
  });

  def('Health check rejects bad task config (interval 0, unknown assignee)', () => {
    tbl(SHEETS.TASK_MASTER).update(taskById('PORTAL-7D-001').__row, { Interval_Days: 0 });
    tbl(SHEETS.TASK_MASTER).update(taskById('PORTAL-15D-001').__row, { Assigned_To_Email: 'ghost@example.com' }); resetCaches();
    const e = healthCheck().errors.join('|');
    assert(/Interval_Days/.test(e) && /ghost@example\.com/.test(e), e);
  });

  def('Reconciliation recreates a missing next cycle exactly once', () => {
    step('2026-11-10 10:00');
    const c = W.cycles('PORTAL-7D-001')[0];
    W.submit(c.Cycle_ID, { Employee_Proof: 'TCK-1' });
    db().data[SHEETS.TASK_CYCLES].pop(); // simulate the crash between "complete" and "create next"
    assertEq(W.cycles('PORTAL-7D-001').length, 1);
    W.at('2026-11-10 10:05'); W.at('2026-11-10 10:10');
    assertEq(W.cycles('PORTAL-7D-001').length, 2);
    assertEq(W.audits('RECONCILIATION_REPAIRED').length, 1);
  });
}
