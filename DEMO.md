# Live Demonstration

## 1. Google Sheet

[Open Allo Innoware Task Tracker](https://docs.google.com/spreadsheets/d/1NHwzfoNeDtnCbbGegbYEe47Oxhpt9fIR9QEw4F0VRXY/edit)

Run from the sheet menu **Allo Innoware - Recurring Task Tracker**.

## 2. Views

- Dashboard
- Employee Pending (saved filter view on `Task_Cycles`)
- Manager Pending
- All Escalated

## 3. Automation

- Recurring cycle generation (daily working-day, 7/15/30-day)
- Employee completion with proof (`Employee_Proof` + `Submit_Complete`)
- Manager acknowledgement (action note + `Manager_Acknowledged`)
- SLA alerts, leadership escalation, deduplication

## 4. Test mode

`ENVIRONMENT=TEST`: all mail goes to `TEST_RECIPIENT_EMAIL`. `TEST_NOW_OVERRIDE` simulates the clock. Dashboard KPIs use real `TODAY()`, so they ignore the simulated clock (documented limitation).

## 5. Demo order

1. Show initial tabs and seeded tasks.
2. Complete a portal task with a Ticket ID: row goes COMPLETED, next cycle appears.
3. Complete the daily WhatsApp task with an attestation.
4. Move the test clock past the deadline, run the dispatcher: manager alert in `Alert_Log` and test inbox.
5. Manager adds a note and ticks acknowledgement: timestamp and actor recorded.
6. Move the clock to the escalation deadline: leadership alert + dedupe key.
7. Run the dispatcher again: no new alerts, no duplicate cycles.

Escalation path 1 (never acknowledged) and path 2 (acknowledged, unresolved by 11:00 next working day) are separate scenarios.

## 6. Known limits

- WhatsApp proof is an employee attestation, not independent verification.
- Identity: `e.user` can be blank on consumer Gmail; completion is then `UNVERIFIED`, acknowledgement is rejected. Verify with real accounts before claiming attribution.

## 7. Source and docs

[Apps Script source](src) | [HLD](docs/01-HLD.md) | [LLD](docs/02-LLD.md) | [SLA](docs/03-RECURRENCE-SLA.md) | [Test plan](docs/05-TEST-PLAN.md) | [Deployment](docs/06-IMPLEMENTATION-DEPLOYMENT.md)
