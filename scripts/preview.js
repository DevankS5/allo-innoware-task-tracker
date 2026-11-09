// Renders the engine's real output (in-memory store, simulated clock) as HTML for README previews.
// Usage: node scripts/preview.js <outDir>   -> <outDir>/ledger.html and <outDir>/tests.html
// These are NOT Google Sheets screenshots: same engine code, no live spreadsheet.
const fs = require('fs'), path = require('path'), vm = require('vm'), cp = require('child_process');
const out = process.argv[2]; if (!out) throw new Error('usage: node scripts/preview.js <outDir>');
fs.mkdirSync(out, { recursive: true });
const root = path.join(__dirname, '..'), dir = path.join(root, 'src');
let held = false;
const LockService = { getScriptLock: () => ({ tryLock: () => { if (held) throw new Error('re-entrant'); held = true; return true; }, releaseLock: () => { held = false; } }) };
const logs = [];
const ctx = vm.createContext({ console: { log: m => logs.push(m), error: m => logs.push(m) }, LockService });
for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.js')).sort()) vm.runInContext(fs.readFileSync(path.join(dir, f), 'utf8'), ctx, { filename: f });

const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const css = `body{font:13px system-ui,Segoe UI,sans-serif;margin:16px;color:#202124;background:#fff}h1{font-size:16px;margin:0 0 4px}
p.n{color:#5f6368;margin:0 0 12px;font-size:12px}table{border-collapse:collapse;margin-bottom:18px}th,td{border:1px solid #dadce0;padding:4px 8px;text-align:left;white-space:nowrap}
th{background:#e8eaed}.OVERDUE{background:#f4c7c3}.DUE{background:#fce8b2}.COMPLETED{background:#e6f4ea;color:#5f6368}.SCHEDULED{color:#80868b}.ESC{background:#d9c2f0}
pre{background:#1e1e1e;color:#d4d4d4;padding:14px;border-radius:6px;font:12px Consolas,monospace;line-height:1.5}.p{color:#6a9955}.f{color:#f48771}`;

// Scenario driven through the same helpers the tests use.
const rows = vm.runInContext(`(() => {
  freshWorld();
  const T = SHEETS.TASK_CYCLES, col = n => tbl(T).rows();
  W.at('2026-11-10 09:00');
  const tck = col().find(c => c.Required_Proof_Type === 'TICKET_ID');
  W.at('2026-11-10 17:05');
  if (tck) W.submit(tck.Cycle_ID, { Employee_Proof: 'TCK-1042' });
  W.at('2026-11-10 17:16'); W.at('2026-11-10 18:16');
  const wa = col().find(c => c.Required_Proof_Type === 'WHATSAPP_ATTESTATION' && c.Status === 'OVERDUE');
  if (wa) W.ack(wa.Cycle_ID, 'Called the employee, report due in 30 minutes');
  W.at('2026-11-10 18:31');
  return { cycles: tbl(T).rows(), alerts: tbl(SHEETS.ALERT_LOG).rows(), now: fmtLocal(getEffectiveNow()) };
})()`, ctx);

const fmt = v => (Object.prototype.toString.call(v) === '[object Date]' ? vm.runInContext('fmtLocal', ctx)(v) : v); // Date is from the vm realm, so no instanceof
const cyc = ['Task_Name_Snapshot', 'Assigned_To_Name', 'Due_At', 'Status', 'Employee_Proof', 'Completed_At', 'Manager_Ack_At', 'Manager_Notes', 'Manager_Ack_Deadline_At', 'Leadership_Escalated_At'];
const al = ['Alert_Stage', 'Recipient_List', 'Subject', 'Status', 'Sent_At'];
const tbl = (cols, data, rowCls) => '<table><tr>' + cols.map(c => `<th>${c}</th>`).join('') + '</tr>' +
  data.map(r => `<tr class="${rowCls ? rowCls(r) : ''}">` + cols.map(c => `<td>${esc(fmt(r[c]))}</td>`).join('') + '</tr>').join('') + '</table>';
fs.writeFileSync(path.join(out, 'ledger.html'), `<!doctype html><meta charset="utf-8"><style>${css}</style>
<h1>Task_Cycles and Alert_Log after a simulated day (clock: ${esc(rows.now)})</h1>
<p class="n">Engine preview: real output of this repo's code with an in-memory store and the TEST clock. Not a Google Sheets screenshot.</p>
${tbl(cyc, rows.cycles, r => (r.Leadership_Escalated_At && r.Status !== 'COMPLETED' ? 'ESC' : r.Status))}
${tbl(al, rows.alerts)}`);

const t = cp.spawnSync(process.execPath, [path.join(root, 'tests', 'run.js')], { encoding: 'utf8' });
fs.writeFileSync(path.join(out, 'tests.html'), `<!doctype html><meta charset="utf-8"><style>${css}</style><h1>npm test</h1>
<pre>${esc(t.stdout).replace(/^PASS/gm, '<span class="p">PASS</span>').replace(/^FAIL/gm, '<span class="f">FAIL</span>')}</pre>`);
