/* In-repo self-tests. Run in Node (`npm test`) or in Apps Script (menu: Tasks > Run Demo Test Suite).
 * They swap in an in-memory store and a mock mailer for the run, so the live workbook is never touched. */

class MockMailer {
  constructor() { this.sent = []; this.left = 100; this.failNext = false; }
  quota() { return this.left; }
  send(m) {
    if (this.failNext) { this.failNext = false; throw new Error('simulated Gmail failure'); }
    this.sent.push(m); this.left -= m.to.length + m.cc.length;
  }
}

function assert(cond, msg) { if (!cond) throw new Error('Assertion failed: ' + msg); }
function assertEq(actual, expected, msg) {
  if (actual !== expected) throw new Error((msg || 'assertEq') + ': expected ' + JSON.stringify(expected) + ' but got ' + JSON.stringify(actual));
}

// Test-clock helpers (docs/05-TEST-PLAN.md "required test utilities").
function setTestNow(s) { setSetting('TEST_NOW_OVERRIDE', s); resetCaches(); }
function clearTestNow() { setSetting('TEST_NOW_OVERRIDE', ''); resetCaches(); }
function runDispatcherForTest() { return runDispatcher(); }

/** Fresh in-memory world: team, the four tasks (first due Tue 2026-11-10 17:00), TEST mode, mail on. */
function freshWorld() {
  const mem = new MemStore(); setStore(mem); resetCaches();
  const mail = new MockMailer(); setMailer(mail);
  seedSettings(); seedTeam(); seedTasks('2026-11-10');
  setSetting('SEND_EMAILS', 'TRUE'); setSetting('TEST_RECIPIENT_EMAIL', 'inbox@example.com'); setSetting('AUTOMATION_OWNER_EMAIL', 'ops@example.com');
  setTestNow('2026-11-10 09:00');
  return { mem, mail };
}

const EMP = { A: 'emp.a@example.com', B: 'emp.b@example.com', C: 'emp.c@example.com', D: 'emp.d@example.com' };
const MGR = 'mgr@example.com';
const actor = email => ({ email, source: SOURCE.EVENT_USER });

const W = {
  cycles: taskId => tbl(SHEETS.TASK_CYCLES).rows().filter(c => c.Task_ID === taskId),
  cycle: id => tbl(SHEETS.TASK_CYCLES).rows().find(c => c.Cycle_ID === id),
  alerts: (cycleId, stage) => tbl(SHEETS.ALERT_LOG).rows().filter(a => (!cycleId || a.Cycle_ID === cycleId) && (!stage || a.Alert_Stage === stage)),
  audits: (type, cycleId) => tbl(SHEETS.AUDIT_LOG).rows().filter(a => a.Event_Type === type && (!cycleId || a.Cycle_ID === cycleId)),
  /** Keep one task active so alert counts are not mixed with the other three. */
  isolate: id => { tbl(SHEETS.TASK_MASTER).rows().forEach(t => { if (t.Task_ID !== id) tbl(SHEETS.TASK_MASTER).update(t.__row, { Is_Active: false }); }); resetCaches(); },
  /** What the employee does on the row: type the proof, tick Submit_Complete. */
  submit: (cycleId, patch, who) => {
    const c = W.cycle(cycleId); tbl(SHEETS.TASK_CYCLES).update(c.__row, Object.assign({ Submit_Complete: true }, patch || {}));
    return processCompletion(cycleId, actor(who || c.Assigned_To_Email));
  },
  /** What the manager does on the row: type a note, tick Manager_Acknowledged. */
  ack: (cycleId, notes, who) => {
    const c = W.cycle(cycleId); tbl(SHEETS.TASK_CYCLES).update(c.__row, { Manager_Acknowledged: true, Manager_Notes: notes });
    return processManagerAcknowledgement(cycleId, actor(who || c.Manager_Email));
  },
  at: s => { setTestNow(s); return runDispatcher(); },
};

function runSelfTests() {
  const prevStore = _store, prevMailer = _mailer, tests = [];
  const def = (name, fn) => tests.push({ name, fn });
  [registerCalendarTests, registerRecurrenceTests].forEach(r => r(def)); // each tests file exposes one register*Tests(def)
  let passed = 0; const failures = [];
  try {
    tests.forEach(t => {
      try { const w = freshWorld(); t.fn(w); passed++; logLine('PASS  ' + t.name); }
      catch (e) { failures.push(t.name + ' :: ' + e.message); logLine('FAIL  ' + t.name + '\n      ' + e.message); }
    });
  } finally { setStore(prevStore); setMailer(prevMailer); resetCaches(); }
  logLine(passed + '/' + tests.length + ' passed' + (failures.length ? ', ' + failures.length + ' FAILED' : ''));
  return { passed, failed: failures.length, total: tests.length, failures };
}
