import type { AnswerValue, StageId, TaskStatus } from '@sv/shared';
import type { Db } from '../db/index.js';

/**
 * Example workspace content so new teams can explore before adding their own products.
 * Prices are in the workspace currency's units (written with USD in mind).
 */

const SUPPLIERS = [
  { key: 'polylite', name: 'Polylite Plastics', website: 'https://example.com/polylite', contact: 'sales@polylite.example', notes: 'Cast acrylic and die-cut packaging. Lead time 4 business days.' },
  { key: 'lumina', name: 'Lumina Components', website: 'https://example.com/lumina', contact: 'export@lumina.example', notes: 'High-CRI LED strips and USB-C PD boards. Air freight 7–10 days.' },
  { key: 'precision', name: 'Precision Metals & Alloys', website: 'https://example.com/precision', contact: 'orders@precision.example', notes: 'CNC cutting, bead-blasting and anodizing.' },
  { key: 'timber', name: 'Sahyadri Timber Works', website: 'https://example.com/timber', contact: 'ramesh@timber.example', notes: 'Kiln-dried FSC oak and walnut blocks.' },
  { key: 'greensteel', name: 'GreenSteel Recycled Metals', website: 'https://example.com/greensteel', contact: 'hello@greensteel.example', notes: '100% recycled 18/8 stainless. MOQ 500 bodies.' },
  { key: 'bamboo', name: 'Bamboo Works Co.', website: 'https://example.com/bamboo', contact: 'orders@bamboo.example', notes: 'Bamboo lids and caps with food-safe silicone seals.' }
] as const;

type SupplierKey = (typeof SUPPLIERS)[number]['key'];

const MATERIALS: {
  key: string;
  name: string;
  category: string;
  unit: string;
  unitPrice: number;
  description: string;
  quotes: { supplier: SupplierKey; price: number; moq: number | null }[];
}[] = [
  { key: 'steel', name: 'Stainless Steel Bottle Body (750 ml)', category: 'Metals & Alloys', unit: 'pcs', unitPrice: 5.2, description: 'Double-wall vacuum-insulated 18/8 steel body.', quotes: [{ supplier: 'precision', price: 5.2, moq: 300 }, { supplier: 'greensteel', price: 4.6, moq: 500 }] },
  { key: 'lid', name: 'Bamboo Lid with Silicone Seal', category: 'Wood & Timber', unit: 'pcs', unitPrice: 1.6, description: 'Leak-proof threaded lid.', quotes: [{ supplier: 'bamboo', price: 1.6, moq: 500 }] },
  { key: 'paint', name: 'Powder Coat & Logo Print', category: 'Finishes & Adhesives', unit: 'pcs', unitPrice: 1.0, description: 'Matte coral powder coat plus one-colour laser print.', quotes: [{ supplier: 'precision', price: 1.0, moq: 300 }] },
  { key: 'giftbox', name: 'Kraft Gift Box', category: 'Packaging', unit: 'pcs', unitPrice: 0.9, description: 'Recyclable kraft tube with soy-ink print.', quotes: [{ supplier: 'polylite', price: 0.9, moq: 500 }] },
  { key: 'acrylic', name: 'Cast Acrylic Sheet (3 mm Matte Diffuser)', category: 'Plastics & Acrylics', unit: 'sheet', unitPrice: 2.2, description: 'Optical-grade frosted acrylic for even light diffusion.', quotes: [{ supplier: 'polylite', price: 2.2, moq: 10 }] },
  { key: 'alu', name: 'Anodized Aluminium Extrusion', category: 'Metals & Alloys', unit: 'm', unitPrice: 3.9, description: '6063-T5 channel with heat-sink fins.', quotes: [{ supplier: 'precision', price: 3.9, moq: 20 }] },
  { key: 'led', name: 'Warm LED Strip (CRI 95+)', category: 'Electronics', unit: 'pcs', unitPrice: 1.8, description: 'Tunable-white COB strip.', quotes: [{ supplier: 'lumina', price: 1.8, moq: 50 }] },
  { key: 'pcb', name: 'USB-C PD Dimmer Board', category: 'Electronics', unit: 'pcs', unitPrice: 2.6, description: 'Capacitive touch dimmer with 20 V PD input.', quotes: [{ supplier: 'lumina', price: 2.6, moq: 50 }] },
  { key: 'oak', name: 'FSC White Oak Base Block', category: 'Wood & Timber', unit: 'pcs', unitPrice: 3.2, description: 'CNC-routed weighted base.', quotes: [{ supplier: 'timber', price: 3.2, moq: 25 }] },
  { key: 'brass', name: 'Brass Thumb Screws (M4 set)', category: 'Fasteners & Hardware', unit: 'set', unitPrice: 0.45, description: 'Set of 4 knurled tension screws.', quotes: [{ supplier: 'precision', price: 0.45, moq: 100 }] },
  { key: 'kraft', name: 'Moulded Pulp Retail Box', category: 'Packaging', unit: 'pcs', unitPrice: 0.7, description: 'Double-wall kraft mailer with pulp tray.', quotes: [{ supplier: 'polylite', price: 0.7, moq: 100 }] }
];

const PRODUCTS: {
  name: string;
  category: string;
  stage: StageId;
  imageUrl: string;
  description: string;
  notes: string;
  price: number | null;
  costs: [number, number, number];
  bom: [string, number][];
  tasks: [string, TaskStatus, number][];
  answers: Record<string, AnswerValue>;
}[] = [
  {
    name: 'Coral Steel Water Bottle',
    category: 'Drinkware',
    stage: 'Prototype',
    imageUrl: 'https://images.unsplash.com/photo-1602143407151-7111542de6e8?auto=format&fit=crop&w=400&q=80',
    description: 'Reusable insulated steel bottle with a bamboo lid. Keeps drinks cold for 24 hours.',
    notes: 'Prototype v2 passed the 24 h cold test. Waiting on the recycled-steel sample.',
    price: 29,
    costs: [2.0, 0, 1.2],
    bom: [['steel', 1], ['lid', 1], ['paint', 1], ['giftbox', 1]],
    tasks: [
      ['Order 20 prototype bodies', 'done', -6],
      ['Run 24-hour cold retention test', 'done', -2],
      ['Get recycled-steel sample from GreenSteel', 'in_progress', 3],
      ['Drop test with the bamboo lid', 'todo', 8]
    ],
    answers: {
      'idea.problem': 'People buy single-use plastic bottles because reusable ones are heavy, ugly or leak in their bag.',
      'idea.customer': 'Commuters and gym-goers aged 20–40 who care about design and sustainability.',
      'idea.oneliner': 'Reusable insulated steel bottle with a bamboo lid. Keeps drinks cold for 24 hours.',
      'idea.category': 'Drinkware',
      'idea.excitement': 5,
      'research.competitors': 'Hydro Flask ($35–45), Chilly’s ($30), Stanley ($35).',
      'research.market_price': 32,
      'research.validated': true,
      'research.differentiator': 'Lighter body, plastic-free lid and a colour range nobody else offers.',
      'research.channels': ['Own website', 'Marketplaces'],
      'planning.target_price': 29,
      'planning.target_margin': 55,
      'planning.first_batch': 500,
      'planning.launch_date': '2027-03-01',
      'design.must_haves': 'Leak-proof lid, 24 h cold, fits a car cup holder.',
      'design.materials_chosen': true,
      'prototype.version': 'v2+'
    }
  },
  {
    name: 'Luma Arc Desk Lamp',
    category: 'Lighting',
    stage: 'Testing',
    imageUrl: 'https://images.unsplash.com/photo-1507473885765-e6ed057f782c?auto=format&fit=crop&w=400&q=80',
    description: 'Minimal desk lamp with glare-free diffusion, touch dimming and USB-C power.',
    notes: 'Housing peaks at 39 °C after 4 hours at full brightness.',
    price: 39,
    costs: [2.8, 0.7, 1.1],
    bom: [['acrylic', 0.5], ['alu', 0.6], ['led', 1], ['pcb', 1], ['oak', 1], ['brass', 1]],
    tasks: [
      ['Laser-cut diffusers for 10 units', 'done', -9],
      ['Validate touch sensitivity through 1.5 mm wall', 'done', -5],
      ['48-hour thermal soak test', 'in_progress', 1],
      ['Approve packaging drop-test samples', 'todo', 9]
    ],
    answers: {
      'idea.problem': 'Desk lamps either glare or look like office equipment.',
      'idea.customer': 'Designers and remote workers with small desks.',
      'research.market_price': 45,
      'planning.target_price': 39,
      'planning.target_margin': 50
    }
  },
  {
    name: 'Orbit Magnetic Cable Puck',
    category: 'Accessories',
    stage: 'Launch',
    imageUrl: 'https://images.unsplash.com/photo-1544816155-12df9643f363?auto=format&fit=crop&w=400&q=80',
    description: 'Weighted oak and brass desk anchor that holds three charging cables.',
    notes: 'First batch of 250 passed QC. Live on the store.',
    price: 12,
    costs: [0.8, 0.45, 0.35],
    bom: [['oak', 0.35], ['brass', 1], ['kraft', 1]],
    tasks: [
      ['Final QC on batch #01', 'done', -17],
      ['Publish product photography', 'done', -10],
      ['Ship first 50 pre-orders', 'done', -5]
    ],
    answers: {}
  },
  {
    name: 'Halo Ambient Nightlight',
    category: 'Lighting',
    stage: 'Idea',
    imageUrl: 'https://images.unsplash.com/photo-1513506003901-1e6a229e2d15?auto=format&fit=crop&w=400&q=80',
    description: 'Plug-in wall light made from acrylic offcuts left over from the Luma Arc.',
    notes: '',
    price: null,
    costs: [0, 0, 0],
    bom: [['acrylic', 0.25], ['led', 0.5]],
    tasks: [['Sketch 3 concepts using 200 × 200 mm offcuts', 'todo', 11]],
    answers: {}
  }
];

function daysFromNow(days: number) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export async function loadSampleData(trx: Db, workspaceId: string, userId: string, options: { omitExternalImages?: boolean } = {}) {
  const supplierIds = new Map<string, string>();
  for (const s of SUPPLIERS) {
    const row = await trx
      .insertInto('suppliers')
      .values({ workspace_id: workspaceId, name: s.name, website: s.website, contact: s.contact, notes: s.notes, updated_at: new Date() })
      .returning('id')
      .executeTakeFirstOrThrow();
    supplierIds.set(s.key, row.id);
  }

  const materialIds = new Map<string, string>();
  for (const m of MATERIALS) {
    const row = await trx
      .insertInto('materials')
      .values({ workspace_id: workspaceId, name: m.name, category: m.category, unit: m.unit, unit_price: m.unitPrice, description: m.description, updated_at: new Date() })
      .returning('id')
      .executeTakeFirstOrThrow();
    materialIds.set(m.key, row.id);
    await trx
      .insertInto('material_quotes')
      .values(m.quotes.map((q) => ({ material_id: row.id, supplier_id: supplierIds.get(q.supplier)!, quoted_price: q.price, moq: q.moq })))
      .execute();
  }

  for (const p of PRODUCTS) {
    const row = await trx
      .insertInto('products')
      .values({
        workspace_id: workspaceId,
        name: p.name,
        category: p.category,
        stage: p.stage,
        image_url: options.omitExternalImages ? '' : p.imageUrl,
        description: p.description,
        notes: p.notes,
        target_price: p.price,
        labour: p.costs[0],
        packaging: p.costs[1],
        overhead: p.costs[2],
        created_by: userId,
        updated_at: new Date()
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    await trx.insertInto('stage_history').values({ product_id: row.id, from_stage: null, to_stage: p.stage, user_id: userId }).execute();
    if (p.bom.length) {
      await trx
        .insertInto('product_materials')
        .values(p.bom.map(([key, quantity], position) => ({ product_id: row.id, material_id: materialIds.get(key)!, quantity, position })))
        .execute();
    }
    if (p.tasks.length) {
      await trx
        .insertInto('tasks')
        .values(
          p.tasks.map(([title, status, due], position) => ({
            product_id: row.id,
            title,
            status,
            due_date: daysFromNow(due),
            position: position + 1,
            completed_at: status === 'done' ? new Date() : null,
            updated_at: new Date()
          }))
        )
        .execute();
    }
    const answers = Object.entries(p.answers);
    if (answers.length) {
      await trx
        .insertInto('answers')
        .values(answers.map(([key, value]) => ({ product_id: row.id, question_key: key, value: JSON.stringify(value), answered_by: userId, answered_at: new Date() })))
        .execute();
    }
  }
}
