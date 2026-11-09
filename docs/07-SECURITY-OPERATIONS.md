# 07 — Security, Permissions & Operational Controls

## 1. Purpose

This document captures security and operational considerations that materially affect the reliability of a Google Sheets-based task tracker.

## 2. Permission model

### Workbook roles

| Role | Read access | Write access |
|---|---|---|
| Employee | Shared workbook data unless separate workbooks/front end are used | Assigned cycle employee-input cells only, where row protection is configured |
| Manager | Team task and dashboard data | Manager acknowledgement and notes; approved administrative fields if authorised |
| Leadership | Dashboard and escalation records | Normally read-only |
| Administrator | Full workbook | All configuration and recovery operations |
| Automation owner | Required script/workbook access | Script-owned fields and notification execution |

### Important distinction: visibility vs edit rights

A filter view is a viewing convenience, not a security boundary. It does not prevent a spreadsheet editor from clearing the filter or viewing other rows. Protected ranges limit edits, but do not make the values confidential.

For the assignment prototype, a shared team workbook is acceptable only if the company is comfortable with employees seeing one another's task names/status. If not, choose one of these production options:

1. Separate employee workbooks with a controlled Apps Script sync to a central master ledger; or
2. A role-aware Apps Script web application/AppSheet interface backed by a restricted master workbook.

Do not claim row-level confidentiality from filter views or hidden tabs.

## 3. Protected ranges

Minimum protection:

- protect all headers and system-generated columns;
- protect `Task_Master`, `Team`, `Settings`, `Alert_Log`, `Audit_Log`, and `Error_Log` from ordinary employee edits;
- for each cycle row, allow only the assigned employee to edit `Employee_Proof`, `Evidence_URL`, `Employee_Notes`, and `Submit_Complete`;
- allow only the configured manager to edit `Manager_Acknowledged` and `Manager_Notes`;
- allow administrators to edit all required ranges.

Hidden tabs are not access controls. The workbook must be shared only with intended users.

## 4. Actor attribution

Apps Script user identity is context-dependent. `Session.getActiveUser().getEmail()` can be unavailable and return a blank value in some execution contexts. Installable triggers run as their creator. Therefore:

- record the actor email only when a reliable value is available;
- record the identity provenance in `Completed_By_Source` and `Manager_Ack_Source`;
- use protected range permissions to reduce the ability of one employee to submit another employee's row;
- test with every intended user account before production;
- never populate a guessed identity and present it as verified.

If reliable actor-level attribution is mandatory, deploy an authenticated user-facing submission action (for example, a user-authorized Apps Script UI) or another identity-aware interface and verify domain policy before launch.

## 5. Automation owner and email sender

Installable triggers execute as the user who created them. The outbound automation should be owned by a controlled `operations@...` account or equivalent. That account must:

- remain active;
- have access to the spreadsheet;
- have authorised the required Apps Script scopes;
- be monitored by at least one administrator;
- be included in offboarding and account-recovery procedures.

Do not make an individual intern's personal email account the permanent owner of production notifications.

## 6. Audit and evidence

Capture:

- cycle creation;
- employee completion submission;
- completion timestamp and identity source;
- proof/Ticket ID reference;
- manager acknowledgement timestamp and notes;
- every alert stage and send outcome;
- leadership escalation reason and timestamp;
- administrator changes to task recurrence, assignee, due time, or SLA;
- reconciliation repairs and manual recovery.

Audit logs should be append-only for ordinary users. For stronger tamper resistance, periodically export the logs to a restricted Drive folder or an external immutable store.

## 7. Evidence storage

If screenshots or supporting documents are used:

- store them in an organisation-controlled Drive folder;
- grant access to the manager and relevant reviewers;
- use share links that do not expose evidence publicly;
- avoid uploading unrelated personal data;
- retain evidence according to company policy;
- validate that the URL points to the expected approved storage location.

The sheet should store the reference URL, not duplicate the entire file contents into a cell.

## 8. Email controls

- Maintain recipients in `Team` or controlled Settings.
- Test all email templates with a test inbox.
- Add a stable unique email token to each notification.
- Keep the alert idempotency record separate from the task status.
- Do not retry ambiguous email sends automatically without checking the sending account's Sent mailbox or an administrator's decision.
- Check remaining daily email quota before large send batches.
- Avoid sending sensitive portal details in emails; include only the minimum needed to identify and resolve the task.

## 9. Operational monitoring

Daily checks during pilot:

- Last successful `runDispatcher` execution;
- `Error_Log` entries;
- `Alert_Log` rows in `FAILED`, `SENDING`, or `AMBIGUOUS`;
- overdue count and manager acknowledgement backlog;
- email quota headroom;
- trigger ownership and enabled status.

Weekly checks:

- task master accuracy;
- active team members and email addresses;
- manager/leadership recipients;
- holiday calendar;
- proof policy for WhatsApp tasks;
- completed-cycle and next-cycle consistency;
- backup/export of important logs.

## 10. Backup and recovery

- Keep a versioned copy of the spreadsheet before material schema changes.
- Use Google Sheets version history for accidental edits, but do not treat version history as the only audit record.
- Export `Task_Cycles`, `Alert_Log`, and `Audit_Log` periodically if records have operational or compliance value.
- Document the operations owner and at least one administrator who can reinstall triggers.
- For a failed run, inspect Apps Script Executions, Error_Log, Alert_Log, and the corresponding cycle row before rerunning.

## 11. Scale and technology boundaries

This design is appropriate for a small team and a modest number of recurring task occurrences. Google Sheets is not a transactional relational database. As the number of employees, tasks, and daily cycles grows, evaluate:

- AppSheet or an authenticated web application for row-aware UX and permissions;
- Cloud SQL/Firestore for transactional data and uniqueness constraints;
- Cloud Scheduler/Cloud Tasks for stronger timing and retry control;
- a dedicated notification service and monitoring dashboard.

The transition threshold should be driven by observed row volume, concurrent editing, audit requirements, and notification SLA—not by a speculative future scale target.

## 12. Known limitations to disclose in the assignment

1. WhatsApp completion is an employee attestation/evidence reference unless a supported integration is introduced.
2. Apps Script trigger timing is best-effort and may vary; it is not second-exact.
3. Installable triggers run under the creator's identity; an operations-owned account should own them.
4. User email may not be available in all script execution contexts; identity provenance must be recorded honestly.
5. Filter views do not hide underlying rows from spreadsheet editors.
6. Email notification delivery and sheet writes are not a single atomic transaction; ambiguous send outcomes require controlled recovery.

