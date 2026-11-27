import { config } from 'dotenv';
config({ path: '.env.local' });
config();
import mongoose from 'mongoose';
import { connectDb } from '../lib/server/db';

/**
 * DELETES EVERYTHING in the database in MONGODB_URI: users, branches, documents, customers, settings,
 * audit log, devices… Afterwards the website shows the one-time setup page again (admin + the 17 branches).
 *
 *   npm run wipe-all                    shows which database it would delete, deletes nothing
 *   npm run wipe-all -- <database name> deletes it (you must type the exact database name)
 */
async function main() {
  const typed = process.argv[2];
  await connectDb();
  const db = mongoose.connection.db;
  if (!db) throw new Error('Not connected');
  const name = db.databaseName;
  const host = mongoose.connection.host;
  const cols = await db.listCollections().toArray();
  const counts = await Promise.all(cols.map(async (c) => [c.name, await db.collection(c.name).countDocuments()] as const));
  console.log(`Database "${name}" on ${host}`);
  for (const [n, k] of counts) console.log(`  ${n.padEnd(20)} ${k} record(s)`);
  if (typed !== name) {
    console.log(`\nNothing was deleted. To delete ALL of the above for good, run:\n  npm run wipe-all -- ${name}\n`);
    return;
  }
  for (const c of cols) await db.collection(c.name).drop();
  console.log(`\nDeleted ${cols.length} collection(s). Open the website: it now shows the one-time setup page.`);
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => mongoose.disconnect());
