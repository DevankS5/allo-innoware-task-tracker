# 03 — Recurrence, Daily Evidence, Manager SLA & Leadership Escalation

## 1. Purpose

This document settles the operating rules that determine when a task becomes due again, what constitutes completion, when the manager is notified, what the manager must do, and when leadership is informed.

All values below are proposed defaults, not immutable business policy. Store them in `Task_Master` or `Settings` so they can be changed without rewriting the Apps Script.

## 2. Calendar model

| Setting | Default |
|---|---|
| Timezone | `Asia/Kolkata` |
| Work days | Monday–Friday |
| Holidays | `Holiday_Calendar` |
| Work window | 09:30–18:30 |
| Default employee due time | 17:00 |
| Default first-alert grace | 15 minutes |
| Time-trigger poll interval | 5 minutes |

### Calendar rules

1. The spreadsheet timezone and Apps Script project timezone must match.
2. A daily task creates one cycle per working date.
3. An interval task uses calendar-day intervals by default, then rolls a due date forward if it lands on a non-working day and the task is configured for `NEXT_WORKING_DAY`.
4. If a task is intended to be due on weekends, configure it with `Working_Days_Only=FALSE` and `KEEP_DATE`.
5. The system must use one shared `isWorkingDay(date)` helper. Do not hard-code weekday logic in multiple services.

## 3. Recurrence policies

### 3.1 `DAILY_WORKDAY`

Use for the Daily Operations Update.

- Create a new cycle for each working date.
- `Cycle_Key = Task_ID|DAILY|YYYY-MM-DD`.
- Due time is the configured daily time, e.g. 17:00.
- If the employee completes today's task at 16:00, tomorrow's cycle is still created tomorrow by the daily generator.
- If today's task is not completed, tomorrow's cycle is still created on the next working date. The old cycle remains overdue, so the manager can see the backlog.
- Running the daily generator repeatedly must not create a second row for the same date.

### 3.2 `AFTER_COMPLETION` — recommended default for 7/15/30-day tasks

The next due date is calculated from the completion date, not from the original planned due date.

Formula:

`next_due_date = local_completion_date + interval_days`

Then apply non-working-day adjustment and configured due time.

Example:

| Field | Value |
|---|---|
| Task | Portal Task A |
| Interval | 7 calendar days |
| Original due | 10 Nov, 17:00 |
| Actual completion | 12 Nov, 14:20 |
| Next due | 19 Nov, 17:00 (subject to holiday/weekend adjustment) |

Why this is the default: if an employee completes a cycle late, the new cycle should not become due immediately because the original schedule date has already passed. The employee receives a full configured interval after completion.

### 3.3 `FIXED_CADENCE` — optional

Use when the business needs a stable calendar rhythm regardless of completion time.

- The original due-date anchor remains fixed.
- Next due date is the first scheduled occurrence after the actual completion date.
- Missed schedule slots are skipped rather than generating several simultaneous pending cycles.
- The skipped-slot count should be written to `Audit_Log` or a cycle note for transparency.

Example: a task is due every 15 days on a fixed cadence. If an occurrence due on 1 November is completed on 20 November, the next occurrence is the first 15-day anchored date after 20 November, not 16 November.

### 3.4 How the next cycle is created

On valid completion of an interval cycle:

1. Mark the current cycle `COMPLETED`.
2. Calculate next due date using the stored recurrence mode snapshot.
3. Generate the next `Cycle_Key`.
4. Search `Task_Cycles` for that key.
5. If absent, append one `SCHEDULED` cycle row.
6. If present, no-op and add a reconciliation note if necessary.

The employee never enters or calculates the next due date.

## 4. Completion proof by task type

### 4.1 Portal tasks — `TICKET_ID`

Required employee action:

1. Complete the task on the portal.
2. Copy the resulting Ticket ID.
3. Paste it into `Employee_Proof` on the corresponding `Task_Cycles` row.
4. Optionally paste the ticket URL in `Evidence_URL`.
5. Check `Submit_Complete`.

Validation:

- Ticket ID must be non-empty after trimming whitespace.
- The system should reject an empty Ticket ID.
- Do not require the employee to paste the Ticket ID into another tab or form.
- If a ticket URL is mandatory, set that task's proof policy accordingly.

### 4.2 Daily WhatsApp update — `WHATSAPP_ATTESTATION`

Recommended MVP workflow:

1. Employee posts the expected update in the designated WhatsApp group.
2. Employee enters a compact reference in `Employee_Proof`, for example: `Posted 16:42 — daily operations summary`.
3. If the task is marked evidence-required, employee uploads a screenshot to an approved Drive folder and pastes the share link in `Evidence_URL`.
4. Employee checks `Submit_Complete`.
5. Script stores the attestation, actor identity source, and exact completion timestamp.

This is deliberately a single-row update. The employee does not need a second tracker. The evidence URL is an optional or policy-driven extra field, not a duplicate completion submission.

**Trust boundary:** the MVP captures an attestation and supplied evidence reference. It does not independently verify that the message exists in the WhatsApp group. A screenshot can be reviewed by a manager, but a screenshot is still user-supplied evidence. For stronger verification, the company must approve a supported integration or move the operational update to a platform with auditable message events.

### 4.3 Other proof types

- `URL_OR_NOTE`: at least one valid URL or meaningful note is required.
- `NONE`: no proof field required; the task still needs an explicit submit action.

## 5. Status definitions

| Status | Meaning | Employee action |
|---|---|---|
| `SCHEDULED` | A future cycle exists, but its due timestamp has not arrived | No action yet |
| `DUE` | Due timestamp has arrived; grace window has not yet elapsed | Complete now |
| `OVERDUE` | Due time plus configured alert grace has passed without completion | Complete immediately; manager alert may have fired |
| `COMPLETED` | Valid completion accepted and timestamped | No further action on this cycle |
| `CANCELLED` | Authorised cancellation | No employee action |

The dashboard should count both `DUE` and `OVERDUE` as requiring action. `OVERDUE` is a more severe state.

## 6. Manager SLA

### 6.1 Default timeline

| Stage | Proposed rule | Example with due time 17:00 |
|---|---|---|
| Employee deadline | Task-specific `Due_At` | 17:00 |
| First manager alert | `Due_At + 15 minutes` | 17:15 |
| Manager reminder | 60 business minutes after alert, if no acknowledgement | 18:15, subject to work-window cap |
| Manager acknowledgement deadline | Earlier of alert + 120 business minutes or close of the due date's work window | 18:30 due to close cap |
| Leadership escalation for no acknowledgement | At acknowledgement deadline | 18:30 |
| Leadership escalation for acknowledged but unresolved work | Next working day at 11:00 | 11:00 next working day |

For a task due earlier in the day, the manager receives a full two-business-hour acknowledgement window when it fits before close. For a late-day task, the deadline is capped by the 18:30 business close so a same-day escalation remains possible.

### 6.2 Why this SLA is balanced

- A 15-minute grace period avoids treating a few minutes of delay as an escalation event.
- A manager alert is still sent on the same working day.
- A one-time reminder provides a chance to acknowledge without generating repeated messages.
- A hard acknowledgement deadline ensures that leadership is informed when the manager has not reviewed the issue.
- Acknowledgement does not equal resolution. The next-working-day 11:00 threshold ensures the underlying work is still tracked.

### 6.3 Manager's required action

The manager must:

1. Open the cycle row or manager dashboard drill-down.
2. Review the task, owner, due time, and proof status.
3. Check `Manager_Acknowledged`.
4. Add a concise action in `Manager_Notes`, such as `Spoke with employee; portal access issue; ETA 10:30 tomorrow`.
5. Leave the underlying task open until the employee submits valid completion.

A manager acknowledgement is a review receipt, not task completion.

### 6.4 What triggers leadership escalation

There are two independent escalation conditions.

**Condition A — manager did not acknowledge:**

- The cycle remains open.
- `Manager_Ack_At` is blank.
- The acknowledgement deadline has passed.
- `LEADERSHIP_UNACK_ESCALATION` has not already been sent for the cycle.

**Condition B — manager acknowledged, but the task remains unresolved:**

- The cycle remains open.
- `Manager_Ack_At` is populated.
- The next-working-day 11:00 resolution threshold has passed.
- `LEADERSHIP_UNRESOLVED_ESCALATION` has not already been sent for the cycle.

If the employee completes the task before the relevant leadership stage becomes eligible, that escalation is suppressed.

## 7. Notification behaviour and anti-spam rules

| Rule | Behaviour |
|---|---|
| First manager alert | Once per cycle |
| Manager reminder | Maximum one per cycle |
| Leadership escalation | Once per applicable escalation type per cycle |
| Completion before alert | Cancel pending alerts for that cycle |
| Completion after manager alert but before leadership escalation | Do not escalate; record resolution |
| Completion after leadership escalation | Do not send another escalation; record `Resolved_After_Escalation_At` |
| Re-run monitor | Re-check status but do not resend successful stages |
| Email send failure | Controlled retry under the same dedupe key |
| Ambiguous send result | Do not blindly resend; mark `AMBIGUOUS` and review |

The alert idempotency key is `Cycle_ID|Alert_Stage`. Every monitor execution checks the alert log before sending.

## 8. Email content

### 8.1 Manager first-alert email

**Subject:** `[ACTION REQUIRED] Overdue task — {{Task_Name}} — {{Employee_Name}}`

**Body fields:**

- Task and `Task_ID`;
- Assigned employee;
- Due timestamp and elapsed overdue duration;
- Required proof type;
- Employee proof value, if any;
- Current task status;
- Manager acknowledgement deadline;
- Link to the spreadsheet and instructions to acknowledge on the row.

### 8.2 Manager reminder

**Subject:** `[REMINDER] Manager acknowledgement pending — {{Task_Name}}`

State the original alert time, acknowledgement deadline, and direct row link. Do not send if the task is completed or manager has acknowledged.

### 8.3 Leadership escalation

**Subject:** `[ESCALATION] {{Task_Name}} remains unresolved — {{Employee_Name}}`

Include:

- task and employee;
- original due timestamp;
- current overdue age;
- proof/Ticket ID status;
- first manager alert timestamp;
- reminder timestamp, if any;
- manager acknowledgement status, timestamp, and notes;
- reason for escalation (`MANAGER_NOT_ACKNOWLEDGED` or `TASK_UNRESOLVED_AFTER_ACK`);
- workbook link.

## 9. Business-minute calculation

All manager acknowledgement and reminder deadlines should use a shared `addBusinessMinutes(startAt, minutes)` function.

Expected behaviour:

1. Start at `startAt` in the configured timezone.
2. If the date is not a working day, move to the next working date and set time to `WORKDAY_START`.
3. If current time is before `WORKDAY_START`, start at `WORKDAY_START`.
4. If current time is after `WORKDAY_END`, move to the next working day.
5. Consume only the minutes remaining in the current work window.
6. If minutes remain after `WORKDAY_END`, continue at `WORKDAY_START` on the next working date.
7. Stop when all requested business minutes have been consumed.

The same helper must be used for manager SLA calculation and reminder timing.

## 10. SLA configuration examples

| Task | Frequency | Due time | First manager alert | Manager ack deadline | Leadership if no ack | Leadership if acknowledged but open |
|---|---|---:|---:|---:|---|---|
| Daily Operations Update | Daily working day | 17:00 | 17:15 same day | 18:30 same day | 18:30 same day | 11:00 next working day |
| Portal Task A | Every 7 days | 17:00 | 17:15 due day | 18:30 due day | 18:30 due day | 11:00 next working day |
| Portal Task B | Every 15 days | 17:00 | 17:15 due day | 18:30 due day | 18:30 due day | 11:00 next working day |
| Portal Task C | Every 30 days | 17:00 | 17:15 due day | 18:30 due day | 18:30 due day | 11:00 next working day |

For an earlier due time (for example, 10:00), the acknowledgement deadline is normally 12:15 if no holiday/work-window boundary intervenes.

## 11. Operational caveats

- The 5-minute Apps Script monitor means email timing is subject to polling and service execution latency. The SLA should be described as “detected and queued by the next monitor execution,” not exact-to-the-second delivery.
- If the company requires strict service guarantees, use a managed scheduler/queue and transactional datastore rather than relying solely on spreadsheet triggers.
- Leadership recipient lists must be maintained in `Team` or a controlled configuration field.
- Do not allow an employee to change `Due_At`, `Manager_Ack_Deadline_At`, or escalation timestamps.
- Any approved due-date extension should be an explicit, audited manager/admin action. Do not silently alter the original due date.

