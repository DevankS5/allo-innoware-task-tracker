# 06 — Implementation & Deployment Plan

## 1. Purpose

This document provides the build sequence from an empty Google Sheet to a working prototype and a controlled production pilot.

## 2. Prerequisites

- Google Workspace account(s) for employees, manager, leadership, and the designated automation owner.
- Permission to create a Google Sheet and bound Apps Script project.
- Manager and leadership email addresses.
- Agreed due times, work days, holidays, and escalation policy.
- A test inbox for demo notifications.
- Approved Drive folder for optional daily-task screenshot evidence.

Use a designated operations-owned account for trigger ownership. Do not install production triggers under a temporary developer or intern account.

## 3. Phase 1 — Workbook foundation

### Tasks

1. Create a new Google Spreadsheet named `Allo Innoware — Recurring Task Tracker`.
2. Create the nine tabs from `02-LLD.md`.
3. Add exact header rows.
4. Format date/time columns using the spreadsheet timezone.
5. Freeze the header rows and enable filters.
6. Add data validation dropdowns for enums and checkboxes for Boolean fields.
7. Add conditional formatting:
   - `SCHEDULED`: neutral/low emphasis;
   - `DUE`: attention colour;
   - `OVERDUE`: strong warning colour;
   - `COMPLETED`: subdued success style;
   - escalated open rows: leadership highlight.
8. Add the four seed task definitions and team directory entries.
9. Add default Settings and holiday entries.

### Exit criteria

- All tabs exist and headers match the LLD.
- Required configuration values are present.
- Data validation prevents common invalid entries.

## 4. Phase 2 — Cycle engine

### Tasks

1. Implement configuration loading and validation.
2. Implement sheet repository functions and column maps.
3. Implement `isWorkingDay`, `nextWorkingDate`, and date/time helpers.
4. Implement initial cycle creation.
5. Implement daily working-day cycle generation.
6. Implement interval next-due calculation for `AFTER_COMPLETION` and `FIXED_CADENCE`.
7. Add deterministic cycle keys and uniqueness checks.
8. Add script locking around cycle creation.

### Exit criteria

- Initial cycles are created for active tasks.
- Daily task generation creates one cycle per working date.
- Interval next cycles are created when a cycle is completed.
- Running the generator multiple times does not create duplicate rows.

## 5. Phase 3 — Employee and manager workflow

### Tasks

1. Create employee filter views on `Task_Cycles`.
2. Create manager pending and escalated views.
3. Protect system-owned columns.
4. Where practical, protect employee input cells per row so only the assigned employee and admin can edit them.
5. Protect manager action cells so only the configured manager and admin can edit them.
6. Implement proof validation by `Required_Proof_Type`.
7. Implement completion timestamp and actor provenance.
8. Implement manager acknowledgement timestamp and actor provenance.
9. Add clear error/toast messages for invalid submissions.

### Employee operating instructions

1. Open the saved filter view for your account.
2. Locate an open task.
3. Enter the Ticket ID or configured proof in the row.
4. Paste an evidence URL only where required.
5. Check `Submit_Complete`.
6. Confirm the status changes to `COMPLETED`.

### Manager operating instructions

1. Open the manager dashboard or `Manager Pending` view.
2. Locate the overdue cycle.
3. Enter the action/review note.
4. Check `Manager_Acknowledged`.
5. Continue monitoring until the employee completes the task.

## 6. Phase 4 — SLA and notification automation

### Tasks

1. Implement business-minute calculations.
2. Implement manager first-alert eligibility.
3. Implement manager reminder eligibility.
4. Implement leadership escalation for missing acknowledgement.
5. Implement leadership escalation for acknowledged-but-unresolved tasks.
6. Implement `Alert_Log` deduplication and send states.
7. Implement email templates and direct spreadsheet links.
8. Implement email quota check and error logging.
9. Implement reconciliation for cycle/alert integrity.

### Exit criteria

- Each email stage is sent at most once per cycle under normal/retried execution.
- Manager acknowledgement deadlines use business time and holiday rules.
- Completing the task before leadership threshold suppresses escalation.
- The manager alert contains sufficient information to identify and acknowledge the issue.

## 7. Phase 5 — Dashboard and audit

### Dashboard sections

1. KPI cards: open due, overdue, awaiting manager acknowledgement, escalated open, completed today.
2. Employee scorecard: pending and overdue counts by assignee.
3. Oldest overdue list.
4. Escalated items list with manager acknowledgement status.
5. Recent completions and latest activity.

### Audit sections

- Completion events;
- manager acknowledgement events;
- manager alert/reminder events;
- leadership escalation events;
- cycle creation and recurrence events;
- administrator configuration changes;
- reconciliation repairs.

## 8. Phase 6 — Test and demo

Follow `05-TEST-PLAN.md` without skipping the negative cases.

Minimum proof package for submission:

- screenshot of Task_Master;
- employee pending view;
- completed portal row with Ticket ID and next cycle;
- completed daily row with WhatsApp attestation;
- manager email;
- manager acknowledgement row;
- leadership escalation email;
- dashboard summary;
- Alert_Log and Audit_Log showing deduplication and history.

Run all notifications through a test inbox first. Use `TEST_NOW_OVERRIDE` to simulate timing; do not wait days for a 7/15/30-day real recurrence during the demonstration.

## 9. Trigger installation

`installAutomationTriggers()` should:

1. Verify all required sheets and columns exist.
2. Verify spreadsheet and script timezones match.
3. Verify `ENVIRONMENT` is `TEST` or `PRODUCTION` as expected.
4. Verify notification recipients.
5. Remove duplicate triggers for the known handler functions.
6. Create one installable spreadsheet edit trigger for `handleTaskCyclesEdit`.
7. Create one time-driven trigger for `runDispatcher` at the configured polling interval.
8. Store the installer account/email and installation timestamp in Settings or a deployment log.

Do not install production email triggers until test cases pass and `SEND_EMAILS=TRUE` is approved.

## 10. Production rollout

### Pilot recommendation

Run a one-week supervised pilot with the real four tasks. During the pilot:

- manager checks dashboard daily;
- operations owner checks `Error_Log` and trigger executions;
- employee identity capture is verified with real accounts;
- actual due times and alert thresholds are reviewed;
- WhatsApp proof policy is confirmed by the manager;
- no task is treated as escalated solely from a demo/test row.

After the pilot, tune intervals and SLA values based on observed operational response times.

## 11. Handover package

Provide the company with:

- Google Sheet URL with approved editor access;
- Apps Script project ownership/maintainer details;
- this HLD/LLD pack;
- trigger installation instructions;
- manager and employee quick-start instructions;
- seed task configuration;
- test evidence screenshots;
- known limitations and escalation policy;
- a recovery procedure for a failed trigger or email.

## 12. Recovery procedure

If notifications stop:

1. Open Apps Script Executions and inspect the latest failed dispatcher run.
2. Check `Error_Log` and current email quota.
3. Check whether the time-driven trigger still exists and is owned by the operations account.
4. Run `Run Health Check`.
5. Review `Alert_Log` for `FAILED`, `SENDING`, or `AMBIGUOUS` rows.
6. Repair only after confirming the external email outcome for an ambiguous send.
7. Run dispatcher manually once and confirm the expected state transition.
8. Record the recovery in `Audit_Log`.

If the owner account is disabled or leaves the organisation, an administrator must reinstall triggers using the replacement operations account and re-authorise the script.

## 13. Go-live checklist

- [ ] Business rules approved.
- [ ] Team emails verified.
- [ ] Manager and leadership emails verified.
- [ ] Task definitions seeded.
- [ ] Holidays and working hours configured.
- [ ] Workbook and script timezone match.
- [ ] Employee input ranges protected.
- [ ] Manager action ranges protected.
- [ ] User identity behaviour tested.
- [ ] Test mode completed successfully.
- [ ] All eight assignment tests passed.
- [ ] Test email routing disabled only after approval.
- [ ] Production notification flag explicitly enabled.
- [ ] Trigger owner and backup administrator documented.
- [ ] One-week pilot and daily review scheduled.

