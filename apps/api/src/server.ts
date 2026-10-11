import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { connectDatabase, prisma } from './db.js';
import { seedDatabase } from './seed.js';

import authRoutes from './routes/authRoutes.js';
import projectRoutes from './routes/projectRoutes.js';
import requirementRoutes from './routes/requirementRoutes.js';
import architectureRoutes from './routes/architectureRoutes.js';
import verificationRoutes from './routes/verificationRoutes.js';
import riskRoutes from './routes/riskRoutes.js';
import nonconformanceRoutes from './routes/nonconformanceRoutes.js';
import changeRoutes from './routes/changeRoutes.js';
import baselineRoutes from './routes/baselineRoutes.js';
import releaseRoutes from './routes/releaseRoutes.js';
import documentRoutes from './routes/documentRoutes.js';
import opportunityRoutes from './routes/opportunityRoutes.js';
import taskRoutes from './routes/taskRoutes.js';
import auditRoutes from './routes/auditRoutes.js';
import searchRoutes from './routes/searchRoutes.js';
import organizationRoutes from './routes/organizationRoutes.js';

dotenv.config();

export const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors({
  origin: '*',
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Health Check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'NexGen PLM - Systems Engineering Operating System API',
    database: 'PostgreSQL authoritative connected',
    timestamp: new Date().toISOString(),
  });
});
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'NexGen PLM - Systems Engineering Operating System API',
    database: 'PostgreSQL authoritative connected',
    timestamp: new Date().toISOString(),
  });
});

// Seed API endpoint for instant demonstration setup / reset
app.post('/api/v1/system/seed', async (req, res) => {
  try {
    await seedDatabase();
    res.json({ message: 'Demonstration workspace successfully initialized and seeded with authentic engineering data.' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Mount Routes
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/projects', projectRoutes);
app.use('/api/v1/requirements', requirementRoutes);
app.use('/api/v1/architecture', architectureRoutes);
app.use('/api/v1/verification', verificationRoutes);
app.use('/api/v1/risks', riskRoutes);
app.use('/api/v1/nonconformances', nonconformanceRoutes);
app.use('/api/v1/changes', changeRoutes);
app.use('/api/v1/baselines', baselineRoutes);
app.use('/api/v1/releases', releaseRoutes);
app.use('/api/v1/documents', documentRoutes);
app.use('/api/v1/opportunities', opportunityRoutes);
app.use('/api/v1/tasks', taskRoutes);
app.use('/api/v1/audit', auditRoutes);
app.use('/api/v1/search', searchRoutes);
app.use('/api/v1/organization', organizationRoutes);

// Error Handling Middleware
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('[API Error]', err);
  res.status(err.status || 500).json({
    error: err.message || 'An unexpected error occurred in the engineering operating system.',
    code: err.code || 'INTERNAL_ERROR',
  });
});

// Start Server if not imported by test
if (process.env.NODE_ENV !== 'test') {
  connectDatabase()
    .then(async () => {
      // Check if project exists, if not seed initial demo automatically
      const projectCount = await prisma.project.count();
      if (projectCount === 0) {
        console.log('[Init] No existing projects found. Auto-seeding initial demonstration workspace...');
        await seedDatabase();
      }
      app.listen(PORT, () => {
        console.log(`[NexGen API] Engineering OS API operational on port ${PORT}`);
      });
    })
    .catch((err) => {
      console.error('[NexGen API] Startup failed:', err);
      process.exit(1);
    });
}
