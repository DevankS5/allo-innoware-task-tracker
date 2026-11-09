# Allo Innoware — Recurring Task Tracking & Escalation Automation

## HLD / LLD Specification Pack

**Document purpose:** Convert the assignment brief into an implementable Google Sheets + Google Apps Script design. This pack defines the operating model, workbook schema, recurrence engine, employee workflow, manager acknowledgement, SLA escalation, idempotency controls, test plan, and deployment steps.

**Target users:** 3–4 employees, one or more managers, and a leadership recipient group.

**Primary interface:** Google Sheets. Employees and managers work from the same operational ledger; the script handles cycle creation, timestamps, validation, status changes, email alerts, and audit records.

**Default timezone:** `Asia/Kolkata` (configurable).

---

## 1. Recommended design at a glance

Use one canonical `Task_Cycles` sheet as the task operating ledger. Every row represents exactly one occurrence of one recurring task. A completed row remains in the ledger as history; a new row is appended for the next occurrence. This avoids copying a completion from an employee report to a second tracker and avoids a separate archive transaction.

The workbook has these principal tabs:

| Tab | Purpose | Primary editor |
|---|---|---|
| `Dashboard` | Manager overview of open, overdue, unacknowledged, and escalated work | Manager / leadership read-only |
| `Task_Master` | Definition of recurring tasks and their recurrence/proof/SLA configuration | System administrator |
| `Team` | Employee, manager, and leadership email directory | System administrator |
| `Task_Cycles` | Employee workbench and canonical cycle ledger; employees enter proof and submit completion here | Assigned employee / manager / automation |
| `Alert_Log` | Idempotency ledger for manager reminders and leadership escalation emails | Automation; administrator read-only |
| `Audit_Log` | Append-only record of completion, acknowledgement, cycle creation, and escalation events | Automation; administrator read-only |
| `Holiday_Calendar` | Non-working dates and optional working-day overrides | System administrator |
| `Settings` | Timezone, work hours, SLA defaults, test mode, and notification routing | System administrator |
| `Error_Log` | Script failures and reconciliation issues | Automation; administrator read-only |

### Core workflow

1. `Task_Master` defines the task, owner, cadence, due time, and proof type.
2. The cycle engine creates the first cycle and daily cycles, using a deterministic cycle key to prevent duplicates.
3. The employee opens `Task_Cycles`, filters to their tasks, enters the Ticket ID or completion proof, and checks `Submit_Complete`.
4. Apps Script validates the proof, records completion timestamp and actor identity (subject to Workspace identity constraints), closes the current cycle, and creates the next interval cycle where applicable.
5. A time-driven monitor updates due/overdue state, detects missed deadlines, and sends one manager alert per cycle/stage.
6. The manager acknowledges the issue on that same cycle row and records a short action note.
7. If the manager does not acknowledge by the configured SLA, or the task remains unresolved after acknowledgement, a single leadership escalation is sent.
8. The script writes all important transitions to `Audit_Log` and all notifications to `Alert_Log`.

---

## 2. Files in this specification pack

| File | Contents |
|---|---|
| `01-HLD.md` | High-Level Design: architecture, components, workflows, decisions, constraints, and non-functional requirements |
| `02-LLD.md` | Low-Level Design: exact tab schemas, fields, state machine, validations, formulas, data keys, and function contracts |
| `03-RECURRENCE-SLA.md` | Recurrence semantics, business calendar, manager response SLA, escalation timing, and WhatsApp daily-task evidence method |
| `04-APPS-SCRIPT-DESIGN.md` | Apps Script module layout, trigger model, pseudocode, locking, idempotency, email templates, and error handling |
| `05-TEST-PLAN.md` | Eight required assignment tests plus negative, boundary, and acceptance tests |
| `06-IMPLEMENTATION-DEPLOYMENT.md` | Build sequence, workbook setup, permissions, trigger installation, deployment checklist, and handover |
| `07-SECURITY-OPERATIONS.md` | Permissions, identity limitations, audit, privacy, operational monitoring, and scale boundaries |
| `08-PLATFORM-REFERENCES.md` | Official Google documentation and platform constraints that shape the design |

---

## 3. Baseline decisions and assumptions

The assignment does not define every operational policy. The following defaults make the prototype deterministic; they should be confirmed with Allo Innoware before production.

| Topic | Proposed default | Why |
|---|---|---|
| Timezone | Asia/Kolkata | Use one consistent timezone for due dates, email timestamps, and audit records |
| Working days | Monday–Friday, excluding `Holiday_Calendar` dates | Daily operational updates should not generate weekend work unless configured |
| Standard work window | 09:30–18:30 local time | Allows business-hour SLA calculation |
| Default task due time | 17:00 local time | A clear end-of-day operational cutoff; configurable per task |
| First manager alert | 15 minutes after the due time | Same-day visibility without alerting at the exact cutoff |
| Manager acknowledgement SLA | Up to 120 business minutes, capped at the same-day work-window close | Gives the manager time to act while preserving a same-day escalation path |
| Manager reminder | Once, 60 business minutes after first alert, if not acknowledged | Avoids repeated reminder spam |
| Leadership escalation — no manager acknowledgement | At the manager acknowledgement deadline | Makes manager review accountable |
| Leadership escalation — task still open after acknowledgement | Next working day at 11:00 | Gives the employee and manager a defined resolution window |
| Interval recurrence | `AFTER_COMPLETION` by default | Avoids overlapping or immediately overdue cycles after late completion |
| Daily recurrence | One cycle for each configured working day | Daily obligations are calendar-driven, not completion-driven |
| Ticket proof | Ticket ID required | The task is not complete without the portal reference |
| WhatsApp proof | Employee attestation plus timestamp/short note; evidence link where required | Practical without claiming the sheet independently verifies WhatsApp activity |
| Alert deduplication | One alert per `cycle_id + alert_stage` | Re-running automation must not send repeated messages |
| Task history | Completed cycle rows remain in `Task_Cycles` | One ledger avoids data-copy/archive inconsistencies |

### Explicit limitation: WhatsApp verification

A Google Sheet cannot independently prove that a message was posted to a WhatsApp group. The MVP should capture a structured employee attestation, the completion timestamp, and optionally a Drive screenshot link or a short message reference. This creates an auditable record of who declared completion and when; it is not cryptographic or API-level verification of the group message. Do not describe it as independently verified. A future integration can be evaluated only if the organisation has an approved messaging platform/API and a supported way to obtain the required delivery/post event.

### Explicit limitation: employee data visibility

Filter views create convenient employee-specific views, but they do not hide the underlying rows from other spreadsheet editors. Protected ranges control editing, not confidentiality. For the small-team prototype, use named filter views and protected input/system columns. If employees must not see one another's tasks, use separate employee workbooks or a role-aware Apps Script/AppSheet front end backed by a restricted master workbook.

---

## 4. Build order

1. Read `01-HLD.md` and approve the decisions that affect operations.
2. Create the workbook tabs and exact headers from `02-LLD.md`.
3. Add the four assignment tasks and team addresses to `Task_Master` and `Team`.
4. Implement the cycle and recurrence services.
5. Implement employee completion and manager acknowledgement handling.
6. Implement alert, reminder, and leadership escalation processing.
7. Run all scenarios in `TEST` mode using a simulated clock and test email recipients.
8. Install production triggers using a designated operations-owned Google account.
9. Run a one-week supervised pilot before relying on automated escalation for real operations.

---

## 5. Assignment tasks to seed

| Task ID | Task | Assigned To | Frequency | Proof type | Default due time |
|---|---|---|---|---|---|
| `OPS-DAILY-001` | Daily Operations Update | Employee A | Daily working day | `WHATSAPP_ATTESTATION` | 17:00 |
| `PORTAL-7D-001` | Portal Task A | Employee B | Every 7 days | `TICKET_ID` | 17:00 |
| `PORTAL-15D-001` | Portal Task B | Employee C | Every 15 days | `TICKET_ID` | 17:00 |
| `PORTAL-30D-001` | Portal Task C | Employee D | Every 30 days | `TICKET_ID` | 17:00 |

Use real employee and manager email addresses only in the actual workbook. Do not place real personal details in a public demo copy.

---

## 6. Definition of done

The prototype is ready for evaluation when:

- all four recurring tasks can be configured in `Task_Master`;
- the correct cycle rows are generated without manual date calculation;
- an employee can complete a cycle from the same row where it appears;
- Ticket ID validation blocks incomplete portal-task submissions;
- the daily WhatsApp task captures a timestamped attestation and optional evidence reference;
- the current cycle closes and the next cycle is generated/scheduled correctly;
- the manager dashboard shows the pending/overdue state by employee;
- the manager can acknowledge an issue and the system records who/when/notes;
- manager alerts are sent on the same day after the due-time grace period;
- leadership escalation occurs under the two defined escalation conditions;
- rerunning the monitor does not create duplicate cycles, completion events, or successful alert records;
- the test evidence demonstrates all eight required assignment tests;
- production triggers are owned by the designated operations account and tested after deployment.

