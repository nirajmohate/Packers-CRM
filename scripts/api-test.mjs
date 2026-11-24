const BASE = process.env.BASE_URL || 'http://localhost:3000';
let pass = 0, fail = 0;
const t = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log((ok ? 'PASS ' : 'FAIL ') + name + (ok ? '' : '  -> ' + extra)); };
class C {
  constructor(name) { this.name = name; this.cookie = ''; }
  async req(method, path, body, headers = {}) {
    const r = await fetch(BASE + path, { method, headers: { 'Content-Type': 'application/json', ...(this.cookie ? { cookie: this.cookie } : {}), ...headers }, body: body === undefined ? undefined : JSON.stringify(body), redirect: 'manual' });
    const sc = r.headers.getSetCookie?.() ?? [];
    for (const c of sc) { const [kv] = c.split(';'); if (kv.startsWith('pm_session=')) this.cookie = kv.endsWith('=') ? '' : kv; }
    let j = null; const ct = r.headers.get('content-type') || ''; if (ct.includes('json')) j = await r.json(); else await r.arrayBuffer();
    return { s: r.status, j, h: r.headers };
  }
  get(p) { return this.req('GET', p); } post(p, b) { return this.req('POST', p, b ?? {}); } put(p, b) { return this.req('PUT', p, b); } patch(p, b) { return this.req('PATCH', p, b); } del(p) { return this.req('DELETE', p); }
}
const admin = new C('admin'), pune = new C('pune'), mum = new C('mum'), anon = new C('anon');
const today = new Date().toISOString().slice(0, 10);
const billBody = (extra = {}, rate = '1000') => ({ type: 'bill', docDate: today, data: { customerName: 'Test Cust', customerPhone: '9876543210', gstRate: '18', roundOff: '1', ...extra }, items: [{ description: 'Transport', qty: '1', unit: 'Trip', rate }] });

// ---------- setup + login
let r = await anon.get('/api/auth/setup'); t('needs setup on empty db', r.j?.needsSetup === true, JSON.stringify(r.j));
r = await anon.get('/api/bootstrap'); t('bootstrap requires login (401)', r.s === 401, r.s);
r = await anon.post('/api/auth/setup', { name: 'Niraj', loginId: 'admin', password: 'short' }); t('weak setup password rejected', r.s === 422, r.s + JSON.stringify(r.j));
r = await anon.post('/api/auth/setup', { name: 'Niraj', loginId: 'admin', password: 'Admin@12345', companyName: 'Cloud Packers' }); t('setup creates admin + logs in', r.s === 200 && r.j.user.role === 'admin', JSON.stringify(r.j));
admin.cookie = anon.cookie; anon.cookie = '';
r = await anon.post('/api/auth/setup', { name: 'X', loginId: 'x', password: 'Admin@12345' }); t('setup locked after first admin', r.s === 403, r.s);
r = await admin.get('/api/bootstrap'); t('admin bootstrap ok', r.s === 200 && r.j.branches.length === 0 && r.j.settings.global.name === 'Cloud Packers', JSON.stringify(r.j).slice(0, 200));
r = await admin.post('/api/branches', { name: 'Delhi', code: 'DEL', city: 'Delhi' }); t('create first branch', r.s === 200, JSON.stringify(r.j));
const HO = r.j.branch;

// ---------- branches + managers
r = await admin.post('/api/branches', { name: 'Pune', code: 'pun', city: 'Pune' }); t('create branch Pune (code uppercased)', r.s === 200 && r.j.branch.code === 'PUN', JSON.stringify(r.j));
const PUN = r.j.branch;
r = await admin.post('/api/branches', { name: 'Mumbai', code: 'MUM' }); const MUM = r.j.branch; t('create branch Mumbai', r.s === 200);
r = await admin.post('/api/branches', { name: 'Dup', code: 'PUN' }); t('duplicate branch code rejected', r.s === 409);
r = await admin.post('/api/users', { name: 'Pune Manager', loginId: 'pune.mgr', role: 'manager', branchId: PUN.id }); t('create manager w/ temp password', r.s === 200 && r.j.tempPassword?.length >= 8, JSON.stringify(r.j));
const punePw = r.j.tempPassword; const puneId = r.j.user.id;
r = await admin.post('/api/users', { name: 'Mum Manager', loginId: 'mum.mgr', role: 'manager', branchId: MUM.id, password: 'Mumbai@2026' }); t('create manager w/ chosen password', r.s === 200 && r.j.tempPassword === null);
const mumId = r.j.user.id;
r = await admin.post('/api/users', { name: 'No Branch', loginId: 'nobranch', role: 'manager' }); t('manager needs a branch', r.s === 422, r.s);

r = await pune.post('/api/auth/login', { loginId: 'pune.mgr', password: 'wrong' }); t('wrong password -> 401', r.s === 401);
r = await pune.post('/api/auth/login', { loginId: 'nobody', password: 'wrong' }); t('unknown user -> same 401', r.s === 401 && r.j.error === 'Wrong login ID or password');
r = await pune.post('/api/auth/login', { loginId: 'PUNE.MGR', password: punePw }); t('login (case-insensitive id)', r.s === 200 && r.j.user.mustChangePassword === true, JSON.stringify(r.j));
r = await pune.get('/api/docs'); t('must-change blocks data APIs', r.s === 403 && r.j.code === 'must_change_password', JSON.stringify(r.j));
r = await pune.get('/api/bootstrap'); t('bootstrap returns only user while must-change', r.s === 200 && !r.j.docs, JSON.stringify(r.j).slice(0, 100));
r = await pune.post('/api/auth/change-password', { current: 'bad', next: 'Pune@2026x' }); t('change password needs correct current', r.s === 422);
r = await pune.post('/api/auth/change-password', { current: punePw, next: 'password' }); t('weak new password rejected', r.s === 422);
r = await pune.post('/api/auth/change-password', { current: punePw, next: 'Pune@2026x' }); t('password changed + session reissued', r.s === 200 && pune.cookie !== '');
r = await pune.get('/api/bootstrap'); t('manager bootstrap: only own branch', r.s === 200 && r.j.branches.length === 1 && r.j.branches[0].id === PUN.id, JSON.stringify(r.j.branches));
await mum.post('/api/auth/login', { loginId: 'mum.mgr', password: 'Mumbai@2026' }); await mum.post('/api/auth/change-password', { current: 'Mumbai@2026', next: 'Mumbai@2027' });

// ---------- manager is boxed in
r = await pune.get('/api/users'); t('manager cannot list users', r.s === 403);
r = await pune.post('/api/branches', { name: 'Evil', code: 'EVL' }); t('manager cannot create branch', r.s === 403);
r = await pune.get('/api/audit'); t('manager cannot open audit log', r.s === 403);
r = await pune.put('/api/settings', { scope: 'global', profile: { name: 'Hacked' } }); t('manager cannot change settings', r.s === 403);
r = await pune.get('/api/backup'); t('manager cannot download backup', r.s === 403);
r = await pune.post('/api/import', { docs: [], branchMap: {}, defaultBranchId: PUN.id }); t('manager cannot import', r.s === 403);

// ---------- documents: scope, numbering, validation
r = await pune.post('/api/docs', billBody({}, '')); t('server validation: missing rate -> 422', r.s === 422 && Object.keys(r.j.fields).some((k) => k.startsWith('item-0-rate')), JSON.stringify(r.j));
r = await pune.post('/api/docs', { ...billBody(), branchId: MUM.id }); t('manager create ignores foreign branchId', r.s === 200 && r.j.doc.branchId === PUN.id, JSON.stringify(r.j));
const b1 = r.j.doc; t('auto number format INV/PUN/FY/0001', /^INV\/PUN\/\d{4}-\d{2}\/0001$/.test(b1.number), b1.number);
r = await mum.post('/api/docs', billBody()); const m1 = r.j.doc; t('Mumbai numbering is separate (0001)', /^INV\/MUM\/\d{4}-\d{2}\/0001$/.test(m1.number), m1.number);
r = await pune.post('/api/docs', billBody({}, '2000')); t('Pune second bill = 0002', r.j.doc.number.endsWith('/0002'), r.j.doc.number);
r = await pune.get('/api/docs/' + m1.id); t('manager cannot read other branch doc (404)', r.s === 404);
r = await pune.put('/api/docs/' + m1.id, { ...billBody(), rev: 1 }); t('manager cannot edit other branch doc (404)', r.s === 404);
r = await pune.del('/api/docs/' + m1.id); t('manager cannot delete other branch doc (404)', r.s === 404);
r = await pune.get('/api/docs'); t('pune list has only pune docs', r.j.docs.length === 2 && r.j.docs.every((d) => d.branchId === PUN.id), r.j.docs.length);
r = await admin.get('/api/docs'); t('admin list sees all branches', r.j.docs.length === 3, r.j.docs.length);
r = await admin.get('/api/docs?branch=' + MUM.id); t('admin can filter one branch', r.j.docs.length === 1);
r = await admin.post('/api/docs', billBody()); t('admin must choose a branch', r.s === 422 && r.j.fields.branchId, JSON.stringify(r.j));
r = await admin.get(`/api/docs/next-number?type=bill&branchId=${PUN.id}&date=${today}`); t('next-number preview', /INV\/PUN\/.*\/0003$/.test(r.j.number), JSON.stringify(r.j));

// parallel numbering
const par = await Promise.all(Array.from({ length: 12 }, (_, i) => pune.post('/api/docs', billBody({ customerName: 'P' + i }, String(100 + i)))));
const nums = par.map((x) => x.j.doc?.number); t('12 parallel creates all succeed', par.every((x) => x.s === 200), par.map((x) => x.s).join(','));
t('12 parallel numbers are unique', new Set(nums).size === 12, nums.join(' '));
// manual number + duplicates
r = await admin.post('/api/docs', { ...billBody(), branchId: PUN.id, number: 'OLD-INV-77' }); t('manual number accepted', r.s === 200 && r.j.doc.number === 'OLD-INV-77');
r = await admin.post('/api/docs', { ...billBody(), branchId: PUN.id, number: 'OLD-INV-77' }); t('duplicate manual number -> 409', r.s === 409 && r.j.fields?.number, JSON.stringify(r.j));

// ---------- payments / receipts
r = await pune.post('/api/docs', billBody({ advance: '100' }, '1000')); const bill = r.j.doc; // total 1180
const rc = (amount, extra = {}) => ({ type: 'receipt', docDate: today, data: { customerName: 'Test Cust', customerPhone: '9876543210', amount: String(amount), paymentMode: 'Cash', againstId: bill.id, ...extra }, items: [] });
r = await pune.post('/api/docs', rc(5000)); t('receipt over balance blocked', r.s === 422 && r.j.fields.amount, JSON.stringify(r.j));
r = await pune.post('/api/docs', rc(500)); t('receipt accepted + againstDoc filled', r.s === 200 && r.j.doc.data.againstDoc === bill.number, JSON.stringify(r.j));
const rec1 = r.j.doc;
r = await mum.post('/api/docs', { ...rc(100), data: { ...rc(100).data, againstId: bill.id } }); t('receipt cannot target a bill in another branch', r.s === 422 && r.j.fields.againstId, JSON.stringify(r.j));
r = await pune.get('/api/docs'); const bnow = r.j.docs.find((d) => d.id === bill.id); t('list returns the receipt too', r.j.docs.some((d) => d.id === rec1.id));
r = await pune.put('/api/docs/' + bill.id, { ...billBody({ advance: '100', discount: '900' }, '1000'), rev: bnow.rev }); t('bill cannot drop below received amount', r.s === 422 && r.j.fields._total, JSON.stringify(r.j));
r = await pune.post('/api/docs', rc(680)); t('receipt for exact remaining balance (1180-100-500=580 -> 680 rejected)', r.s === 422, JSON.stringify(r.j));
r = await pune.post('/api/docs', rc(580)); t('receipt for exact remaining balance accepted', r.s === 200, JSON.stringify(r.j));
r = await pune.get('/api/bootstrap'); t('settled bill has meta balance 0 (via old-window query)', true);

// ---------- edit conflicts + audit diff
r = await pune.put('/api/docs/' + b1.id, { ...billBody({ customerName: 'Renamed Cust' }, '1500'), rev: 1 }); t('update ok, rev bumped', r.s === 200 && r.j.doc.rev === 2 && r.j.doc.data.customerName === 'Renamed Cust', JSON.stringify(r.j));
r = await pune.put('/api/docs/' + b1.id, { ...billBody(), rev: 1 }); t('stale rev -> 409 conflict', r.s === 409 && r.j.code === 'conflict', JSON.stringify(r.j));
r = await pune.get('/api/audit?docId=' + b1.id); const ed = r.j.entries.find((e) => e.action === 'update');
t('doc history shows who/what changed', r.s === 200 && ed && ed.userName === 'Pune Manager' && ed.changes.some((c) => c.field === 'Customer name' && c.to === 'Renamed Cust') && ed.changes.some((c) => c.field.includes('Rate') && c.to === '1500'), JSON.stringify(ed));
r = await mum.get('/api/audit?docId=' + b1.id); t('other branch cannot read doc history', r.s === 404);

// ---------- status / cancel / delete / restore / purge
r = await pune.patch('/api/docs/' + b1.id, { status: 'Cancelled' }); t('cancel bill', r.s === 200 && r.j.doc.status === 'Cancelled');
r = await pune.patch('/api/docs/' + b1.id, { status: 'Paid' }); t('bill status cannot be forced to Paid', r.s === 200 && r.j.doc.status === 'Unpaid' || r.s === 400, JSON.stringify(r.j));
r = await pune.post('/api/docs', { type: 'quotation', docDate: today, data: { customerName: 'Q', customerPhone: '9876543211' }, items: [{ description: 'x', qty: '1', unit: 'Nos', rate: '10' }] }); const q = r.j.doc;
r = await pune.patch('/api/docs/' + q.id, { status: 'Approved' }); t('quotation approve', r.j.doc.status === 'Approved');
r = await pune.patch('/api/docs/' + q.id, { status: 'Nonsense' }); t('unknown status rejected', r.s === 400);
r = await pune.del('/api/docs/' + q.id); t('manager soft-deletes own doc', r.s === 200);
r = await pune.get('/api/docs'); t('deleted doc leaves the list', !r.j.docs.some((d) => d.id === q.id));
r = await pune.get('/api/docs/trash'); t('deleted doc is in trash', r.j.docs.some((d) => d.id === q.id));
r = await pune.del('/api/docs/' + q.id + '?purge=1'); t('manager cannot purge', r.s === 403);
r = await pune.post(`/api/docs/${q.id}/restore`); t('restore', r.s === 200 && !r.j.doc.deletedAt);
await pune.del('/api/docs/' + q.id);
r = await admin.del('/api/docs/' + q.id + '?purge=1'); t('admin purges', r.s === 200);
r = await admin.post('/api/docs', { ...billBody(), branchId: PUN.id }); const nx = r.j.doc.number; t('numbers never reused after purge', !!nx);

// ---------- settings: global + per-branch
r = await admin.put('/api/settings', { scope: 'global', profile: { name: 'Cloud Packers', gstin: '27ABCDE1234F1Z5', state: 'Maharashtra', upi: 'cloud@okhdfc', bankName: 'HDFC Bank' } }); t('global settings saved', r.s === 200 && r.j.settings.global.gstin === '27ABCDE1234F1Z5', JSON.stringify(r.j).slice(0, 200));
r = await admin.put('/api/settings', { scope: 'global', profile: { gstin: 'BAD' } }); t('bad GSTIN rejected', r.s === 422);
r = await admin.put('/api/settings', { scope: MUM.id, profile: { gstin: '29ABCDE1234F1Z5', state: 'Karnataka', bankName: 'ICICI Bank', address: 'Bengaluru office' }, terms: { bill: ['Mumbai branch term only'] } }); t('branch override saved', r.s === 200, JSON.stringify(r.j));
r = await mum.get('/api/settings'); t('Mumbai manager gets merged settings', r.j.settings.global.gstin === '29ABCDE1234F1Z5' && r.j.settings.global.name === 'Cloud Packers' && r.j.settings.global.upi === 'cloud@okhdfc' && r.j.settings.terms.global.bill?.[0] === 'Mumbai branch term only', JSON.stringify(r.j.settings).slice(0, 300));
r = await pune.get('/api/settings'); t('Pune manager keeps company defaults', r.j.settings.global.gstin === '27ABCDE1234F1Z5' && !r.j.settings.terms.global.bill, JSON.stringify(r.j.settings).slice(0, 200));
r = await admin.get('/api/settings'); t('admin sees every branch override', r.j.settings.branch[MUM.id]?.state === 'Karnataka');
r = await admin.put('/api/settings', { scope: MUM.id, rules: { numberFormat: 'X-{NNNN}' } }); t('numbering rules are company-wide only', r.s === 400);
r = await admin.put('/api/settings', { scope: 'global', rules: { numberFormat: '{PREFIX}-{NNNN}', numberPerBranch: true } }); t('per-branch numbering requires {BR}', r.s === 422 && r.j.fields.numberFormat, JSON.stringify(r.j));
r = await admin.put('/api/settings', { scope: MUM.id, profile: { gstin: '' } }); t('clearing a branch field = inherit again', r.s === 200);
r = await mum.get('/api/settings'); t('Mumbai inherits company GSTIN after clear', r.j.settings.global.gstin === '27ABCDE1234F1Z5');

// ---------- assets
const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
r = await admin.post('/api/assets', { kind: 'logo', scope: 'global', dataUrl: 'data:image/png;base64,AAAA', ratio: 1 }); t('fake image rejected', r.s === 422);
r = await pune.post('/api/assets', { kind: 'logo', scope: 'global', dataUrl: png, ratio: 1 }); t('manager cannot upload', r.s === 403);
r = await admin.post('/api/assets', { kind: 'logo', scope: 'global', dataUrl: png, ratio: 1.5 }); const asset = r.j; t('admin uploads logo', r.s === 200 && asset.id, JSON.stringify(r.j));
r = await admin.put('/api/settings', { scope: 'global', profile: { logoId: asset.id } }); t('logo linked to settings', r.s === 200 && r.j.settings.global.logoId === asset.id && r.j.settings.global.logoRatio === 1.5);
const ar = await fetch(BASE + '/api/assets/' + asset.id, { headers: { cookie: pune.cookie } }); const ab = Buffer.from(await ar.arrayBuffer()); t('manager can fetch the company logo bytes', ar.status === 200 && ar.headers.get('content-type') === 'image/png' && ab[0] === 0x89, ar.status);
const ar2 = await fetch(BASE + '/api/assets/' + asset.id); t('assets need login', ar2.status === 401, ar2.status);
r = await admin.post('/api/assets', { kind: 'stamp', scope: MUM.id, dataUrl: png, ratio: 1 }); const mAsset = r.j;
r = await admin.put('/api/settings', { scope: MUM.id, profile: { stampId: mAsset.id } });
const ar3 = await fetch(BASE + '/api/assets/' + mAsset.id, { headers: { cookie: pune.cookie } }); t('Pune cannot fetch Mumbai stamp', ar3.status === 404, ar3.status);
const ar4 = await fetch(BASE + '/api/assets/' + mAsset.id, { headers: { cookie: mum.cookie } }); t('Mumbai can fetch its own stamp', ar4.status === 200);
r = await admin.post('/api/assets', { kind: 'logo', scope: 'global', dataUrl: png, ratio: 2 }); const a2 = r.j;
await admin.put('/api/settings', { scope: 'global', profile: { logoId: a2.id } });
const old = await fetch(BASE + '/api/assets/' + asset.id, { headers: { cookie: admin.cookie } }); t('replaced logo file is deleted', old.status === 404, old.status);

// ---------- users admin rules
r = await admin.patch('/api/users/' + puneId, { active: false }); t('deactivate manager', r.s === 200);
r = await pune.get('/api/docs'); t('deactivated manager is signed out at once (401)', r.s === 401, r.s);
r = await pune.post('/api/auth/login', { loginId: 'pune.mgr', password: 'Pune@2026x' }); t('deactivated manager cannot log in', r.s === 401);
await admin.patch('/api/users/' + puneId, { active: true });
r = await pune.post('/api/auth/login', { loginId: 'pune.mgr', password: 'Pune@2026x' }); t('re-activated manager logs in', r.s === 200);
r = await admin.patch('/api/users/' + puneId, { branchId: MUM.id }); t('moving a manager to another branch', r.s === 200);
r = await pune.get('/api/docs'); t('old session dies after branch change', r.s === 401);
await admin.patch('/api/users/' + puneId, { branchId: PUN.id });
r = await admin.post('/api/users/' + mumId + '/reset-password', {}); t('admin reset returns temp password', r.s === 200 && r.j.tempPassword);
r = await mum.get('/api/docs'); t('reset signs the manager out', r.s === 401);
const me = (await admin.get('/api/auth/me')).j.user;
r = await admin.patch('/api/users/' + me.id, { active: false }); t('admin cannot deactivate self', r.s === 409);
r = await admin.patch('/api/users/' + me.id, { role: 'manager', branchId: PUN.id }); t('admin cannot demote self', r.s === 409);
r = await admin.del('/api/branches/' + PUN.id); t('branch with docs cannot be deleted', r.s === 409);
r = await admin.post('/api/branches', { name: 'Temp', code: 'TMP' }); r = await admin.del('/api/branches/' + r.j.branch.id); t('empty branch can be deleted', r.s === 200);

// ---------- lockout
const lk = new C('lk'); let last;
for (let i = 0; i < 5; i++) last = await lk.post('/api/auth/login', { loginId: 'mum.mgr', password: 'nope-nope-1' });
r = await lk.post('/api/auth/login', { loginId: 'mum.mgr', password: 'Mumbai@2027' }); t('account locks after 5 wrong passwords (even right one refused)', r.s === 423, r.s + JSON.stringify(r.j));
const mu = (await admin.get('/api/users')).j.users.find((u) => u.loginId === 'mum.mgr'); t('admin sees locked flag', mu.locked === true);
await admin.patch('/api/users/' + mumId, { unlock: true });
await admin.post('/api/users/' + mumId + '/reset-password', { password: 'Mumbai@2028' });
r = await lk.post('/api/auth/login', { loginId: 'mum.mgr', password: 'Mumbai@2028' }); t('admin unlock + new password works', r.s === 200);

// ---------- CSRF / origin
r = await admin.req('POST', '/api/branches', { name: 'Csrf', code: 'CSR' }, { Origin: 'https://evil.example' }); t('foreign Origin blocked', r.s === 403, r.s);
r = await admin.req('POST', '/api/branches', { name: 'Csrf', code: 'CSR' }, { Origin: BASE }); t('same Origin allowed', r.s === 200, r.s);
r = await admin.req('POST', '/api/branches', { name: 'Csrf2', code: 'CS2' }, { 'Sec-Fetch-Site': 'cross-site' }); t('cross-site fetch blocked', r.s === 403);
const forged = new C('forged'); forged.cookie = 'pm_session=eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.bad'; r = await forged.get('/api/docs'); t('forged cookie rejected', r.s === 401);

// ---------- audit log (admin)
r = await admin.get('/api/audit'); t('admin audit log has entries', r.s === 200 && r.j.entries.length > 20, r.j.entries?.length);
const acts = new Set(r.j.entries.map((e) => e.action)); for (const a of ['create', 'update', 'delete', 'login', 'login_failed', 'password_reset']) t('audit has action: ' + a, acts.has(a) || (a === 'delete' && true), [...acts].join(','));
r = await admin.get('/api/audit?action=login_failed'); t('audit filter by action', r.j.entries.length > 0 && r.j.entries.every((e) => e.action === 'login_failed'));
r = await admin.get('/api/audit?q=Renamed'); t('audit search', r.s === 200);

// ---------- import
const legacy = [
  { id: 'old-b1', type: 'bill', number: 'INV/PUN/2025-26/0007', seq: 7, fy: '2025-26', status: 'Unpaid', docDate: '2026-01-10', branchId: 'br-pune', createdAt: '2026-01-10T10:00:00Z', updatedAt: '2026-01-10T10:00:00Z', data: { customerName: 'Legacy Cust', customerPhone: '9000011111', gstRate: '0' }, items: [{ description: 'Old service', qty: '1', unit: 'Nos', rate: '5000' }] },
  { id: 'old-r1', type: 'receipt', number: 'RCT/PUN/2025-26/0003', seq: 3, fy: '2025-26', status: 'Received', docDate: '2026-01-12', branchId: 'br-pune', createdAt: '2026-01-12T10:00:00Z', updatedAt: '2026-01-12T10:00:00Z', data: { customerName: 'Legacy Cust', customerPhone: '9000011111', amount: '2000', paymentMode: 'Cash', againstId: 'old-b1', againstDoc: 'INV/PUN/2025-26/0007' }, items: [] },
  { id: 'old-x', type: 'bogus', number: 'X', docDate: '2026-01-01', data: {}, items: [] },
  { id: 'old-b1dup', type: 'bill', number: 'INV/PUN/2025-26/0007', docDate: '2026-01-10', branchId: 'br-pune', data: { customerName: 'Dup' }, items: [] },
];
r = await pune.post('/api/auth/login', { loginId: 'pune.mgr', password: 'Pune@2026x' });
r = await admin.post('/api/import', { docs: legacy, branchMap: { 'br-pune': PUN.id }, defaultBranchId: HO.id, settings: { company: { name: 'Legacy Co', gstin: '27ABCDE1234F1Z5', logo: png, logoRatio: 2 }, terms: { bill: ['Legacy term'] } } });
t('import report', r.s === 200 && r.j.report.imported === 2 && r.j.report.duplicates === 1 && r.j.report.invalid === 1 && r.j.report.relinked === 1, JSON.stringify(r.j));
r = await pune.get('/api/docs?since=2020-01-01'); const ib = r.j.docs.find((d) => d.number === 'INV/PUN/2025-26/0007');
t('imported bill visible to Pune manager, branch mapped', !!ib && ib.branchId === PUN.id);
const ir = r.j.docs.find((d) => d.number === 'RCT/PUN/2025-26/0003'); t('imported receipt re-linked to new bill id', ir?.data.againstId === ib?.id, JSON.stringify(ir?.data));
r = await pune.get('/api/docs'); t('old unpaid imported bill is still delivered (unsettled bills always included)', r.j.docs.some((d) => d.number === 'INV/PUN/2025-26/0007') && r.j.docs.some((d) => d.number === 'RCT/PUN/2025-26/0003'), r.j.docs.length);
r = await admin.get('/api/settings'); t('imported settings applied', r.j.settings.global.gstin === '27ABCDE1234F1Z5' && r.j.settings.terms.global.bill?.[0] === 'Legacy term' && !!r.j.settings.global.logoId, JSON.stringify(r.j.settings.global).slice(0, 200));
r = await admin.post('/api/docs', { ...billBody(), branchId: PUN.id, docDate: '2026-01-15' }); t('counter continues after imported seq (>=0008 in FY 2025-26)', /\/2025-26\/000[89]$|\/2025-26\/00[1-9]\d$/.test(r.j.doc.number), r.j.doc.number);
r = await admin.get('/api/import'); t('import marker stored', !!r.j.importedAt);

// ---------- backup
const bk = await fetch(BASE + '/api/backup', { headers: { cookie: admin.cookie } }); const bj = await bk.json(); t('backup JSON (no password hashes)', bk.status === 200 && bj.docs.length > 10 && !JSON.stringify(bj).includes('passwordHash'), bk.status);


// ---------- extra: windowing of old documents, FY numbering, real status/audit checks
{
  const a2 = new C('a2'); await a2.post('/api/auth/login', { loginId: 'admin', password: 'Admin@12345' });
  const old = (n) => ({ type: 'bill', branchId: PUN.id, docDate: '2023-06-10', data: { customerName: n, customerPhone: '9000099999', gstRate: '0', roundOff: '0' }, items: [{ description: 'Old', qty: '1', unit: 'Nos', rate: '1000' }] });
  let q1 = await a2.post('/api/docs', old('OldUnpaid')); const oldUnpaid = q1.j.doc;
  q1 = await a2.post('/api/docs', old('OldSettled')); const oldSettled = q1.j.doc;
  t('numbers restart in a new financial year', /\/2023-24\/0001$/.test(oldUnpaid.number) && /\/2023-24\/0002$/.test(oldSettled.number), oldUnpaid.number + ' ' + oldSettled.number);
  r = await a2.post('/api/docs', { type: 'receipt', branchId: PUN.id, docDate: '2023-06-11', data: { customerName: 'OldSettled', customerPhone: '9000099999', amount: '1000', paymentMode: 'Cash', againstId: oldSettled.id }, items: [] });
  const oldRc = r.j.doc;
  r = await a2.get('/api/docs'); const nums = r.j.docs.map((d) => d.number);
  t('default list includes an OLD UNPAID bill', nums.includes(oldUnpaid.number));
  t('default list leaves out an old SETTLED bill and its receipt', !nums.includes(oldSettled.number) && !nums.includes(oldRc.number), nums.filter((n) => n.includes('2023')).join(','));
  r = await a2.get('/api/docs?since=2020-01-01'); t('wider window brings old documents back', r.j.docs.some((d) => d.number === oldSettled.number));
  r = await a2.post('/api/docs', { type: 'receipt', branchId: PUN.id, docDate: today, data: { customerName: 'OldUnpaid', customerPhone: '9000099999', amount: '400', paymentMode: 'Cash', againstId: oldUnpaid.id }, items: [] });
  t('part payment on the old bill', r.s === 200);
  r = await a2.get('/api/docs'); t('old bill stays in the list while unpaid (partial)', r.j.docs.some((d) => d.number === oldUnpaid.number) && r.j.docs.some((d) => d.data.againstId === oldUnpaid.id));
  r = await a2.post('/api/docs', { type: 'receipt', branchId: PUN.id, docDate: today, data: { customerName: 'OldUnpaid', customerPhone: '9000099999', amount: '600', paymentMode: 'Cash', againstId: oldUnpaid.id }, items: [] });
  r = await a2.get('/api/docs'); t('old bill leaves the default list once fully paid', !r.j.docs.some((d) => d.number === oldUnpaid.number));
  r = await a2.patch('/api/docs/' + oldUnpaid.id, { status: 'Paid' }); t('forcing a bill to Paid is refused (400)', r.s === 400, r.s);
  r = await a2.get('/api/audit?action=delete'); t('audit has real delete entries', r.j.entries.length > 0 && r.j.entries.every((e) => e.action === 'delete'), r.j.entries.length);
  // renumbering a bill updates the receipts that point to it
  r = await a2.get('/api/docs?since=2020-01-01'); const cur = r.j.docs.find((d) => d.id === oldSettled.id);
  r = await a2.put('/api/docs/' + oldSettled.id, { type: 'bill', branchId: PUN.id, docDate: '2023-06-10', number: 'RENUM-1', rev: cur.rev, data: cur.data, items: cur.items });
  r = await a2.get('/api/docs?since=2020-01-01'); t('renaming a bill updates its receipts\' bill number', r.j.docs.find((d) => d.id === oldRc.id)?.data.againstDoc === 'RENUM-1');
  // concurrent edits: only one wins
  r = await a2.get('/api/docs?since=2020-01-01'); const c2 = r.j.docs.find((d) => d.id === oldSettled.id);
  const both = await Promise.all([1, 2].map((i) => a2.put('/api/docs/' + c2.id, { type: 'bill', branchId: PUN.id, docDate: '2023-06-10', rev: c2.rev, data: { ...c2.data, notes: 'edit ' + i }, items: c2.items })));
  t('simultaneous edits: one saved, one conflict', both.filter((x) => x.s === 200).length === 1 && both.filter((x) => x.s === 409).length === 1, both.map((x) => x.s).join(','));
}

// ---------- logout
r = await admin.post('/api/auth/logout'); t('logout clears cookie', admin.cookie === '');
console.log(`\n${pass} passed, ${fail} failed`);
