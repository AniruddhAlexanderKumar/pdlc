import express from 'express';
import { z } from 'zod';
import { config } from '../config.js';
import { route } from '../lib/http.js';
import { db } from '../db/index.js';

export const foundersConsoleRouter = express.Router();

// Validation schemas
const orgSchema = z.object({
  name: z.string().min(2).max(100),
});

const userSchema = z.object({
  email: z.string().email(),
  name: z.string().optional(),
  role: z.enum(['owner', 'admin', 'member']).default('member'),
});

// GET /api/founders/organizations - List organizations
foundersConsoleRouter.get(
  '/organizations',
  route(async (req, res) => {
    try {
      // In a full implementation, this would query the database
      // For now, return sample data based on workspace
      const workspaceId = req.headers['x-workspace-id'] as string || '';
      
      // Sample organizations - in production, query from DB
      const organizations = [
        { id: '1', name: 'Solution Velocity', memberCount: 15, role: 'owner' },
        { id: '2', name: 'Acme Corp', memberCount: 8, role: 'owner' },
      ];
      
      res.json({ organizations });
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch organizations' });
    }
  })
);

// POST /api/founders/organizations - Create organization
foundersConsoleRouter.post(
  '/organizations',
  route(async (req, res) => {
    try {
      const body = orgSchema.parse(req.body);
      const workspaceId = req.headers['x-workspace-id'] as string || '';
      
      // In production, insert into database
      const newOrg = {
        id: Date.now().toString(),
        name: body.name,
        memberCount: 1,
        role: 'owner',
      };
      
      res.status(201).json({ organization: newOrg });
    } catch (error) {
      res.status(400).json({ error: 'Invalid organization data' });
    }
  })
);

// DELETE /api/founders/organizations/:id - Delete organization
foundersConsoleRouter.delete(
  '/organizations/:id',
  route(async (req, res) => {
    try {
      const orgId = req.params.id;
      const workspaceId = req.headers['x-workspace-id'] as string || '';
      
      // In production, delete from database
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: 'Failed to delete organization' });
    }
  })
);

// GET /api/founders/users - List users
foundersConsoleRouter.get(
  '/users',
  route(async (req, res) => {
    try {
      const workspaceId = req.headers['x-workspace-id'] as string || '';
      
      // Sample users - in production, query from DB
      const users = [
        { id: '1', email: 'founder@solution-velocity.com', name: 'Founder User', role: 'owner', workspaceId: '1' },
        { id: '2', email: 'admin@solution-velocity.com', name: 'Admin User', role: 'admin', workspaceId: '1' },
      ];
      
      res.json({ users });
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch users' });
    }
  })
);

// POST /api/founders/users - Create user
foundersConsoleRouter.post(
  '/users',
  route(async (req, res) => {
    try {
      const body = userSchema.parse(req.body);
      const newUser = {
        id: Date.now().toString(),
        email: body.email,
        name: body.name || body.email.split('@')[0],
        role: body.role,
        workspaceId: req.headers['x-workspace-id'] as string || '',
      };
      
      res.status(201).json({ user: newUser });
    } catch (error) {
      res.status(400).json({ error: 'Invalid user data' });
    }
  })
);

// DELETE /api/founders/users/:id - Delete user
foundersConsoleRouter.delete(
  '/users/:id',
  route(async (req, res) => {
    try {
      const userId = req.params.id;
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: 'Failed to delete user' });
    }
  })
);

// GET /api/founders/settings - Get settings
foundersConsoleRouter.get(
  '/settings',
  route(async (req, res) => {
    try {
      res.json({
        nvidiaApiKeyConfigured: !!config.AI_NVIDIA_API_KEY,
        insightsProvider: config.INSIGHTS_PROVIDER,
        allowSignup: config.ALLOW_SIGNUP,
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch settings' });
    }
  })
);

export { foundersConsoleRouter };