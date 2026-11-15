# Reviewer guide: a 5-minute tour of the live sheet

**[Open the Allo Innoware Task Tracker](https://docs.google.com/spreadsheets/d/1NHwzfoNeDtnCbbGegbYEe47Oxhpt9fIR9QEw4F0VRXY/edit)**

> [!NOTE]
> The sheet runs in **TEST mode**. Its clock is fixed at **Mon 16 Nov 2026, 18:31**, so you can see late tasks and escalations without waiting, and every email goes to one test inbox. Nothing you do here reaches real people.

## The 60-second version

Allo Innoware has jobs that repeat: a daily WhatsApp operations update and portal tasks every 7, 15 and 30 days. This sheet:

1. **Creates each task occurrence by itself**, on working days only.
2. **Asks for proof** when an employee marks a task done (a portal ticket ID, or a reference to the WhatsApp post), and refuses the tick without it.
3. **Emails the manager** 15 minutes after a missed deadline, and sends one reminder.
4. **Emails leadership** if the manager does not acknowledge by close of business, or if acknowledged work is still not done by 11:00 the next working day.
5. **Logs everything**: who did what and when, and every email sent. No email is ever sent twice.

## Tour (look, don't touch)

| Step | Open this tab | What to notice |
|---|---|---|
| 1 | **Dashboard** | Totals for open, overdue, unacknowledged and escalated tasks. This is the manager's view. |
| 2 | **Task_Master** | The five recurring tasks: who owns each, how often it repeats, the due time, and the proof it needs. |
| 3 | **Task_Cycles** | The main list, one row per occurrence. Look at `Status` (`COMPLETED`, `OVERDUE`…), `Employee_Proof`, `Completed_At` / `Completed_By_Email`, and the manager columns `Manager_Notes` / `Manager_Ack_At`. Completed portal tasks have a new row for their next due date. |
| 4 | **Alert_Log** | One row per email: manager alert or leadership escalation, with a `[TEST]` subject and the time sent. Six rows, even though the script has checked about 300 times. |
| 5 | **Audit_Log** | The full history: every completion, acknowledgement, new cycle and escalation, with who and when. |
| 6 | **Settings** / **Error_Log** | Work hours (09:30–18:30), test-mode switches, and a clean error log with each past issue marked resolved. |

## Try it yourself (optional)

These steps need Editor access.

**Complete a task with proof**
1. In **Task_Cycles**, pick a row whose `Status` is `DUE` or `OVERDUE` for a portal task. (If none is open, the daily task works the same way: type a short note such as `Posted 17:05 - daily summary`.)
2. Type any ticket number (for example `TKT-1234`) in `Employee_Proof`.
3. **Click** the `Submit_Complete` checkbox with the mouse. (A keyboard toggle does not trigger the script.)
4. Within a few seconds the row turns `COMPLETED`, your email and the time are recorded, and a new row appears for the next due date.

**See the proof check refuse an empty submit**
1. On another open portal row, leave `Employee_Proof` empty and click `Submit_Complete`.
2. A message asks for the ticket ID and the tick is removed.

> [!TIP]
> If you see "Only … (or an admin) can complete this task", that is the permission check working: only the assigned employee or an admin may close a task. Your email can be added to the **Team** tab as an admin to try it.

The **Tasks** menu (top bar) has admin actions such as *Run Dispatcher Now* and *Set Test Clock*. Google asks for permission the first time a menu item runs; the tour above does not need it.

## What is honest to say about it

- WhatsApp proof is the employee's own reference to the post, not an automatic check of WhatsApp.
- The live run used one Google account. Actions by several different accounts are designed and unit-tested, but not yet verified live.
- On personal Gmail accounts Google sometimes hides the editor's identity; a manager acknowledgement is then refused rather than recorded without a name. Company Google Workspace accounts avoid this.

## Further reading

[Project README](README.md) · [How the timing rules work](docs/03-RECURRENCE-SLA.md) · [Test plan](docs/05-TEST-PLAN.md) · [Full specification pack](docs/README.md) · [Apps Script source](src)
