import { createHash } from 'crypto';
import { OPEN_STATUSES } from '@/lib/complaints';
import { Complaint, Doc, PushLog, PushSub, Session, User } from './models';
import { pushConfigured, sendPush, type PushMessage } from './webpush';

type Rec = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
export type Slot = 'morning' | 'evening';

/** Today and tomorrow in India (the server runs on UTC). */
export function indiaDates(now = new Date()) {
  const ist = new Date(now.getTime() + 5.5 * 3600_000);
  const today = ist.toISOString().slice(0, 10);
  const tomorrow = new Date(ist.getTime() + 86_400_000).toISOString().slice(0, 10);
  return { today, tomorrow, hour: ist.getUTCHours() };
}

/** Phones of these people that are still signed in (signing out of a device stops its notifications). */
async function liveSubs(userIds: string[]) {
  if (!userIds.length) return [] as Rec[];
  const subs = (await PushSub.find({ userId: { $in: userIds } }).lean()) as Rec[];
  if (!subs.length) return subs;
  const sessions = (await Session.find({ sidHash: { $in: subs.map((s) => s.sidHash) } }).select('sidHash userId expiresAt revokedAt').lean()) as Rec[];
  const ok = new Set(sessions.filter((s) => !s.revokedAt && new Date(s.expiresAt).getTime() > Date.now()).map((s) => `${s.userId}|${s.sidHash}`));
  return subs.filter((s) => ok.has(`${s.userId}|${s.sidHash}`));
}

/** Sends to every phone in the list and tidies up phones that no longer accept notifications. */
export async function deliver(subs: Rec[], msg: PushMessage) {
  let sent = 0;
  await Promise.all(subs.map(async (s) => {
    const status = await sendPush({ endpoint: s.endpoint, p256dh: s.p256dh, auth: s.auth }, msg);
    if (status >= 200 && status < 300) {
      sent++;
      await PushSub.updateOne({ _id: s._id }, { $set: { lastOkAt: new Date(), fails: 0 } });
    } else if (status === 404 || status === 410) {
      await PushSub.deleteOne({ _id: s._id }); // the phone turned notifications off or the app was removed
    } else {
      const r = (await PushSub.findOneAndUpdate({ _id: s._id }, { $inc: { fails: 1 } }, { new: true }).lean()) as Rec | null;
      if (r && Number(r.fails) >= 20) await PushSub.deleteOne({ _id: s._id });
    }
  }));
  return sent;
}

/** true the first time a key is seen (the same reminder is never sent twice, even if the job runs twice). */
async function firstTime(key: string) {
  try {
    await PushLog.create({ key });
    return true;
  } catch {
    return false;
  }
}

const list = (lines: string[], max = 3) => lines.slice(0, max).join('\n') + (lines.length > max ? `\n+${lines.length - max} more` : '');
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * The reminders. Morning: packing today and tomorrow + complaints with no action for 48 hours.
 * Evening: the 48-hour complaints again (only those still waiting).
 * Admin gets every branch; a branch owner (TSM) only their own branch. The team gets none.
 */
export async function runReminders(slot: Slot, now = new Date()) {
  const result = { slot, packingSent: 0, complaintSent: 0, people: 0, configured: pushConfigured() };
  if (!result.configured) return result;
  const { today, tomorrow } = indiaDates(now);

  const people = (await User.find({ active: true, role: { $in: ['admin', 'manager'] } }).select('_id role branchId').lean()) as Rec[];
  const subs = await liveSubs(people.map((u) => String(u._id)));
  const subsOf = new Map<string, Rec[]>();
  for (const s of subs) subsOf.set(String(s.userId), [...(subsOf.get(String(s.userId)) ?? []), s]);
  const reach = people.filter((u) => subsOf.has(String(u._id)));
  result.people = reach.length;
  if (!reach.length) return result;
  const sees = (u: Rec, branchId: string | null | undefined) => u.role === 'admin' || (!!branchId && String(u.branchId) === String(branchId));

  /* ----- packing today / tomorrow (morning only) ----- */
  if (slot === 'morning') {
    const docs = (await Doc.find({
      type: { $in: ['packing', 'quotation'] },
      deletedAt: { $exists: false },
      status: { $nin: ['Rejected', 'Cancelled'] },
      'data.packingDate': { $in: [today, tomorrow] },
    }).select('type number branchId data.customerName data.customerPhone data.packingDate data.fromCity data.toCity').lean()) as Rec[];
    // the same customer on the same day counts once (packing list before quotation), like the dashboard
    const best = new Map<string, Rec>();
    for (const d of docs) {
      const k = `${String(d.data?.customerPhone || d.data?.customerName || d._id).trim().toLowerCase()}|${d.data?.packingDate}`;
      const cur = best.get(k);
      if (!cur) { best.set(k, d); continue; }
      const [keep, other] = d.type === 'packing' && cur.type !== 'packing' ? [d, cur] : [cur, d];
      keep.data = { ...keep.data, fromCity: keep.data.fromCity || other.data?.fromCity, toCity: keep.data.toCity || other.data?.toCity };
      best.set(k, keep);
    }
    const jobs = [...best.values()].sort((a, b) => String(a.data.packingDate).localeCompare(String(b.data.packingDate)));
    for (const u of reach) {
      const mine = jobs.filter((d) => sees(u, d.branchId));
      if (!mine.length) continue;
      if (!(await firstTime(`packing:${u._id}:${today}`))) continue;
      const nToday = mine.filter((d) => d.data.packingDate === today).length;
      const nTomorrow = mine.length - nToday;
      const title = ['Packing', nToday ? `${nToday} today` : '', nTomorrow ? `${nTomorrow} tomorrow` : ''].filter(Boolean).join(' · ');
      const lines = mine.map((d) => {
        const when = d.data.packingDate === today ? 'Today' : 'Tomorrow';
        const route = [d.data.fromCity, d.data.toCity].filter(Boolean).join(' → ');
        return `${when}: ${d.data.customerName || d.number}${route ? ` (${route})` : ''}`;
      });
      result.packingSent += await deliver(subsOf.get(String(u._id)) ?? [], { title, body: list(lines), url: '/', tag: `packing-${today}` });
    }
  }

  /* ----- complaints with no action for 48 hours ----- */
  const late = (await Complaint.find({ status: { $in: [...OPEN_STATUSES] }, lastActionAt: { $lt: new Date(now.getTime() - 48 * 3600_000) } })
    .select('ref name branchId location lastActionAt').sort({ lastActionAt: 1 }).lean()) as Rec[];
  for (const u of reach) {
    // the admin also hears about complaints not yet forwarded to any branch
    const mine = late.filter((c) => (u.role === 'admin' ? true : sees(u, c.branchId)));
    if (!mine.length) continue;
    const ids = createHash('sha256').update(mine.map((c) => String(c._id)).join(',')).digest('hex').slice(0, 12);
    if (!(await firstTime(`overdue:${u._id}:${today}:${slot}:${ids}`))) continue;
    const lines = mine.map((c) => `${c.ref} · ${c.name || 'Customer'}${c.location ? ` · ${c.location}` : ''}`);
    result.complaintSent += await deliver(subsOf.get(String(u._id)) ?? [], {
      title: `${plural(mine.length, 'complaint', 'complaints')} waiting over 48 h`,
      body: list(lines),
      url: '/complaints?view=overdue',
      tag: 'complaints-overdue',
    });
  }
  return result;
}
