/* Edit-trigger wiring, driven through minimal fakes of the Sheets event/range objects. */

function registerHandlerTests(def) {
  const fakeSheet = () => ({
    getName: () => SHEETS.TASK_CYCLES,
    getRange: (r, c) => ({ getValue: () => tbl(SHEETS.TASK_CYCLES).rows().find(x => x.__row === r)[HEADERS[SHEETS.TASK_CYCLES][c - 1]] }),
  });
  const ev = (r0, nRows, col, email) => ({
    range: { getSheet: fakeSheet, getRow: () => r0, getNumRows: () => nRows, getColumn: () => col, getNumColumns: () => 1 },
    user: email ? { getEmail: () => email } : null,
  });
  const withToast = fn => { const prev = _toast, msgs = []; setToast(m => msgs.push(m)); try { fn(msgs); } finally { setToast(prev); } };

  def('edit trigger: pasting ticks on several rows processes each row; failures toast the reason and reset the box', () => {
    step('2026-11-10 10:00'); // rows 2,3,4 = 7D, 15D, 30D
    const rows = tbl(SHEETS.TASK_CYCLES).rows();
    tbl(SHEETS.TASK_CYCLES).update(rows[0].__row, { Employee_Proof: 'TCK-A', Submit_Complete: true });
    tbl(SHEETS.TASK_CYCLES).update(rows[1].__row, { Employee_Proof: 'TCK-B', Submit_Complete: true });
    tbl(SHEETS.TASK_CYCLES).update(rows[2].__row, { Submit_Complete: true }); // no ticket
    withToast(msgs => {
      handleTaskCyclesEdit(ev(2, 3, HEADERS[SHEETS.TASK_CYCLES].indexOf('Submit_Complete') + 1, 'ops@example.com'));
      assertEq(W.cycle(rows[0].Cycle_ID).Status, 'COMPLETED'); assertEq(W.cycle(rows[1].Cycle_ID).Status, 'COMPLETED');
      assertEq(W.cycle(rows[2].Cycle_ID).Status, 'SCHEDULED'); assertEq(W.cycle(rows[2].Cycle_ID).Submit_Complete, false);
      assert(/Ticket ID/.test(msgs.join()), 'toast tells the employee why: ' + msgs.join());
    });
  });

  def('edit trigger: ignores other columns; unreadable identity is recorded as UNVERIFIED, never guessed', () => {
    step('2026-11-10 10:00');
    const c = W.cycles('PORTAL-7D-001')[0];
    tbl(SHEETS.TASK_CYCLES).update(c.__row, { Employee_Proof: 'TCK-1', Submit_Complete: true });
    withToast(() => {
      handleTaskCyclesEdit(ev(c.__row, 1, HEADERS[SHEETS.TASK_CYCLES].indexOf('Employee_Proof') + 1, EMP.B));
      assertEq(W.cycle(c.Cycle_ID).Status, 'SCHEDULED', 'typing a proof is not a submission');
      handleTaskCyclesEdit(ev(c.__row, 1, HEADERS[SHEETS.TASK_CYCLES].indexOf('Submit_Complete') + 1, null));
    });
    const done = W.cycle(c.Cycle_ID);
    assertEq(done.Status, 'COMPLETED'); assertEq(done.Completed_By_Source, 'UNVERIFIED'); assertEq(done.Completed_By_Email, '');
  });

  def('manager ack fails closed: an unverifiable actor cannot acknowledge (it would suppress escalation)', () => {
    step('2026-11-10 17:30'); // 7D task due 17:00 -> OVERDUE
    const c = W.cycles('PORTAL-7D-001')[0];
    tbl(SHEETS.TASK_CYCLES).update(c.__row, { Manager_Notes: 'Chasing the employee', Manager_Acknowledged: true });
    const r = processManagerAcknowledgement(c.Cycle_ID, { email: '', source: 'UNVERIFIED' });
    const after = W.cycle(c.Cycle_ID);
    assertEq(r.accepted, false); assertEq(after.Manager_Acknowledged, false); assert(isBlank(after.Manager_Ack_At), 'no ack time recorded');
  });

  def('actor resolution: assignment-protection fallback is only used when protection is declared active', () => {
    assertEq(resolveActor({ user: null }, EMP.B).source, 'UNVERIFIED');
    setSetting('ROW_PROTECTION_ACTIVE', 'TRUE'); resetCaches();
    const a = resolveActor({ user: null }, EMP.B);
    assertEq(a.source, 'ASSIGNMENT_PROTECTION_FALLBACK'); assertEq(a.email, EMP.B);
  });
}
