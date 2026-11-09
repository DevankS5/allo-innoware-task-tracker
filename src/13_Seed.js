/* Seed data: the four assignment tasks, a synthetic team and default settings.
 * Used by setupWorkbook() and by the self-tests. Synthetic example.com addresses only: replace before production. */

function seedSettings() {
  const t = tbl(SHEETS.SETTINGS), have = t.rows().map(r => str(r.Key));
  SETTINGS_DEFAULTS.forEach(s => { if (have.indexOf(s[0]) < 0) t.append({ Key: s[0], Value: s[1], Notes: s[2] }); });
}

function seedTeam() {
  const t = tbl(SHEETS.TEAM);
  const row = (email, name, role, mgr, edit, ack) => t.append({ Member_Email: email, Display_Name: name, Role: role, Manager_Email: mgr, Is_Active: true, Can_Edit_Task_Master: edit, Can_Acknowledge: ack, Notes: 'Seed: replace with a real address' });
  ['A', 'B', 'C', 'D'].forEach(x => row('emp.' + x.toLowerCase() + '@example.com', 'Employee ' + x, 'EMPLOYEE', 'mgr@example.com', false, false));
  row('mgr@example.com', 'Manager', 'MANAGER', '', false, true);
  row('lead1@example.com', 'Leadership 1', 'LEADERSHIP', '', false, false);
  row('lead2@example.com', 'Leadership 2', 'LEADERSHIP', '', false, false);
  row('ops@example.com', 'Operations Admin', 'ADMIN', '', true, true);
}

function seedTasks(startYmd) {
  const t = tbl(SHEETS.TASK_MASTER), start = fromLocal(startYmd, '17:00'), now = getEffectiveNow();
  const row = (id, name, who, freq, days, mode, proof, desc, how) => t.append({
    Task_ID: id, Is_Active: true, Task_Name: name, Task_Description: desc, Assigned_To_Email: who, Manager_Email: 'mgr@example.com',
    Frequency_Type: freq, Interval_Days: days, Recurrence_Mode: mode, Initial_Due_At: start, Due_Time: '17:00',
    Working_Days_Only: true, Non_Working_Day_Policy: 'NEXT_WORKING_DAY', Priority: 'NORMAL', Required_Proof_Type: proof,
    Proof_Required: true, Completion_Instructions: how, First_Manager_Alert_Minutes: 15, Manager_Ack_SLA_Business_Minutes: 120,
    Manager_Reminder_Offset_Minutes: 60, Escalate_If_Manager_Unacknowledged: true, Escalate_If_Task_Unresolved: true,
    Task_Owner_Email: 'ops@example.com', Created_At: now, Updated_At: now, Task_Version: 1,
  });
  const wa = 'Post the update in the WhatsApp group, then enter e.g. "Posted 16:42 - daily operations summary" and tick Submit_Complete';
  const tk = 'Complete the task on the portal, paste the Ticket ID in Employee_Proof and tick Submit_Complete';
  row('OPS-DAILY-001', 'Daily Operations Update', 'emp.a@example.com', 'DAILY', '', 'DAILY_WORKDAY', 'WHATSAPP_ATTESTATION', 'Daily operations update to the WhatsApp group', wa);
  row('PORTAL-7D-001', 'Portal Task A', 'emp.b@example.com', 'INTERVAL', 7, 'AFTER_COMPLETION', 'TICKET_ID', 'Portal task, every 7 days', tk);
  row('PORTAL-15D-001', 'Portal Task B', 'emp.c@example.com', 'INTERVAL', 15, 'AFTER_COMPLETION', 'TICKET_ID', 'Portal task, every 15 days', tk);
  row('PORTAL-30D-001', 'Portal Task C', 'emp.d@example.com', 'INTERVAL', 30, 'AFTER_COMPLETION', 'TICKET_ID', 'Portal task, every 30 days', tk);
}

/** Fixed-date national holidays only. Confirm the real list (state/optional holidays, Diwali etc.) with HR. */
function seedHolidays() {
  const t = tbl(SHEETS.HOLIDAYS);
  [2026, 2027].forEach(y => [['01-26', 'Republic Day'], ['08-15', 'Independence Day'], ['10-02', 'Gandhi Jayanti'], ['12-25', 'Christmas Day']]
    .forEach(h => t.append({ Date: fromLocal(y + '-' + h[0], '00:00'), Holiday_Name: h[1], Is_Non_Working: true, Notes: 'Seed: confirm with HR' })));
}
