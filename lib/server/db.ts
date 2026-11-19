import mongoose from 'mongoose';
import { mongoUri } from './env';
import { Asset, Audit, Branch, Counter, Doc, Settings, User } from './models';

const g = globalThis as unknown as { __pmMongo?: { promise: Promise<typeof mongoose> | null } };
g.__pmMongo ??= { promise: null };

export async function connectDb() {
  const state = g.__pmMongo!;
  if (mongoose.connection.readyState === 1) return mongoose;
  state.promise ??= mongoose
    .connect(mongoUri(), { serverSelectionTimeoutMS: 8000, maxPoolSize: 10 })
    .then(async (m) => {
      // make sure the unique indexes exist before the first write
      await Promise.all([Asset, Audit, Branch, Counter, Doc, Settings, User].map((x) => x.init()));
      return m;
    })
    .catch((e) => { state.promise = null; throw e; });
  return state.promise;
}
