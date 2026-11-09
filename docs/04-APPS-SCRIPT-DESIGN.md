# 04 — Apps Script Design & Automation Contracts

## 1. Purpose

This document defines how to translate the spreadsheet design into a maintainable Apps Script project. It provides module boundaries, trigger responsibilities, function contracts, pseudocode, concurrency rules, notification behaviour, and test hooks.

The implementation should keep business rules in small services rather than one large `onEdit` function.

## 2. Project layout

Recommended Apps Script files:

| File | Responsibility |
|---|---|
| `00_Constants.gs` | Sheet names, column maps, status enums, alert-stage enums |
| `01_ConfigService.gs` | Read/validate settings, team directory, active task definitions |
| `02_SheetRepository.gs` | Batch reads/writes, find by ID/key, append rows, update rows |
| `03_CalendarService.gs` | Timezone, working-day, holiday, business-minute calculations |
| `04_RecurrenceService.gs` | Daily cycle generation and interval next-due calculation |
| `05_CycleService.gs` | Initial cycle creation, cycle uniqueness, status refresh, cancellation |
| `06_CompletionService.gs` | Proof validation and cycle completion transaction |
| `07_ManagerActionService.gs` | Manager acknowledgement validation and audit |
| `08_SlaService.gs` | Alert eligibility, reminder deadlines, leadership escalation rules |
| `09_NotificationService.gs` | Email templates, dedupe, send state, recipient routing |
| `10_AuditService.gs` | Append-only audit event helper |
| `11_EventHandlers.gs` | Installable `onEdit` handler and menu actions |
| `12_Dispatcher.gs` | Scheduled monitor/orchestration |
| `13_ReconciliationService.gs` | Detect and repair incomplete internal transitions |
| `14_AdminMenu.gs` | Setup, health checks, manual monitor, test functions |
| `15_TestHarness.gs` | Simulated clock and test scenario runner |

## 3. Trigger model

Install only the required triggers:

| Trigger | Function | Frequency | Purpose |
|---|---|---|---|
| Installable spreadsheet edit | `handleTaskCyclesEdit(e)` | On edit | Detect employee completion checkbox and manager acknowledgement checkbox |
| Time-driven | `runDispatcher()` | Every 5 minutes | Create today's daily cycles, update statuses, process SLA alerts, and reconcile |
| Optional open trigger | `addTaskMenu()` | On open | Adds user-friendly menu actions; not required for core state correctness |

`installAutomationTriggers()` must be idempotent: it should remove or reuse existing triggers for the owned handlers before creating replacements. Do not accidentally install multiple dispatcher triggers.

### Trigger owner

Install the triggers while signed in as a designated operations-owned Google account. Installable triggers run as their creator, so emails will be sent under that account's authorization. Document this owner and maintain access continuity.

### Timing

A 5-minute trigger is a polling interval, not a guaranteed exact execution time. The alert logic must compare the current clock against stored due/ack thresholds each time it runs. The monitor must be safe to run more than once.

## 4. Constants and column mapping

Keep all column references in one file. Do not scatter hard-coded column numbers.

Example pattern:

```javascript
const CYCLE_COL = {
  CYCLE_ID: 1,
  CYCLE_KEY: 2,
  TASK_ID: 3,
  CYCLE_NO: 4,
  TASK_NAME: 5,
  ASSIGNED_TO_EMAIL: 6,
  ASSIGNED_TO_NAME: 7,
  MANAGER_EMAIL: 8,
  DUE_AT: 9,
  STATUS: 10,
  PRIORITY: 11,
  REQUIRED_PROOF_TYPE: 12,
  EMPLOYEE_PROOF: 13,
  EVIDENCE_URL: 14,
  EMPLOYEE_NOTES: 15,
  SUBMIT_COMPLETE: 16,
  COMPLETED_AT: 17,
  COMPLETED_BY_EMAIL: 18,
  COMPLETED_BY_SOURCE: 19,
  RECURRENCE_MODE: 20,
  MANAGER_ACKNOWLEDGED: 21,
  MANAGER_ACK_AT: 22,
  MANAGER_ACK_BY_EMAIL: 23,
  MANAGER_ACK_SOURCE: 24,
  MANAGER_NOTES: 25,
  MANAGER_ACK_DEADLINE_AT: 26,
  MANAGER_REMINDER_SENT_AT: 27,
  LEADERSHIP_ESCALATED_AT: 28,
  LAST_ALERT_STAGE: 29,
  CREATED_AT: 30,
  UPDATED_AT: 31,
  TASK_VERSION: 32,
  SYSTEM_ERROR: 33,
  RESOLVED_AFTER_ESCALATION_AT: 34,
};
```

This map assumes the exact `Task_Cycles` column order in `02-LLD.md`. If the sheet schema changes, update the map and tests together.

## 5. Dispatcher orchestration

`runDispatcher()` is the scheduled control loop.

Pseudocode:

```text
function runDispatcher():
    acquire script lock
    execution_id = generate UUID
    now = getEffectiveNow()  // Settings or TEST_NOW_OVERRIDE

    validate required sheets and settings
    ensureDailyCyclesForCurrentBusinessDate(now)
    refreshOpenCycleStatuses(now)
    processManagerFirstAlerts(now)
    processManagerReminders(now)
    processLeadershipEscalations(now)
    reconcileCycleAndAlertIntegrity(now)
    updateLastHealthCheck(now)

    release lock
```

If the lock cannot be acquired within the configured timeout, log a warning and exit. Do not run a second dispatcher concurrently.

## 6. Event handler

The installable edit handler should inspect only relevant edits on `Task_Cycles`.

```text
function handleTaskCyclesEdit(e):
    if event missing or sheet is not Task_Cycles: return
    edited column = e.range column

    if edited column == SUBMIT_COMPLETE and new value is TRUE:
        resolve Cycle_ID from edited row
        processCompletion(cycle_id, resolveActor(e))
        return

    if edited column == MANAGER_ACKNOWLEDGED and new value is TRUE:
        resolve Cycle_ID from edited row
        processManagerAcknowledgement(cycle_id, resolveActor(e))
        return
```

Do not process every edit in the workbook. Employee edits to the proof field should not send emails or create cycles; the explicit submit checkbox is the transition event.

## 7. Actor identity resolution

Identity handling must be deliberate:

1. Prefer a verified editor email from the event context or an authenticated user-executed UI, where available.
2. Test `Session.getActiveUser().getEmail()` in the actual Workspace domain and execution context.
3. If row-level protected ranges allow only the assigned employee to edit the employee input cells, a fallback may infer the actor from the assigned employee only when that protection is demonstrably active. Set `Completed_By_Source=ASSIGNMENT_PROTECTION_FALLBACK` so the audit does not claim the identity was independently read.
4. If no trustworthy identity can be obtained, set `Completed_By_Source=UNVERIFIED` and do not write a fabricated email address.
5. Manager acknowledgement must use the same pattern and should be restricted to the configured manager.

A time-driven installable trigger runs as its creator, not as the employee who last edited the sheet. Do not use `Session.getEffectiveUser()` in the scheduled dispatcher to infer the employee actor.

## 8. Completion service contract

Signature:

```text
processCompletion(cycleId, actorContext) -> {accepted, message, cycleId, nextCycleId?}
```

Algorithm:

```text
acquire script lock
cycle = repository.findCycleById(cycleId)
if cycle not found: reject
if cycle.status == COMPLETED: return accepted=true, message='Already completed; no-op'
if cycle.status == CANCELLED: reject
validate actor permissions
validate proof according to Required_Proof_Type
if invalid:
    set Submit_Complete=false
    show/record validation message
    return rejected

now = getEffectiveNow()
update current cycle:
    Status = COMPLETED
    Completed_At = now
    Completed_By_Email = resolved actor email or blank
    Completed_By_Source = resolved provenance
    Updated_At = now
append Audit_Log event CYCLE_COMPLETED

if task is interval-based:
    nextDueAt = recurrenceService.calculateNextDue(taskSnapshot, cycle, now)
    nextCycleKey = recurrenceService.makeCycleKey(taskId, nextDueAt)
    if no existing cycle with nextCycleKey:
        append next scheduled cycle
        append Audit_Log event CYCLE_CREATED

set Resolved_After_Escalation_At = now if Leadership_Escalated_At is populated
release lock
return success
```

### Important completion properties

- `cycleId` is the durable identifier; do not rely on a selected row index after any sheet sort/filter operation.
- Status is checked after acquiring the lock.
- The current row is updated only once.
- A repeated submission after success is a no-op.
- Next cycle insertion checks `Cycle_Key` uniqueness.
- For daily tasks, do not create tomorrow's cycle inside this function; the daily dispatcher creates it on the next working date.

## 9. Manager acknowledgement service contract

Signature:

```text
processManagerAcknowledgement(cycleId, actorContext) -> {accepted, message}
```

Algorithm:

1. Acquire lock.
2. Re-read row by `Cycle_ID`.
3. Confirm actor is configured manager or approved manager/admin.
4. Require `Manager_Notes`.
5. If `Manager_Ack_At` already has a value, no-op.
6. Set `Manager_Ack_At`, actor email/source, and `Updated_At`.
7. Append `MANAGER_ACKNOWLEDGED` event.
8. Do not set `Status=COMPLETED`.
9. Release lock.

## 10. Recurrence service contracts

```text
ensureDailyCyclesForCurrentBusinessDate(now)
createInitialCyclesForActiveTasks(now)
calculateNextDue(taskSnapshot, completedCycle, completedAt)
makeCycleKey(taskId, frequencyType, dueAt)
nextWorkingDate(date)
isWorkingDay(date)
addBusinessMinutes(startAt, businessMinutes)
```

`ensureDailyCyclesForCurrentBusinessDate` may execute every five minutes. It must create at most one row per task per local working date.

`createInitialCyclesForActiveTasks` is an admin/setup function. For an active interval task with no cycle history, create one initial cycle based on `Initial_Due_At`. It should not create an additional initial cycle on each dispatcher run.

## 11. SLA service contracts

```text
refreshOpenCycleStatuses(now)
getManagerAlertEligibleCycles(now)
getManagerReminderEligibleCycles(now)
getLeadershipUnackEligibleCycles(now)
getLeadershipUnresolvedEligibleCycles(now)
```

A cycle is not eligible for any future alert if:

- status is `COMPLETED` or `CANCELLED`;
- the corresponding `Dedupe_Key` already has status `SENT`;
- a corresponding alert is currently `SENDING` or `AMBIGUOUS`;
- the task has been disabled and policy says no new alerts should be generated (existing open cycles remain governed by the explicit cancellation policy).

## 12. Notification service contract

Signature:

```text
sendAlertOnce(cycle, alertStage, recipients, emailContent) -> {status, alertId}
```

Algorithm:

1. Compute `dedupeKey = cycleId + '|' + alertStage`.
2. Search `Alert_Log` for the dedupe key.
3. If status is `SENT`, return without sending.
4. If status is `SENDING` or `AMBIGUOUS`, do not blindly send again.
5. If no record exists, append a `SENDING` record with unique email token.
6. Call MailApp/GmailApp once.
7. On success, update the same alert record to `SENT`, set `Sent_At`, and update the cycle's alert timestamp/stage.
8. On a known exception, set `FAILED`, record the error, and retry only under a bounded policy.
9. If execution interruption makes send outcome uncertain, set/leave `AMBIGUOUS` and require reconciliation rather than automatic duplicate delivery.

### Email quotas

Before a batch of sends, check `MailApp.getRemainingDailyQuota()`. If quota is insufficient, log a `WARN` or `ERROR` and leave alerts in a retriable state. Do not silently mark them as sent.

## 13. Reconciliation service

Run during every dispatcher pass, or less frequently if volume grows.

Checks:

- duplicate `Cycle_Key` values;
- active interval task with a completed latest cycle but missing expected next cycle;
- completed cycle with blank `Completed_At`;
- manager acknowledgement checkbox set but missing timestamp;
- alert marked `SENT` with missing `Sent_At`;
- `SENDING` alerts older than a defined threshold;
- `OVERDUE` cycle where no manager alert record exists after the alert threshold;
- cycle row with invalid task or team reference.

Safe repairs:

- fill a missing next cycle only after checking its deterministic key;
- set a missing audit event only if an event key or equivalent uniqueness rule proves it was not written;
- mark an interrupted notification as `AMBIGUOUS`; do not resend without checking its unique email token in the sending account's Sent mailbox or an administrator's review.

Every repair must create a `RECONCILIATION_REPAIRED` audit event.

## 14. Concurrency and batch I/O

- Use `LockService.getScriptLock()` for `processCompletion`, `processManagerAcknowledgement`, and `runDispatcher`.
- Hold the lock only for the state transition, not while waiting on a human or doing unrelated long work.
- For normal small-team use, a single dispatcher lock is sufficient.
- Read whole data ranges once, build maps in memory, and write contiguous ranges in batches.
- Use `TextFinder` or an in-memory index for IDs; avoid scanning a column separately for each row in a loop.
- Never use Apps Script custom spreadsheet functions for business state transitions.

## 15. Admin menu

Recommended custom menu:

- `Tasks → Run Health Check`
- `Tasks → Create Initial Cycles`
- `Tasks → Run Dispatcher Now`
- `Tasks → Install/Repair Triggers`
- `Tasks → Run Demo Test Suite`
- `Tasks → Reset Demo Data` (test mode only)

The menu must check the active user's role before executing admin-only operations.

## 16. Test-mode clock

Implement `getEffectiveNow()`:

```text
if ENVIRONMENT == TEST and TEST_NOW_OVERRIDE is populated:
    return parse(TEST_NOW_OVERRIDE)
else:
    return current date/time
```

All timing calculations must call this function. Do not call `new Date()` separately inside multiple business-rule functions, or simulated-time tests will be inconsistent.

In `TEST` mode:

- route all outgoing emails to `TEST_RECIPIENT_EMAIL`;
- add `[TEST]` to email subjects;
- prevent real leadership notifications;
- allow the clock to be advanced to just before/after deadlines;
- disable production triggers or use only a manual test runner.

## 17. Logging standards

Every log event should carry an `Execution_ID`. Use one short, structured error message and enough context to reproduce the issue. Do not log passwords, tokens, private portal session data, or personal information not required for the workflow.

## 18. Production hardening checklist

- [ ] All settings validate before trigger installation.
- [ ] Spreadsheet and script timezones match.
- [ ] Trigger owner is an operations-controlled account.
- [ ] Installable edit trigger and dispatcher trigger are installed exactly once.
- [ ] Test mode routes all emails to a test inbox.
- [ ] Production email sending requires an explicit configuration change.
- [ ] User identity tested in the real Workspace domain.
- [ ] System columns and historical rows protected.
- [ ] Back-up/export process documented.
- [ ] Error log reviewed and quota monitoring enabled.

