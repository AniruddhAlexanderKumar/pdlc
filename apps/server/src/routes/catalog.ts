import { Router } from 'express';
import { z } from 'zod';
import { XP } from '@sv/shared';
import { auth } from '../auth/session.js';
import { db, type Db } from '../db/index.js';
import { badRequest, money, notFound, parse, route, shortText, url, uuid } from '../lib/http.js';
import { loadMaterials, loadSuppliers } from '../services/repo.js';
import { mutate, param } from './util.js';

/** Materials library and suppliers. */
export const materialsRouter = Router();
export const suppliersRouter = Router();

const quote = z.object({
  supplierId: uuid,
  quotedPrice: money,
  moq: z.coerce.number().int().min(1).max(1e9).nullable().optional()
});

const materialFields = z.object({
  name: shortText(160).min(1, 'Give the material a name'),
  category: shortText(60).min(1),
  unit: shortText(20).min(1),
  unitPrice: money,
  description: shortText(2000).default(''),
  sourceUrl: url.default(''),
  notes: shortText(4000).default(''),
  suppliers: z.array(quote).max(50).default([])
});

async function assertSuppliers(trx: Db, workspaceId: string, ids: string[]) {
  if (ids.length === 0) return;
  const unique = Array.from(new Set(ids));
  if (unique.length !== ids.length) throw badRequest('Each supplier can only be quoted once per material');
  const found = await trx.selectFrom('suppliers').select('id').where('workspace_id', '=', workspaceId).where('id', 'in', unique).execute();
  if (found.length !== unique.length) throw badRequest('Unknown supplier');
}

async function writeQuotes(trx: Db, materialId: string, quotes: z.infer<typeof quote>[]) {
  await trx.deleteFrom('material_quotes').where('material_id', '=', materialId).execute();
  if (quotes.length > 0) {
    await trx
      .insertInto('material_quotes')
      .values(quotes.map((q) => ({ material_id: materialId, supplier_id: q.supplierId, quoted_price: q.quotedPrice, moq: q.moq ?? null })))
      .execute();
  }
}

materialsRouter.get(
  '/',
  route(async (req, res) => {
    res.json(await loadMaterials(db, auth(req).workspaceId));
  })
);

materialsRouter.post(
  '/',
  route(async (req, res) => {
    const body = parse(materialFields, req.body);
    const result = await mutate(req, async (trx, ledger, ctx) => {
      await assertSuppliers(
        trx,
        ctx.workspaceId,
        body.suppliers.map((s) => s.supplierId)
      );
      const row = await trx
        .insertInto('materials')
        .values({
          workspace_id: ctx.workspaceId,
          name: body.name,
          category: body.category,
          unit: body.unit,
          unit_price: body.unitPrice,
          description: body.description,
          source_url: body.sourceUrl,
          notes: body.notes,
          updated_at: new Date()
        })
        .returning('id')
        .executeTakeFirstOrThrow();
      await writeQuotes(trx, row.id, body.suppliers);
      await ledger.award('material_created', row.id, XP.materialCreated, `Added ${body.name} to the library`);
      const [m] = await loadMaterials(trx, ctx.workspaceId, [row.id]);
      return m;
    });
    res.status(201).json(result);
  })
);

materialsRouter.patch(
  '/:id',
  route(async (req, res) => {
    const id = parse(uuid, param(req, 'id'));
    const body = parse(materialFields.partial(), req.body);
    const result = await mutate(req, async (trx, _ledger, ctx) => {
      const existing = await trx.selectFrom('materials').select('id').where('id', '=', id).where('workspace_id', '=', ctx.workspaceId).executeTakeFirst();
      if (!existing) throw notFound('Material');
      const set: Record<string, unknown> = {};
      if (body.name !== undefined) set.name = body.name;
      if (body.category !== undefined) set.category = body.category;
      if (body.unit !== undefined) set.unit = body.unit;
      if (body.unitPrice !== undefined) set.unit_price = body.unitPrice;
      if (body.description !== undefined) set.description = body.description;
      if (body.sourceUrl !== undefined) set.source_url = body.sourceUrl;
      if (body.notes !== undefined) set.notes = body.notes;
      await trx
        .updateTable('materials')
        .set({ ...set, updated_at: new Date() })
        .where('id', '=', id)
        .execute();
      if (body.suppliers) {
        await assertSuppliers(
          trx,
          ctx.workspaceId,
          body.suppliers.map((s) => s.supplierId)
        );
        await writeQuotes(trx, id, body.suppliers);
      }
      const [m] = await loadMaterials(trx, ctx.workspaceId, [id]);
      return m;
    });
    res.json(result);
  })
);

materialsRouter.delete(
  '/:id',
  route(async (req, res) => {
    const id = parse(uuid, param(req, 'id'));
    const r = await db.deleteFrom('materials').where('id', '=', id).where('workspace_id', '=', auth(req).workspaceId).executeTakeFirst();
    if (Number(r.numDeletedRows) === 0) throw notFound('Material');
    res.status(204).end();
  })
);

// ── Suppliers ──────────────────────────────────────────────────────────────

const supplierFields = z.object({
  name: shortText(160).min(1, 'Give the supplier a name'),
  website: url.default(''),
  contact: shortText(500).default(''),
  notes: shortText(4000).default(''),
  /** Quotes this supplier gives for library materials. Replaces the supplier's existing quotes. */
  quotes: z
    .array(z.object({ materialId: uuid, quotedPrice: money, moq: z.coerce.number().int().min(1).max(1e9).nullable().optional() }))
    .max(500)
    .optional()
});

async function writeSupplierQuotes(trx: Db, workspaceId: string, supplierId: string, quotes: NonNullable<z.infer<typeof supplierFields>['quotes']>) {
  const ids = Array.from(new Set(quotes.map((q) => q.materialId)));
  if (ids.length !== quotes.length) throw badRequest('Each material can only be quoted once');
  if (ids.length > 0) {
    const found = await trx.selectFrom('materials').select('id').where('workspace_id', '=', workspaceId).where('id', 'in', ids).execute();
    if (found.length !== ids.length) throw badRequest('Unknown material');
  }
  await trx.deleteFrom('material_quotes').where('supplier_id', '=', supplierId).execute();
  if (quotes.length > 0) {
    await trx
      .insertInto('material_quotes')
      .values(quotes.map((q) => ({ material_id: q.materialId, supplier_id: supplierId, quoted_price: q.quotedPrice, moq: q.moq ?? null })))
      .execute();
  }
}

suppliersRouter.get(
  '/',
  route(async (req, res) => {
    res.json(await loadSuppliers(db, auth(req).workspaceId));
  })
);

suppliersRouter.post(
  '/',
  route(async (req, res) => {
    const body = parse(supplierFields, req.body);
    const result = await mutate(req, async (trx, ledger, ctx) => {
      const row = await trx
        .insertInto('suppliers')
        .values({ workspace_id: ctx.workspaceId, name: body.name, website: body.website, contact: body.contact, notes: body.notes, updated_at: new Date() })
        .returning(['id', 'name', 'website', 'contact', 'notes'])
        .executeTakeFirstOrThrow();
      if (body.quotes) await writeSupplierQuotes(trx, ctx.workspaceId, row.id, body.quotes);
      await ledger.award('supplier_added', row.id, XP.supplierAdded, `Added supplier ${body.name}`);
      return row;
    });
    res.status(201).json(result);
  })
);

suppliersRouter.patch(
  '/:id',
  route(async (req, res) => {
    const id = parse(uuid, param(req, 'id'));
    const body = parse(supplierFields.partial(), req.body);
    const result = await mutate(req, async (trx, _ledger, ctx) => {
      const { quotes, ...fields } = body;
      const row = await trx
        .updateTable('suppliers')
        .set({ ...fields, updated_at: new Date() })
        .where('id', '=', id)
        .where('workspace_id', '=', ctx.workspaceId)
        .returning(['id', 'name', 'website', 'contact', 'notes'])
        .executeTakeFirst();
      if (!row) throw notFound('Supplier');
      if (quotes) await writeSupplierQuotes(trx, ctx.workspaceId, id, quotes);
      return row;
    });
    res.json(result);
  })
);

suppliersRouter.delete(
  '/:id',
  route(async (req, res) => {
    const id = parse(uuid, param(req, 'id'));
    const r = await db.deleteFrom('suppliers').where('id', '=', id).where('workspace_id', '=', auth(req).workspaceId).executeTakeFirst();
    if (Number(r.numDeletedRows) === 0) throw notFound('Supplier');
    res.status(204).end();
  })
);
