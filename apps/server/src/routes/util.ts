import type { Request } from 'express';
import type { WithXp } from '@sv/shared';
import { auth, type AuthContext } from '../auth/session.js';
import { db } from '../db/index.js';
import type { Db } from '../db/index.js';
import { XpLedger } from '../services/xp.js';

/** Runs a mutation in a transaction with an XP ledger and returns `{ data, xp }`. */
export async function mutate<T>(req: Request, fn: (trx: Db, ledger: XpLedger, ctx: AuthContext) => Promise<T>): Promise<WithXp<T>> {
  const ctx = auth(req);
  return db.transaction().execute(async (trx) => {
    const ledger = new XpLedger(trx, ctx);
    const data = await fn(trx, ledger, ctx);
    return { data, xp: ledger.awards };
  });
}

export function param(req: Request, name: string): string {
  return String(req.params[name]);
}
