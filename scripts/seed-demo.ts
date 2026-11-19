import { config } from 'dotenv';
config({ path: '.env.local' });
config();
import mongoose, { Types } from 'mongoose';
import { connectDb } from '../lib/server/db';
import { Branch, Counter, Doc, Settings, User } from '../lib/server/models';
import { hashPassword } from '../lib/server/auth';
import { refreshBillMeta } from '../lib/server/docs';
import { demoDocs } from '../lib/demo';

const BRANCHES = [
  { name: 'Pune', code: 'PUN', city: 'Pune', login: 'pune' },
  { name: 'Mumbai', code: 'MUM', city: 'Mumbai', login: 'mumbai' },
  { name: 'Nashik', code: 'NSK', city: 'Nashik', login: 'nashik' },
  { name: 'Bengaluru', code: 'BLR', city: 'Bengaluru', login: 'bengaluru' },
  { name: 'Delhi', code: 'DEL', city: 'Delhi', login: 'delhi' },
];

/** Sample branches, managers and documents for trying the app out. Never run this on real data. */
async function main() {
  await connectDb();
  if ((await Doc.countDocuments()) > 0 && !process.argv.includes('--force')) throw new Error('The database already has documents. Add --force to seed anyway.');
  const adminPw = await hashPassword(process.env.DEMO_ADMIN_PASSWORD || 'Admin@12345');
  if (!(await User.findOne({ loginId: 'admin' }))) await User.create({ name: 'Admin', loginId: 'admin', passwordHash: adminPw, role: 'admin', branchId: null, active: true, mustChangePassword: false, sv: 0 });
  const mgrPw = await hashPassword('Manager@123');
  const ids = new Map<string, string>();
  for (const b of BRANCHES) {
    let row = (await Branch.findOne({ code: b.code }).lean()) as { _id: Types.ObjectId } | null;
    if (!row) row = (await Branch.create({ name: b.name, code: b.code, city: b.city })).toObject() as never;
    ids.set(b.code, String(row!._id));
    if (!(await User.findOne({ loginId: b.login }))) await User.create({ name: `${b.name} Manager`, loginId: b.login, passwordHash: mgrPw, role: 'manager', branchId: String(row!._id), active: true, mustChangePassword: false, sv: 0 });
  }
  await Settings.updateOne({ _id: 'global' }, { $set: { profile: { name: 'Cloud Packers', tagline: 'Packers & Movers', state: 'Maharashtra', gstin: '27ABCDE1234F1Z5', phone: '9876543210', address: 'Plot 12, MIDC, Nashik, Maharashtra', bankName: 'HDFC Bank', accountName: 'Cloud Packers', accountNo: '1234567890', ifsc: 'HDFC0001234', upi: 'cloudpackers@okhdfc' } } }, { upsert: true });
  await Settings.updateOne({ _id: `branch:${ids.get('BLR')}` }, { $set: { profile: { state: 'Karnataka', gstin: '29ABCDE1234F1Z5', address: 'Whitefield, Bengaluru, Karnataka', bankName: 'ICICI Bank' }, terms: { bill: ['Bengaluru branch: payment within 7 days of delivery.'] } } }, { upsert: true });

  const docs = demoDocs();
  const byNumber = new Map<string, string>();
  const max = new Map<string, number>();
  const bills: string[] = [];
  for (const d of docs) {
    const _id = new Types.ObjectId();
    const branchId = ids.get(d.branchCode)!;
    const data = { ...d.data };
    if (d.billRef && byNumber.has(d.billRef)) { data.againstId = byNumber.get(d.billRef)!; data.againstDoc = d.billRef; }
    const date = new Date(d.docDate + 'T10:00:00Z');
    await Doc.collection.insertOne({ _id, type: d.type, number: d.number, seq: d.seq, fy: d.fy, status: d.status, docDate: d.docDate, branchId, createdByName: 'Demo data', updatedByName: 'Demo data', rev: 1, data, items: d.items, meta: {}, createdAt: date, updatedAt: date } as never);
    byNumber.set(d.number, String(_id));
    if (d.type === 'bill') bills.push(String(_id));
    const k = `${d.type}|${branchId}|${d.fy}`;
    max.set(k, Math.max(max.get(k) ?? 0, d.seq));
  }
  for (const [k, seq] of max) await Counter.updateOne({ _id: k }, { $set: { seq } }, { upsert: true });
  for (const id of bills) await refreshBillMeta(id);
  console.log(`Seeded ${docs.length} documents, ${BRANCHES.length} branches and ${BRANCHES.length} managers.`);
  console.log('Admin: admin / Admin@12345   Managers: pune, mumbai, nashik, bengaluru, delhi / Manager@123');
}
main().catch((e) => { console.error(e.message || e); process.exitCode = 1; }).finally(() => mongoose.disconnect());
