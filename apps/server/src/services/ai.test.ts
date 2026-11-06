import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Material, Product, Supplier } from '@sv/shared';
import { checkAiHealth, listAiModels, chatCompletion, localAiProvider } from './ai.js';
import { insightsFor } from './insights.js';

const steel: Material = {
  id: 'm1',
  name: 'Steel body',
  category: 'Metals & Alloys',
  unit: 'pcs',
  unitPrice: 5.2,
  description: '',
  sourceUrl: '',
  notes: '',
  suppliers: [
    { supplierId: 's1', quotedPrice: 5.2, moq: 300 },
    { supplierId: 's2', quotedPrice: 4.6, moq: 500 }
  ]
};
const materials = new Map([[steel.id, steel]]);
const suppliers = new Map<string, Supplier>([
  ['s1', { id: 's1', name: 'Precision', website: '', contact: '', notes: '' }],
  ['s2', { id: 's2', name: 'GreenSteel', website: '', contact: '', notes: '' }]
]);

const testProduct: Product = {
  id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
  name: 'Thermal Steel Flask',
  category: 'Drinkware',
  stage: 'Prototype',
  imageUrl: '',
  description: 'Double-walled vacuum insulated flask',
  notes: '',
  targetSellingPrice: 35,
  costs: { labour: 3, packaging: 1, overhead: 1.5 },
  materials: [{ materialId: 'm1', quantity: 1 }],
  tasks: [],
  answers: {
    'planning.target_margin': 45,
    'idea.problem': 'Keep drinks cold for 24h'
  },
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString()
};

describe('Local AI Model Connection', () => {
  it('connects to health endpoint at 127.0.0.1:8091/health', async () => {
    const health = await checkAiHealth();
    assert.equal(health.healthy, true);
    assert.equal(health.status, 'ok');
    assert.equal(health.model, 'qwen2.5-14b-instruct');
  });

  it('queries models endpoint at 127.0.0.1:8091/v1/models', async () => {
    const models = await listAiModels();
    assert.ok(models && (Array.isArray(models.data) || Array.isArray(models.models)));
    const ids = Array.isArray(models.data)
      ? models.data.flatMap((m: any) => [m.id, ...(m.aliases ?? [])])
      : models.models.map((m: any) => m.name || m.id);
    assert.ok(ids.some((id: string) => id.includes('qwen2.5-14b')));
  });

  it('executes chat completion at 127.0.0.1:8091/v1/chat/completions', async () => {
    const response = await chatCompletion([
      { role: 'user', content: 'Reply with the word "PONG" only.' }
    ], {
      maxTokens: 10,
      temperature: 0.1,
      timeoutMs: 30_000
    });
    assert.ok(response.toUpperCase().includes('PONG'));
  });

  it('generates AI suggestions via localAiProvider.insights', async () => {
    const list = await localAiProvider.insights({
      product: testProduct,
      materials,
      suppliers,
      currency: 'USD'
    });
    assert.ok(Array.isArray(list));
    assert.ok(list.length > 0, 'Expected at least 1 AI insight');
    const first = list[0];
    assert.equal(first.source, 'ai');
    assert.ok(first.title);
    assert.ok(first.detail);
    assert.ok(first.id.startsWith(`ai:${testProduct.id}:`));
  });

  it('merges rule-based insights and AI suggestions in insightsFor', async () => {
    const combined = await insightsFor({
      product: testProduct,
      materials,
      suppliers,
      currency: 'USD'
    });
    assert.ok(combined.some((i) => i.source === 'rules'), 'Expected rule-based insights');
    assert.ok(combined.some((i) => i.source === 'ai'), 'Expected AI-based insights');
  });
});
