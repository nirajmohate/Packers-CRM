import { audit } from './audit';
import type { SessionUser } from '../types';
import { Branch, Doc, Lead, Settings, User } from './models';

/** Older versions made a "Head Office" (code HO) branch during first-run setup. The business has no head office. */
const MADE_BEFORE = new Date('2026-11-27T00:00:00Z');

/**
 * Runs when the admin opens the app. Removes that setup-made branch if nothing uses it; if it already has
 * documents or customers it is hidden instead (deactivated), so no data is lost — it stays in Branches and
 * "Admin (all branches)". A branch someone creates later with the same name is never touched.
 */
export async function retireSetupHeadOffice(user: SessionUser) {
  try {
    const ho = (await Branch.findOne({ code: 'HO', name: /^head office$/i, active: { $ne: false }, createdAt: { $lt: MADE_BEFORE } }).lean()) as Record<string, unknown> | null;
    if (!ho) return;
    const id = String(ho._id);
    const [docs, users, leads] = await Promise.all([Doc.countDocuments({ branchId: id }), User.countDocuments({ branchId: id, active: true }), Lead.countDocuments({ branchId: id })]);
    if (users) return; // someone still works there: leave it for the admin to decide in Branches
    if (!docs && !leads && !(await User.countDocuments({ branchId: id }))) {
      await Branch.deleteOne({ _id: id });
      await Settings.deleteOne({ _id: `branch:${id}` });
      await audit(user, { action: 'delete', entity: 'branch', entityId: id, summary: 'Removed the unused "Head Office" branch made at setup' });
    } else {
      await Branch.updateOne({ _id: id }, { $set: { active: false } });
      await audit(user, { action: 'update', entity: 'branch', entityId: id, summary: `Hid the "Head Office" branch made at setup (it keeps its ${docs} document(s) and ${leads} customer(s))`, changes: [{ field: 'active', from: 'true', to: 'false' }] });
    }
  } catch (e) {
    console.error('[head office] cleanup skipped', e);
  }
}
