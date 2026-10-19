import type { Material, Product } from './types.js';

const round2 = (n: number) => Math.round(n * 100) / 100;

export interface CostLine {
  materialId: string;
  quantity: number;
  material: Material | null;
  unitPrice: number;
  lineCost: number;
}

export interface CostSummary {
  materialsCost: number;
  labour: number;
  packaging: number;
  overhead: number;
  totalUnitCost: number;
  targetPrice: number | null;
  grossProfit: number | null;
  /** Percentage, one decimal place. */
  grossMargin: number | null;
  lines: CostLine[];
}

export function costSummary(product: Pick<Product, 'materials' | 'costs' | 'targetSellingPrice'>, materials: Map<string, Material>): CostSummary {
  let materialsCost = 0;
  const lines = product.materials.map((item) => {
    const material = materials.get(item.materialId) ?? null;
    const unitPrice = material ? material.unitPrice : 0;
    const lineCost = round2(item.quantity * unitPrice);
    materialsCost += lineCost;
    return { ...item, material, unitPrice, lineCost };
  });

  materialsCost = round2(materialsCost);
  const { labour, packaging, overhead } = product.costs;
  const totalUnitCost = round2(materialsCost + labour + packaging + overhead);
  const targetPrice = product.targetSellingPrice;
  const grossProfit = targetPrice !== null ? round2(targetPrice - totalUnitCost) : null;
  const grossMargin = targetPrice !== null && targetPrice > 0 ? Math.round(((targetPrice - totalUnitCost) / targetPrice) * 1000) / 10 : null;

  return { materialsCost, labour, packaging, overhead, totalUnitCost, targetPrice, grossProfit, grossMargin, lines };
}

/** Cheapest supplier quote for a material, if any is cheaper than the current unit price. */
export function cheaperQuote(material: Material) {
  const best = material.suppliers.reduce<Material['suppliers'][number] | null>(
    (acc, q) => (q.quotedPrice > 0 && (!acc || q.quotedPrice < acc.quotedPrice) ? q : acc),
    null
  );
  if (!best || best.quotedPrice >= material.unitPrice) return null;
  return { ...best, saving: round2(material.unitPrice - best.quotedPrice) };
}
