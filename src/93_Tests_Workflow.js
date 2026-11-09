/* Required assignment tests 1, 2, 3, 5 (acknowledgement part) and negative cases N01-N08, N11. */

// Advance the simulated clock and run the cycle engine (no alert sending: that is the dispatcher's job, tested separately).
function step(s) {
  setTestNow(s); const now = getEffectiveNow();
  createInitialCycles_(now); ensureDailyCycles(now); refreshOpenCycleStatuses(now);
}

function registerWorkflowTests(def) {
  const SEVEN = 'PORTAL-7D-001', OPS = 'OPS-DAILY-001';

  def('Test 1 recurring cycle: completing a 7-day task closes it and schedules the next (+7 from completion)', () => {
    step('2026-11-10 10:00');
    const c0 = W.cycles(SEVEN)[0];
    assertEq(c0.Status, 'SCHEDULED'); assertEq(c0.Cycle_Key, 'PORTAL-7D-001|INTERVAL|2026-11-10|17:00');
    step('2026-11-12 14:20');
    assertEq(W.cycle(c0.Cycle_ID).Status, 'OVERDUE', 'late but still completable');
    const r = W.submit(c0.Cycle_ID, { Employee_Proof: 'TCK-TEST-1001' });
    assert(r.accepted && r.nextCycleId, 'accepted with a next cycle');
    const done = W.cycle(c0.Cycle_ID), next = W.cycle(r.nextCycleId);
    assertEq(done.Status, 'COMPLETED'); assertEq(done.Completed_By_Source, 'EVENT_USER'); assert(done.Completed_At, 'Completed_At stamped');
    assertEq(next.Status, 'SCHEDULED'); assertEq(fmtLocal(next.Due_At), '2026-11-19 17:00 (Asia/Kolkata)');
    assertEq(W.cycles(SEVEN).length, 2, 'history kept, one new row');
    assert(processCompletion(c0.Cycle_ID, actor(EMP.B)).noop, 'replayed submit is a no-op');
    step('2026-11-12 14:25');
    assertEq(W.cycles(SEVEN).length, 2, 'engine re-run creates nothing');
    assertEq(W.audits('CYCLE_COMPLETED', c0.Cycle_ID).length, 1, 'one completion event');
  });

  def('Test 2 single-point completion + N01: Ticket ID is mandatory, everything happens on the one row', () => {
    step('2026-11-10 10:00');
    const c = W.cycles('PORTAL-15D-001')[0];
    const bad = W.submit(c.Cycle_ID, {});
    assert(!bad.accepted && /Ticket ID/.test(bad.message), 'blank ticket rejected');
    assertEq(W.cycle(c.Cycle_ID).Status, 'SCHEDULED'); assertEq(W.cycle(c.Cycle_ID).Submit_Complete, false, 'checkbox reset');
    assertEq(W.audits('COMPLETION_SUBMITTED', c.Cycle_ID).length, 1, 'rejected attempt is audited');
    assert(!W.submit(c.Cycle_ID, { Employee_Proof: 'TCK-1', Evidence_URL: 'not a link' }).accepted, 'malformed URL rejected');
    const ok = W.submit(c.Cycle_ID, { Employee_Proof: 'TCK-1', Evidence_URL: 'https://portal.example.com/t/1' });
    const row = W.cycle(c.Cycle_ID);
    assert(ok.accepted && row.Status === 'COMPLETED' && row.Employee_Proof === 'TCK-1' && row.Completed_At, 'proof and completion on the same row');
  });

  def('Test 3 daily WhatsApp task + N05/N06: one row per working day, attestation recorded, none on closed days', () => {
    step('2026-11-10 09:00'); step('2026-11-10 09:00'); step('2026-11-10 09:01');
    assertEq(W.cycles(OPS).length, 1, 'N05: repeated runs, one row');
    const c = W.cycles(OPS)[0];
    assertEq(c.Cycle_Key, 'OPS-DAILY-001|DAILY|2026-11-10');
    assert(!W.submit(c.Cycle_ID, {}).accepted, 'attestation text required');
    const r = W.submit(c.Cycle_ID, { Employee_Proof: 'Posted 16:42 - daily operations summary' });
    assert(r.accepted && !r.nextCycleId, 'completed; daily next row comes from the generator, not completion');
    assertEq(W.cycle(c.Cycle_ID).Completed_By_Source, 'EVENT_USER');
    tbl(SHEETS.HOLIDAYS).append({ Date: fromLocal('2026-11-17', '00:00'), Holiday_Name: 'Test holiday', Is_Non_Working: true });
    ['2026-11-11 09:00', '2026-11-13 09:00', '2026-11-14 09:00', '2026-11-15 09:00', '2026-11-16 09:00', '2026-11-17 09:00'].forEach(step);
    assertEq(W.cycles(OPS).map(x => localParts(toDate(x.Due_At)).ymd).join(','), '2026-11-10,2026-11-11,2026-11-13,2026-11-16', 'no Sat/Sun/holiday rows (N06)');
  });

  def('N03/N08/N11: wrong employee blocked, assignee change snapshots, disabled tasks stop generating', () => {
    step('2026-11-10 10:00');
    const c = W.cycles(SEVEN)[0];
    tbl(SHEETS.TASK_CYCLES).update(c.__row, { Employee_Proof: 'TCK-9', Submit_Complete: true });
    const wrong = processCompletion(c.Cycle_ID, actor(EMP.C));
    assert(!wrong.accepted && /Only emp\.b/.test(wrong.message), 'N03 other employee rejected');
    tbl(SHEETS.TASK_MASTER).update(taskById(SEVEN).__row, { Assigned_To_Email: EMP.C }); resetCaches(); // N08
    tbl(SHEETS.TASK_CYCLES).update(c.__row, { Submit_Complete: true });
    const ok = processCompletion(c.Cycle_ID, actor('ops@example.com'));
    assert(ok.accepted, 'admin may complete on behalf');
    assertEq(W.cycle(c.Cycle_ID).Assigned_To_Email, EMP.B, 'history keeps the old assignee');
    assertEq(W.cycle(ok.nextCycleId).Assigned_To_Email, EMP.C, 'new cycle uses the new assignee');
    assertEq(W.cycle(ok.nextCycleId).Assigned_To_Name, 'Employee C');
    // N11
    const t30 = taskById('PORTAL-30D-001'), t15 = taskById('PORTAL-15D-001');
    step('2026-11-10 17:05');
    assertEq(W.cycles('PORTAL-15D-001')[0].Status, 'DUE');
    tbl(SHEETS.TASK_MASTER).update(t30.__row, { Is_Active: false }); tbl(SHEETS.TASK_MASTER).update(t15.__row, { Is_Active: false });
    step('2026-11-10 17:06');
    assertEq(W.cycles('PORTAL-15D-001')[0].Status, 'DUE', 'due work of a disabled task continues');
    const r15 = W.submit(W.cycles('PORTAL-15D-001')[0].Cycle_ID, { Employee_Proof: 'TCK-15' });
    assert(r15.accepted && !r15.nextCycleId, 'disabled task: no next cycle');
  });

  def('N11b: a future cycle of a task disabled before its due date is cancelled', () => {
    step('2026-11-10 10:00');
    tbl(SHEETS.TASK_MASTER).update(taskById('PORTAL-30D-001').__row, { Is_Active: false });
    step('2026-11-10 10:05');
    assertEq(W.cycles('PORTAL-30D-001')[0].Status, 'CANCELLED'); assertEq(W.audits('CYCLE_CANCELLED').length, 1);
  });

  def('Test 5 manager acknowledgement + N04: needs a note and the right person; task stays open', () => {
    step('2026-11-10 09:00');
    const c = W.cycles(OPS)[0];
    assert(!W.ack(c.Cycle_ID, 'early').accepted, 'cannot acknowledge a SCHEDULED cycle');
    step('2026-11-10 17:20');
    assertEq(W.cycle(c.Cycle_ID).Status, 'OVERDUE');
    const noNote = W.ack(c.Cycle_ID, '');
    assert(!noNote.accepted && /Manager_Notes/.test(noNote.message), 'N04 note required');
    assertEq(W.cycle(c.Cycle_ID).Manager_Acknowledged, false, 'checkbox reset');
    assert(!W.ack(c.Cycle_ID, 'I am an employee', EMP.A).accepted, 'employee cannot acknowledge');
    const ok = W.ack(c.Cycle_ID, 'Called employee; ETA 18:00');
    const row = W.cycle(c.Cycle_ID);
    assert(ok.accepted && row.Manager_Ack_At && row.Manager_Ack_By_Email === MGR && row.Manager_Ack_Source === 'EVENT_USER', 'who/when recorded');
    assertEq(row.Status, 'OVERDUE', 'acknowledgement is not completion');
    assert(W.ack(c.Cycle_ID, 'Called employee; ETA 18:00').noop, 'second tick is a no-op');
    assertEq(W.audits('MANAGER_ACKNOWLEDGED', c.Cycle_ID).length, 1);
  });

  def('Proof contracts: WhatsApp evidence URL policy and URL_OR_NOTE', () => {
    step('2026-11-10 09:00');
    const c = W.cycles(OPS)[0];
    setSetting('WHATSAPP_EVIDENCE_URL_REQUIRED', 'TRUE'); resetCaches();
    assert(!W.submit(c.Cycle_ID, { Employee_Proof: 'Posted 16:42' }).accepted, 'URL now required');
    assert(W.submit(c.Cycle_ID, { Evidence_URL: 'https://drive.example.com/shot' }).accepted, 'proof + URL accepted');
    assertEq(validateProof({ Required_Proof_Type: 'URL_OR_NOTE' }, null) !== '', true, 'URL_OR_NOTE needs something');
    assertEq(validateProof({ Required_Proof_Type: 'URL_OR_NOTE', Employee_Notes: 'done' }, null), '');
    assertEq(validateProof({ Required_Proof_Type: 'NONE' }, null), '');
  });
}
