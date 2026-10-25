import { Router } from 'express';
import { z } from 'zod';
import { PRESET_IDS, resolveLayout, type DashboardSettings } from '@sv/shared';
import { auth } from '../auth/session.js';
import { db } from '../db/index.js';
import { parse, route } from '../lib/http.js';

export const dashboardRouter = Router();

dashboardRouter.get(
  '/',
  route(async (req, res) => {
    const row = await db.selectFrom('users').select('dashboard_layout').where('id', '=', auth(req).userId).executeTakeFirstOrThrow();
    res.json(resolveLayout(row.dashboard_layout));
  })
);

/**
 * Presets only for now. To open up custom layouts, accept `{ items }` here as a second shape
 * (validate with `sanitizeItems`) and store `{ preset: null, items }`; `resolveLayout` and the
 * GET above already handle it.
 */
dashboardRouter.put(
  '/',
  route(async (req, res) => {
    const { preset } = parse(z.object({ preset: z.enum(PRESET_IDS) }), req.body);
    const settings: DashboardSettings = { preset };
    await db
      .updateTable('users')
      .set({ dashboard_layout: JSON.stringify(settings) })
      .where('id', '=', auth(req).userId)
      .execute();
    res.json(resolveLayout(settings));
  })
);
