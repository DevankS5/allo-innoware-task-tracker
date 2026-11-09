// Loads every Apps Script file in src/ into one VM context (same global scope Apps Script uses),
// stubs the Apps Script services the engine touches, and runs the in-repo self-test suite.
const fs = require('fs'), path = require('path'), vm = require('vm');
const dir = path.join(__dirname, '..', 'src');
let held = false; // strict, non-reentrant script lock: catches nested-lock bugs that would deadlock in Apps Script
const LockService = { getScriptLock: () => ({
  tryLock: () => { if (held) throw new Error('re-entrant script lock'); held = true; return true; },
  releaseLock: () => { held = false; } }) };
const ctx = vm.createContext({ console, LockService });
for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.js')).sort())
  vm.runInContext(fs.readFileSync(path.join(dir, f), 'utf8'), ctx, { filename: f });
const has = vm.runInContext('typeof runSelfTests', ctx) === 'function';
if (!has) { console.log('no self-tests yet'); process.exit(0); }
const r = vm.runInContext('runSelfTests()', ctx);
process.exit(r.failed ? 1 : 0);
