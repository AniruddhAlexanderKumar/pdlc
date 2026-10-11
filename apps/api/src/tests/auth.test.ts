import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../server.js';

describe('Authentication & SaaS Workflows Integration Test Suite', () => {
  let authToken = '';
  const testEmail = `pilot_${Date.now()}@flight-eng.com`;
  let resetToken = '';

  it('POST /api/v1/auth/register successfully registers new organization user', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({
        name: 'Chief Test Pilot Marcus',
        email: testEmail,
        password: 'PilotPassword!123',
        organizationName: 'Stratospheric Dynamics Corp',
      });

    expect(res.status).toBe(201);
    expect(res.body.token).toBeDefined();
    expect(res.body.user.email).toBe(testEmail);
    expect(res.body.user.role).toBe('OrgAdmin');
    authToken = res.body.token;
  });

  it('POST /api/v1/auth/login authenticates registered user', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({
        email: testEmail,
        password: 'PilotPassword!123',
      });

    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
    expect(res.body.user.email).toBe(testEmail);
  });

  it('POST /api/v1/auth/login rejects incorrect password', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({
        email: testEmail,
        password: 'WrongPassword456',
      });

    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/Invalid email or password/i);
  });

  it('POST /api/v1/auth/forgot-password creates single-use password reset token', async () => {
    const res = await request(app)
      .post('/api/v1/auth/forgot-password')
      .send({ email: testEmail });

    expect(res.status).toBe(200);
    expect(res.body.message).toBeDefined();
    expect(res.body.devToken).toBeDefined();
    resetToken = res.body.devToken;
  });

  it('POST /api/v1/auth/reset-password updates password using token', async () => {
    const res = await request(app)
      .post('/api/v1/auth/reset-password')
      .send({
        token: resetToken,
        newPassword: 'BrandNewPilotPassword!999',
      });

    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/password has been successfully reset/i);

    // Verify login with new password
    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({
        email: testEmail,
        password: 'BrandNewPilotPassword!999',
      });
    expect(loginRes.status).toBe(200);
  });

  it('GET /api/v1/auth/me returns authenticated profile and status', async () => {
    const res = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe(testEmail);
    expect(res.body.user.status).toBe('Active');
  });

  it('PATCH /api/v1/auth/me/profile updates profile and timezone preferences', async () => {
    const res = await request(app)
      .patch('/api/v1/auth/me/profile')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        name: 'Commander Marcus Vance',
        title: 'Executive Flight Test Director',
        timezone: 'America/Denver',
        notificationPrefs: {
          changeOrderNotices: true,
          baselineReleases: false,
        },
      });

    expect(res.status).toBe(200);
    expect(res.body.user.name).toBe('Commander Marcus Vance');
    expect(res.body.user.timezone).toBe('America/Denver');
  });

  it('POST /api/v1/auth/contact submits customer inquiry to database', async () => {
    const res = await request(app)
      .post('/api/v1/auth/contact')
      .send({
        name: 'Dr. Sarah Connor',
        workEmail: 's.connor@cyberdyne-aerospace.com',
        organization: 'Cyberdyne Aerospace Labs',
        role: 'VP Systems Engineering',
        areaOfInterest: 'eVTOL Dual Redundant Flight Control',
        message: 'Requesting on-premises deployment consultation and compliance evaluation.',
      });

    expect(res.status).toBe(201);
    expect(res.body.message).toMatch(/Inquiry received/i);
    expect(res.body.inquiryId).toBeDefined();
  });

  it('GET /api/v1/auth/notifications returns in-app notification events', async () => {
    const res = await request(app)
      .get('/api/v1/auth/notifications')
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThanOrEqual(1);
  });
});
