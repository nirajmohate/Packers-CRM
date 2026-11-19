import { config } from 'dotenv';
config({ path: '.env.local' });
config();
import mongoose from 'mongoose';
import { connectDb } from '../lib/server/db';
import { Branch, User } from '../lib/server/models';
import { hashPassword, passwordProblem } from '../lib/server/auth';

/** Creates an admin from the command line:  npm run seed:admin -- <login id> <password> */
async function main() {
  const [argLogin, argPassword] = process.argv.slice(2);
  const loginId = (argLogin || process.env.ADMIN_LOGIN || 'admin').toLowerCase();
  const password = argPassword || process.env.ADMIN_PASSWORD || '';
  const name = process.env.ADMIN_NAME || 'Admin';
  const problem = passwordProblem(password, loginId);
  if (problem) throw new Error(`${problem}. Example: npm run seed:admin -- admin MyPass123`);
  await connectDb();
  if (await User.findOne({ loginId })) { console.log(`User "${loginId}" already exists. Nothing to do.`); return; }
  if (!(await Branch.countDocuments())) await Branch.create({ name: 'Head Office', code: 'HO' });
  await User.create({ name, loginId, passwordHash: await hashPassword(password), role: 'admin', branchId: null, active: true, mustChangePassword: false, sv: 0 });
  console.log(`Admin "${loginId}" created. Sign in at /login.`);
}
main().catch((e) => { console.error(e.message || e); process.exitCode = 1; }).finally(() => mongoose.disconnect());
