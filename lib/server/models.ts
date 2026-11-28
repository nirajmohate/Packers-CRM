import mongoose, { Schema } from 'mongoose';

/* eslint-disable @typescript-eslint/no-explicit-any */
type AnyModel = mongoose.Model<any, any, any, any, any, any>;

const base = { minimize: false, versionKey: false } as const;
const M = Schema.Types.Mixed;

function define(name: string, schema: Schema<any>): AnyModel {
  return (mongoose.models[name] as AnyModel) || (mongoose.model(name, schema) as AnyModel);
}

export const Branch = define('Branch', new Schema<any>({
  name: { type: String, required: true, trim: true },
  code: { type: String, required: true, unique: true, uppercase: true, trim: true },
  city: { type: String, default: '' },
  address: { type: String, default: '' },
  phone: { type: String, default: '' },
  phone2: { type: String, default: '' },
  active: { type: Boolean, default: true },
}, { ...base, timestamps: true }));

export const User = define('User', new Schema<any>({
  name: { type: String, required: true, trim: true },
  loginId: { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true },
  role: { type: String, enum: ['admin', 'manager', 'team'], required: true },
  branchId: { type: String, default: null },
  active: { type: Boolean, default: true },
  mustChangePassword: { type: Boolean, default: false },
  sv: { type: Number, default: 0 },
  failedLogins: { type: Number, default: 0 },
  lockUntil: { type: Date },
  lastLoginAt: { type: Date },
  /** two-step login: { enabled, secret (encrypted), pending (encrypted, while setting up), lastStep, backup: hashed one-time codes } */
  twoFactor: { type: M },
  /** hashes of devices this account has signed in from (to spot a new device) */
  knownDevices: { type: [String], default: [] },
}, { ...base, timestamps: true }));

const DocSchema = new Schema<any>({
  type: { type: String, required: true },
  number: { type: String, required: true },
  seq: Number,
  fy: String,
  status: { type: String, required: true },
  docDate: { type: String, required: true },
  branchId: { type: String, required: true },
  deletedAt: Date,
  deletedBy: String,
  deletedByName: String,
  deleteReason: String,
  cancelReason: String,
  leadId: String,
  cancelledAt: Date,
  cancelledByName: String,
  createdBy: String,
  createdByName: String,
  updatedByName: String,
  rev: { type: Number, default: 1 },
  data: { type: M, default: {} },
  items: { type: [M], default: [] },
  meta: { type: M, default: {} },
}, { ...base, timestamps: true });
DocSchema.index({ type: 1, number: 1 }, { unique: true });
DocSchema.index({ branchId: 1, docDate: -1 });
DocSchema.index({ type: 1, 'data.againstId': 1 });
DocSchema.index({ updatedAt: 1 }); // quick "what changed since" sync
export const Doc = define('Doc', DocSchema);

export const Counter = define('Counter', new Schema<any>({ _id: String, seq: { type: Number, default: 0 } }, { ...base, _id: false }));

export const Settings = define('Settings', new Schema<any>({
  _id: String,
  profile: { type: M, default: {} },
  rules: { type: M, default: {} },
  terms: { type: M, default: {} },
  updatedBy: String,
}, { ...base, _id: false, timestamps: true }));

export const Asset = define('Asset', new Schema<any>({
  kind: { type: String, required: true },
  scope: { type: String, required: true },
  mime: { type: String, required: true },
  size: Number,
  ratio: { type: Number, default: 1 },
  data: { type: Buffer, required: true },
  createdBy: String,
}, { ...base, timestamps: true }));

const AuditSchema = new Schema<any>({
  at: { type: Date, default: Date.now },
  userId: String,
  userName: String,
  role: String,
  action: { type: String, required: true },
  entity: { type: String, required: true },
  entityId: String,
  docType: String,
  docNumber: String,
  branchId: String,
  summary: String,
  changes: { type: [M], default: [] },
}, { ...base });
AuditSchema.index({ at: -1 });
AuditSchema.index({ entityId: 1, at: -1 });
export const Audit = define('Audit', AuditSchema);

/** A survey form link sent to a customer. Only a hash of the secret is kept, so the database alone cannot be used to open a link. */
const SurveyLinkSchema = new Schema<any>({
  tokenHash: { type: String, required: true, unique: true },
  branchId: { type: String, required: true },
  createdBy: String,
  createdByName: String,
  prefill: { type: M, default: {} },
  expiresAt: { type: Date, required: true },
  usedAt: Date,
  docId: String,
  docNumber: String,
  revokedAt: Date,
}, { ...base, timestamps: true });
SurveyLinkSchema.index({ branchId: 1, createdAt: -1 });
// old links are removed by MongoDB 60 days after they expire
SurveyLinkSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 60 * 86_400 });
export const SurveyLink = define('SurveyLink', SurveyLinkSchema);

/** A customer / lead added by hand by a branch owner (or the admin). Always belongs to one branch. */
const LeadSchema = new Schema<any>({
  branchId: { type: String, required: true },
  name: { type: String, default: '' },
  email: { type: String, default: '' },
  phone: { type: String, default: '' },
  leadDate: { type: String, required: true },
  moveDate: { type: String, default: '' },
  followUpDate: { type: String, default: '' },
  fromCity: { type: String, default: '' },
  toCity: { type: String, default: '' },
  fromAddress: { type: String, default: '' },
  toAddress: { type: String, default: '' },
  leadSource: { type: String, default: '' },
  leadType: { type: String, default: '' },
  shiftingType: { type: String, default: '' },
  itemType: { type: String, default: '' },
  status: { type: String, default: 'Lead generated' },
  remarks: { type: String, default: '' },
  docs: { type: [M], default: [] },
  createdBy: String,
  createdByName: String,
  updatedByName: String,
}, { ...base, timestamps: true });
LeadSchema.index({ branchId: 1, leadDate: -1 });
LeadSchema.index({ branchId: 1, phone: 1 });
export const Lead = define('Lead', LeadSchema);

/** One signed-in device (like "Login activity" in Instagram). The cookie carries a random id; only its hash is kept here. */
const SessionSchema = new Schema<any>({
  userId: { type: String, required: true, index: true },
  sidHash: { type: String, required: true, unique: true },
  device: String,
  browser: String,
  os: String,
  ip: String,
  place: String,
  lastSeenAt: Date,
  /** password typed again for a sensitive action (valid a few minutes) */
  confirmedAt: Date,
  expiresAt: { type: Date, required: true },
  revokedAt: Date,
  revokedByName: String,
}, { ...base, timestamps: true });
SessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 7 * 24 * 3600 }); // records disappear a week after they end
export const Session = define('Session', SessionSchema);

/** Security alerts for the admin (new device sign-in on an admin account). Shown on the dashboard until answered. */
const AlertSchema = new Schema<any>({
  kind: { type: String, required: true },
  userId: String,
  userName: String,
  loginId: String,
  sessionId: String,
  device: String,
  place: String,
  ip: String,
  answer: String, // 'me' | 'not-me'
  answeredByName: String,
  answeredAt: Date,
}, { ...base, timestamps: true });
AlertSchema.index({ createdAt: -1 });
export const SecurityAlert = define('SecurityAlert', AlertSchema);

/** Complaints from the website form. branchId null = waiting for the admin to forward it. */
const ComplaintSchema = new Schema<any>({
  ref: { type: String, required: true, unique: true },
  name: String, phone: String, email: String, refNumber: String, location: String, subject: String, message: String,
  extra: { type: M, default: {} },
  branchId: { type: String, default: null },
  suggestedBranchId: { type: String, default: null },
  matchedBy: { type: String, default: '' },
  matchedDocId: { type: String, default: '' },
  matchedDocType: { type: String, default: '' },
  status: { type: String, default: 'New' },
  lastActionAt: { type: Date, default: () => new Date() },
  history: { type: [M], default: [] },
  dupKey: String,
}, { ...base, timestamps: true });
ComplaintSchema.index({ branchId: 1, createdAt: -1 });
ComplaintSchema.index({ dupKey: 1, createdAt: -1 });
export const Complaint = define('Complaint', ComplaintSchema);

/** A phone (or browser) that turned on notifications. Tied to the signed-in device: signing out stops them. */
const PushSubSchema = new Schema<any>({
  userId: { type: String, required: true, index: true },
  sidHash: { type: String, required: true },
  endpoint: { type: String, required: true, unique: true },
  p256dh: { type: String, required: true },
  auth: { type: String, required: true },
  device: String,
  lastOkAt: Date,
  fails: { type: Number, default: 0 },
}, { ...base, timestamps: true });
export const PushSub = define('PushSub', PushSubSchema);

/** Which reminder went to whom, so the same reminder is not sent twice. Removed after 10 days. */
const PushLogSchema = new Schema<any>({
  key: { type: String, required: true, unique: true },
}, { ...base, timestamps: true });
PushLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 10 * 24 * 3600 });
export const PushLog = define('PushLog', PushLogSchema);
