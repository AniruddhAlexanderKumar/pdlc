import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../server.js';

describe('NexGen PLM REST API Integration Endpoints', () => {
  let authToken = '';

  it('GET /health returns 200 and operational status', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  it('POST /api/v1/auth/login authenticates test engineer', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'engineer@nexgen.os', password: 'password123' });

    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
    expect(res.body.user.email).toBe('engineer@nexgen.os');
    authToken = res.body.token;
  });

  it('GET /api/v1/projects/PRJ-AERO-01/telemetry returns authoritative live metrics', async () => {
    const res = await request(app)
      .get('/api/v1/projects/PRJ-AERO-01/telemetry')
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    expect(res.body.totalReqs).toBeGreaterThanOrEqual(4);
    expect(res.body.totalTests).toBeGreaterThanOrEqual(3);
    expect(res.body.failedTests).toBeGreaterThanOrEqual(1);
    expect(res.body.isReleaseReady).toBe(false); // Gated because of failed dynamic test
  });

  it('POST /api/v1/changes/impact-analysis returns real ripple impacts', async () => {
    const res = await request(app)
      .post('/api/v1/changes/impact-analysis')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        projectId: 'PRJ-AERO-01',
        targetReqId: 'REQ-002',
      });

    expect(res.status).toBe(200);
    expect(res.body.target.id).toBe('REQ-002');
    expect(res.body.impacts.length).toBeGreaterThan(0);
  });

  it('GET /api/v1/organization/current returns valid commercial entitlements', async () => {
    const res = await request(app)
      .get('/api/v1/organization/current')
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    expect(res.body.organization.name).toBeDefined();
    expect(res.body.entitlements.canManageCCB).toBe(true);
    expect(res.body.entitlements.supportSla).toBeDefined();
  });

  it('POST /api/v1/organization/support creates an auditable support ticket', async () => {
    const res = await request(app)
      .post('/api/v1/organization/support')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        title: 'DO-254 Hardware Review Guidance',
        description: 'Customer requests formal alignment on PCBA inverter review verification evidence.',
        category: 'Compliance Audit',
        severity: 'High',
      });

    expect(res.status).toBe(201);
    expect(res.body.id).toMatch(/^TKT-/);
    expect(res.body.status).toBe('Open');
  });
});
