/* Cycle ledger operations: create (idempotent by Cycle_Key), generate daily/initial cycles, refresh status.
 * Internal helpers: they do NOT take the script lock; entry points (dispatcher, completion, menu) do. */

function findCycle(id) { return tbl(CYCLES).rows().find(c => c.Cycle_ID === id) || null; }

/** Appends one snapshotted cycle unless its Cycle_Key already exists. Returns the saved row or null. */
function createCycle(task, dueAt, key, now) {
  const all = tbl(CYCLES).rows();
  if (all.some(c => c.Cycle_Key === key)) return null;
  const owner = memberByEmail(task.Assigned_To_Email), p = taskParams(task);
  const rec = {
    Cycle_ID: uuid(), Cycle_Key: key, Task_ID: task.Task_ID,
    Cycle_No: all.filter(c => c.Task_ID === task.Task_ID).reduce((m, c) => Math.max(m, num(c.Cycle_No, 0)), 0) + 1,
    Task_Name_Snapshot: task.Task_Name, Assigned_To_Email: str(task.Assigned_To_Email), Assigned_To_Name: owner ? owner.Display_Name : '',
    Manager_Email: str(task.Manager_Email), Due_At: dueAt, Status: dueAt > now ? STATUS.SCHEDULED : STATUS.DUE,
    Priority: task.Priority, Required_Proof_Type: task.Required_Proof_Type, Submit_Complete: false,
    Recurrence_Mode_Snapshot: task.Recurrence_Mode, Manager_Acknowledged: false,
    Manager_Ack_Deadline_At: ackDeadline(dueAt, p), Created_At: now, Updated_At: now, Task_Version_Snapshot: task.Task_Version,
  };
  const saved = tbl(CYCLES).append(rec);
  audit('CYCLE_CREATED', { cycleId: rec.Cycle_ID, taskId: task.Task_ID, to: rec.Status, details: { key, due: fmtLocal(dueAt) } });
  return saved;
}

/** One row per active DAILY task per working date. Safe to call every few minutes. */
function ensureDailyCycles(now) {
  const today = localParts(now).ymd; let n = 0;
  activeTasks().filter(t => t.Frequency_Type === 'DAILY').forEach(t => {
    const start = toDate(t.Initial_Due_At);
    if (start && today < localParts(start).ymd) return;
    if (toBool(t.Working_Days_Only) && !isWorkingDay(today)) return;
    if (createCycle(t, fromLocal(today, taskParams(t).dueTime), keyDaily(t.Task_ID, today), now)) n++;
  });
  return n;
}

/** First cycle for each active INTERVAL task that has no history yet (so a newly added task just works). */
function createInitialCycles_(now) {
  let n = 0; const have = {}; tbl(CYCLES).rows().forEach(c => { have[c.Task_ID] = true; });
  activeTasks().filter(t => t.Frequency_Type === 'INTERVAL' && !have[t.Task_ID]).forEach(t => {
    const due = toDate(t.Initial_Due_At);
    if (!due) { logError('createInitialCycles', 'Initial_Due_At missing for ' + t.Task_ID, '', 'ERROR'); return; }
    if (createCycle(t, due, keyInterval(t.Task_ID, due), now)) n++;
  });
  return n;
}
function createInitialCycles() { resetCaches(); return withLock(() => createInitialCycles_(getEffectiveNow())); }

/** SCHEDULED -> DUE -> OVERDUE by the clock; future cycles of disabled tasks are cancelled (open ones continue). */
function refreshOpenCycleStatuses(now) {
  let n = 0;
  tbl(CYCLES).rows().filter(c => OPEN_STATUSES.indexOf(c.Status) >= 0).forEach(c => {
    const due = toDate(c.Due_At); if (!due) return;
    const t = taskById(c.Task_ID), p = taskParams(t || {}), patch = {};
    let status = now >= new Date(due.getTime() + p.graceMin * 60000) ? STATUS.OVERDUE : now >= due ? STATUS.DUE : STATUS.SCHEDULED;
    if (status === STATUS.SCHEDULED && t && !toBool(t.Is_Active)) status = STATUS.CANCELLED;
    if (status !== c.Status) patch.Status = status;
    if (isBlank(c.Manager_Ack_Deadline_At)) patch.Manager_Ack_Deadline_At = ackDeadline(due, p);
    if (!t && isBlank(c.System_Error)) patch.System_Error = 'Task_ID not found in Task_Master';
    if (!Object.keys(patch).length) return;
    patch.Updated_At = now; tbl(CYCLES).update(c.__row, patch);
    if (status === STATUS.CANCELLED) audit('CYCLE_CANCELLED', { cycleId: c.Cycle_ID, taskId: c.Task_ID, from: c.Status, to: status, details: { reason: 'task disabled before due date' } });
    if (patch.Status) n++;
  });
  return n;
}
