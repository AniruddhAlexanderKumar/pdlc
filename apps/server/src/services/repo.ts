import type { AnswerValue, Material, Product, Supplier, Task, WorkspaceData } from '@sv/shared';
import type { Db } from '../db/index.js';
import { notFound } from '../lib/http.js';

/** Read models: turn rows into the shapes the web app uses. */

export async function loadMaterials(db: Db, workspaceId: string, ids?: string[]): Promise<Material[]> {
  if (ids && ids.length === 0) return [];
  let q = db.selectFrom('materials').selectAll().where('workspace_id', '=', workspaceId);
  if (ids) q = q.where('id', 'in', ids);
  const rows = await q.orderBy('created_at', 'desc').execute();
  if (rows.length === 0) return [];
  const quotes = await db
    .selectFrom('material_quotes')
    .selectAll()
    .where(
      'material_id',
      'in',
      rows.map((r) => r.id)
    )
    .execute();
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    category: r.category,
    unit: r.unit,
    unitPrice: r.unit_price,
    description: r.description,
    sourceUrl: r.source_url,
    notes: r.notes,
    suppliers: quotes
      .filter((q) => q.material_id === r.id)
      .map((q) => ({ supplierId: q.supplier_id, quotedPrice: q.quoted_price, moq: q.moq }))
  }));
}

export async function loadSuppliers(db: Db, workspaceId: string): Promise<Supplier[]> {
  const rows = await db.selectFrom('suppliers').selectAll().where('workspace_id', '=', workspaceId).orderBy('created_at', 'desc').execute();
  return rows.map((r) => ({ id: r.id, name: r.name, website: r.website, contact: r.contact, notes: r.notes }));
}

export async function loadProducts(db: Db, workspaceId: string, productId?: string): Promise<Product[]> {
  let q = db.selectFrom('products').selectAll().where('workspace_id', '=', workspaceId);
  if (productId) q = q.where('id', '=', productId);
  const rows = await q.orderBy('updated_at', 'desc').execute();
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);

  const [bom, tasks, answers] = await Promise.all([
    db.selectFrom('product_materials').selectAll().where('product_id', 'in', ids).orderBy('position').execute(),
    db.selectFrom('tasks').selectAll().where('product_id', 'in', ids).orderBy('position').orderBy('created_at').execute(),
    db.selectFrom('answers').select(['product_id', 'question_key', 'value']).where('product_id', 'in', ids).execute()
  ]);

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    category: r.category,
    stage: r.stage,
    imageUrl: r.image_url,
    description: r.description,
    notes: r.notes,
    targetSellingPrice: r.target_price,
    costs: { labour: r.labour, packaging: r.packaging, overhead: r.overhead },
    materials: bom.filter((b) => b.product_id === r.id).map((b) => ({ materialId: b.material_id, quantity: b.quantity })),
    tasks: tasks.filter((t) => t.product_id === r.id).map(toTask),
    answers: Object.fromEntries(answers.filter((a) => a.product_id === r.id).map((a) => [a.question_key, a.value as AnswerValue])),
    createdAt: r.created_at.toISOString(),
    updatedAt: r.updated_at.toISOString()
  }));
}

export async function loadProduct(db: Db, workspaceId: string, productId: string): Promise<Product> {
  const [p] = await loadProducts(db, workspaceId, productId);
  if (!p) throw notFound('Product');
  return p;
}

export function toTask(t: {
  id: string;
  title: string;
  description: string;
  status: Task['status'];
  due_date: string | null;
  position: number;
  completed_at: Date | null;
}): Task {
  return {
    id: t.id,
    title: t.title,
    description: t.description,
    status: t.status,
    dueDate: t.due_date,
    position: t.position,
    completedAt: t.completed_at?.toISOString() ?? null
  };
}

export async function loadWorkspaceData(db: Db, workspaceId: string): Promise<WorkspaceData> {
  const [products, materials, suppliers] = await Promise.all([
    loadProducts(db, workspaceId),
    loadMaterials(db, workspaceId),
    loadSuppliers(db, workspaceId)
  ]);
  return { products, materials, suppliers };
}

/** Throws 404 unless the product belongs to the workspace. */
export async function assertProduct(db: Db, workspaceId: string, productId: string) {
  const row = await db.selectFrom('products').select(['id', 'stage']).where('id', '=', productId).where('workspace_id', '=', workspaceId).executeTakeFirst();
  if (!row) throw notFound('Product');
  return row;
}

export async function assertMaterial(db: Db, workspaceId: string, materialId: string) {
  const row = await db.selectFrom('materials').select('id').where('id', '=', materialId).where('workspace_id', '=', workspaceId).executeTakeFirst();
  if (!row) throw notFound('Material');
  return row;
}

export async function touchProduct(db: Db, productId: string) {
  await db.updateTable('products').set({ updated_at: new Date() }).where('id', '=', productId).execute();
}
