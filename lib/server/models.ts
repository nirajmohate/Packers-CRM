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
  active: { type: Boolean, default: true },
}, { ...base, timestamps: true }));

export const User = define('User', new Schema<any>({
  name: { type: String, required: true, trim: true },
  loginId: { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true },
  role: { type: String, enum: ['admin', 'manager'], required: true },
  branchId: { type: String, default: null },
  active: { type: Boolean, default: true },
  mustChangePassword: { type: Boolean, default: false },
  sv: { type: Number, default: 0 },
  failedLogins: { type: Number, default: 0 },
  lockUntil: { type: Date },
  lastLoginAt: { type: Date },
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
