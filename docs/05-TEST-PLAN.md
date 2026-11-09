# 05 — Test Plan & Demonstration Evidence

## 1. Purpose

This test plan maps directly to the eight tests in the Allo Innoware assignment. Tests should run in `TEST` mode with a simulated clock and a test email recipient so that no real manager or leadership emails are sent during demonstration.

## 2. Test environment

| Item | Configuration |
|---|---|
| Workbook | A copy of the prototype workbook |
| Environment | `TEST` |
| Test clock | `TEST_NOW_OVERRIDE` |
| Email recipient | One controlled test inbox |
| Real trigger | Disabled or manually invoked during tests |
| Seed tasks | Daily, 7-day, 15-day, and 30-day tasks |
| Evidence | Screenshots of sheet rows, dashboard, Alert_Log, Audit_Log, and test inbox |

### Required test utilities

- `setTestNow(isoDateTime)` — advances the simulated clock.
- `clearTestNow()` — returns the application to the real clock in test mode.
- `runDispatcherForTest()` — calls the dispatcher once.
- `findCycle(taskId, cycleKeyOrDueDate)` — locates a cycle for assertions.
- `countCycleKeys(taskId, cycleKey)` — verifies uniqueness.
- `countAlerts(cycleId, stage)` — verifies alert idempotency.
- `resetTestData()` — removes only rows marked as test data; never deletes production records.

## 3. Seed data

Use synthetic emails in the test workbook or route notifications to a test inbox.

| Task ID | Task | Owner | Cadence | Proof type | Initial due |
|---|---|---|---|---|---|
| `OPS-DAILY-001` | Daily Operations Update | Employee A | Daily working day | `WHATSAPP_ATTESTATION` | Test date at 17:00 |
| `PORTAL-7D-001` | Portal Task A | Employee B | 7 calendar days after completion | `TICKET_ID` | Test date at 17:00 |
| `PORTAL-15D-001` | Portal Task B | Employee C | 15 calendar days after completion | `TICKET_ID` | Test date at 17:00 |
| `PORTAL-30D-001` | Portal Task C | Employee D | 30 calendar days after completion | `TICKET_ID` | Test date at 17:00 |

Create an additional test-only task or cycle when a distinct manager-acknowledgement and leadership path needs to be demonstrated concurrently.

---

## 4. Test 1 — Recurring cycle logic

**Objective:** Complete a 7-day task and prove that the current cycle closes and the next cycle is scheduled automatically.

### Steps

1. Set test time to before the 7-day task's due time.
2. Confirm one initial row exists for `PORTAL-7D-001`.
3. Record the current `Cycle_ID`, `Cycle_Key`, and `Due_At`.
4. In `Task_Cycles`, enter `TCK-TEST-1001` in `Employee_Proof`.
5. Check `Submit_Complete`.
6. Confirm the current row becomes `COMPLETED` and has `Completed_At` and `Completed_By_Source` populated.
7. Confirm one new row exists for the same `Task_ID`, with a new `Cycle_ID` and due date equal to completion date + 7 days, subject to business-day policy.
8. Run the completion handler or dispatcher again.

### Expected result

- The original cycle remains in the ledger as `COMPLETED`.
- The next cycle exists with status `SCHEDULED`.
- Exactly one row exists for the next `Cycle_Key`.
- The repeated processing produces no duplicate cycle.

### Evidence to capture

- Before and after screenshots of the two cycle rows.
- Audit log entries for `CYCLE_COMPLETED` and `CYCLE_CREATED`.

---

## 5. Test 2 — Single-point completion

**Objective:** Prove the employee does not need to update a second tracker.

### Steps

1. Open the employee filter view in `Task_Cycles`.
2. Identify a pending portal task.
3. Enter the Ticket ID in `Employee_Proof` on that row.
4. Optionally enter the portal URL in `Evidence_URL`.
5. Check `Submit_Complete`.
6. Inspect the same row for system-generated completion fields.
7. Inspect the dashboard for the completed status.

### Expected result

- All employee inputs were made on one `Task_Cycles` row.
- The Ticket ID appears in that row and the cycle is completed.
- No second employee report or separate form needs to be updated.
- Dashboard values recalculate from the same canonical ledger.

### Evidence to capture

One screenshot of the employee row showing the Ticket ID and completion timestamp, plus a dashboard screenshot.

---

## 6. Test 3 — Daily WhatsApp task

**Objective:** Demonstrate a low-friction completion method for a task that has no Ticket ID.

### Steps

1. Set test date to a working day.
2. Run the dispatcher.
3. Confirm one `OPS-DAILY-001` cycle exists for that local date.
4. In `Employee_Proof`, enter `Posted 16:42 — daily operations summary`.
5. If the task is configured to require evidence, paste a test Drive URL in `Evidence_URL`.
6. Check `Submit_Complete`.
7. Confirm completion timestamp, actor source, and audit event.
8. Advance test time to the next working date and run the dispatcher.

### Expected result

- The daily cycle can be completed without a Ticket ID.
- The proof is captured as a timestamped employee attestation.
- The next working day's cycle is created exactly once.
- No new daily cycle is created on a non-working date.
- The design documentation clearly states that the MVP does not independently verify the WhatsApp group message.

### Evidence to capture

- Daily cycle before submission.
- Completed row with proof reference.
- Next working day's cycle row.

---

## 7. Test 4 — Same-day manager alert

**Objective:** Create an overdue cycle and prove that the manager receives an email on the same day.

### Steps

1. Create or select a test cycle due at 17:00.
2. Set simulated time to 17:14 and run the dispatcher.
3. Confirm no first alert is sent before the 15-minute grace has passed.
4. Advance simulated time to 17:16 and run the dispatcher.
5. Inspect `Alert_Log` and test inbox.
6. Run the dispatcher again at 17:20.

### Expected result

- First manager alert is eligible at 17:15 and sent on the first monitor pass after that time.
- Email identifies task, employee, due time, proof requirement, and workbook link.
- Exactly one `MANAGER_FIRST_ALERT` record with `Status=SENT` exists.
- Re-running the dispatcher does not send a second first-alert email.

### Evidence to capture

Test inbox email, relevant Alert_Log row, and task cycle row showing overdue state.

---

## 8. Test 5 — Manager acknowledgement

**Objective:** Demonstrate a manager's acknowledgement and prove that the task remains open until the employee completes it.

### Steps

1. Use a cycle for which the manager first-alert email has been sent.
2. Open the manager filter view.
3. Enter a short note in `Manager_Notes`.
4. Check `Manager_Acknowledged`.
5. Confirm `Manager_Ack_At` and manager actor/source fields are set.
6. Confirm that the task `Status` remains `OVERDUE` until employee completion.
7. Complete the task before the next-working-day 11:00 escalation threshold.
8. Run the dispatcher.

### Expected result

- Manager review is timestamped and attributable to a manager identity or an explicitly labelled fallback source.
- The task is not marked completed by manager acknowledgement.
- No leadership unresolved-task email is sent after the employee completes before the resolution threshold.

### Evidence to capture

Manager acknowledgement fields, audit event, and absence of leadership escalation in Alert_Log.

---

## 9. Test 6 — Leadership escalation

**Objective:** Demonstrate both leadership escalation branches.

### Branch A: manager does not acknowledge

1. Let a cycle's manager first alert send.
2. Do not acknowledge it.
3. Advance simulated time to `Manager_Ack_Deadline_At` plus one monitor interval.
4. Run the dispatcher.
5. Confirm a `LEADERSHIP_UNACK_ESCALATION` email is sent once.

Expected: leadership receives the task, employee, due time, first alert time, and explicit reason `MANAGER_NOT_ACKNOWLEDGED`.

### Branch B: manager acknowledges but task remains unresolved

1. Use a separate overdue test cycle.
2. Manager acknowledges and enters action notes.
3. Do not complete the underlying task.
4. Advance simulated time to 11:01 on the next working day.
5. Run the dispatcher.
6. Confirm a `LEADERSHIP_UNRESOLVED_ESCALATION` email is sent once.

Expected: leadership email includes manager acknowledgement time and notes, making clear that the manager reviewed the issue but the work remains open.

### Evidence to capture

Both test emails and the corresponding Alert_Log rows.

---

## 10. Test 7 — Escalation timing logic

**Objective:** Verify boundary times and prove that notifications follow the configured SLA rather than a manually timed demonstration.

| Simulated time | Expected behaviour |
|---|---|
| Due time minus 1 minute | No manager alert |
| Due time + 14 minutes | No manager alert |
| Due time + 15 minutes | Manager alert becomes eligible |
| First alert + 59 business minutes | No manager reminder yet |
| First alert + 60 business minutes | One manager reminder becomes eligible, if acknowledgement is still blank and deadline has not passed |
| Manager acknowledgement deadline minus 1 minute | No leadership unacknowledged escalation |
| Manager acknowledgement deadline | Leadership unacknowledged escalation becomes eligible if manager ack is blank |
| Manager ack exists; next working day 10:59 | No unresolved escalation |
| Manager ack exists; next working day 11:00 | Leadership unresolved escalation becomes eligible if cycle remains open |
| Employee completes before escalation threshold | Escalation is suppressed |

### Expected result

All boundary tests are evaluated using the same `getEffectiveNow()` and business-time helper. No service should call the wall clock directly when the test clock is enabled.

---

## 11. Test 8 — No duplicate alerts or work

**Objective:** Re-run handlers and dispatcher repeatedly and verify idempotency.

### Steps

1. Run the dispatcher five times at the same simulated timestamp.
2. Submit the same completion checkbox event twice.
3. Submit the same manager acknowledgement event twice.
4. Re-run the next-cycle creation routine.
5. Re-run the SLA monitor after the alert has been sent.
6. Check all IDs/keys and alert rows.

### Expected result

- One cycle row per `Cycle_Key`.
- One completion transition and one completion audit event per cycle.
- One next interval cycle per expected next due key.
- One successful alert record per `Cycle_ID + Alert_Stage`.
- No repeated successful manager or leadership email.
- Any interrupted notification remains `AMBIGUOUS` for review rather than being blindly resent.

---

## 12. Negative and boundary tests

| ID | Scenario | Expected outcome |
|---|---|---|
| N01 | Portal completion submitted with blank Ticket ID | Reject; checkbox reset; keep row open |
| N02 | Completion submitted on already completed cycle | No-op; no second cycle or audit completion event |
| N03 | Employee attempts to edit another employee's protected row | Google Sheets blocks edit or script rejects actor |
| N04 | Manager checks acknowledgement without notes | Reject; manager checkbox reset |
| N05 | Daily cycle generator runs five times on same date | Exactly one cycle row |
| N06 | Daily task falls on holiday | No cycle if holiday is configured as non-working |
| N07 | Interval next due date lands on weekend | Roll to next working date if policy is `NEXT_WORKING_DAY` |
| N08 | Task master assignee changes | Existing cycle retains assignee snapshot; new cycles use new assignee |
| N09 | Email quota exhausted | Do not mark alert SENT; log error and retry/review under policy |
| N10 | Script execution interrupted while alert is SENDING | Mark/reconcile as AMBIGUOUS; do not blindly duplicate |
| N11 | Task disabled | No new cycles generated; open cycles follow explicit cancel-or-continue policy |
| N12 | Timezone mismatch | Health check fails and blocks production trigger installation |

## 13. Demo script for evaluator

A short demonstration should follow this exact sequence:

1. Show `Task_Master` with Daily, 7-day, 15-day, and 30-day tasks.
2. Show an employee's `Task_Cycles` filter view and a pending portal row.
3. Enter a Ticket ID and check completion; show the completed row and the next scheduled 7-day cycle.
4. Complete the daily task using the WhatsApp attestation proof; show timestamp and evidence reference.
5. Advance test time beyond due + 15 minutes; run the dispatcher; show manager email.
6. Acknowledge the task from the manager view; show manager timestamp and notes.
7. Advance time to the leadership threshold without completing another test cycle; show the leadership email.
8. Run the dispatcher again; show that no duplicate email or cycle is created.
9. Finish on `Dashboard`, `Alert_Log`, and `Audit_Log` to show monitoring and traceability.

## 14. Acceptance sign-off

| Requirement | Pass condition | Status |
|---|---|---|
| Recurrence | Next 7/15/30-day cycle generated from configured rule | Pending test |
| Single point update | Employee completes from `Task_Cycles` only | Pending test |
| Daily evidence | Attestation and timestamp recorded without Ticket ID | Pending test |
| Same-day manager alert | Email arrives after due grace on same working day | Pending test |
| Manager acknowledgement | Actor/time/note captured | Pending test |
| Leadership escalation | Both escalation branches demonstrated | Pending test |
| SLA boundaries | Before/after threshold tests pass | Pending test |
| Idempotency | Repeated runs create no duplicate successful outcomes | Pending test |

