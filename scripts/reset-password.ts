import { config } from 'dotenv';
config({ path: '.env.local' });
config();
import mongoose from 'mongoose';
import { connectDb } from '../lib/server/db';
import { User } from '../lib/server/models';
import { hashPassword, passwordProblem } from '../lib/server/auth';

/**
 *   npm run reset-password                       lists every user (login ID, role, status)
 *   npm run reset-password -- admin NewPass@123  sets a new password for that login ID and unlocks the account
 */
async function main() {
  const [loginArg, password] = process.argv.slice(2);
  await connectDb();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const users = (await User.find({}).sort({ role: 1, loginId: 1 }).lean()) as Array<Record<string, any>>;
  if (!loginArg) {
    if (!users.length) console.log('There are no users yet. Open http://localhost:3000/setup in the browser to create the admin.');
    else { console.log('Users in this database:'); for (const u of users) console.log(`  ${String(u.loginId).padEnd(30)} ${String(u.role).padEnd(8)} ${u.active ? 'active' : 'INACTIVE'}`); console.log('\nTo set a new password:  npm run reset-password -- <login id> <new password>'); }
    return;
  }
  const loginId = loginArg.toLowerCase();
  const u = users.find((x) => x.loginId === loginId);
  if (!u) { console.log(`No user "${loginId}". Existing login IDs: ${users.map((x) => x.loginId).join(', ') || '(none)'}`); process.exitCode = 1; return; }
  const problem = passwordProblem(password || '', loginId);
  if (problem) { console.log(problem + '. Example: npm run reset-password -- ' + loginId + ' MyNewPass123'); process.exitCode = 1; return; }
  await User.updateOne({ _id: u._id }, { $set: { passwordHash: await hashPassword(password), mustChangePassword: false, active: true, failedLogins: 0 }, $unset: { lockUntil: '' }, $inc: { sv: 1 } });
  console.log(`Password for "${loginId}" changed. You can sign in now.`);
}
main().catch((e) => { console.error(e.message || e); process.exitCode = 1; }).finally(() => mongoose.disconnect());
