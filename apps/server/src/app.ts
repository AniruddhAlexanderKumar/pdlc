import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import cookieParser from 'cookie-parser';
import express, { type ErrorRequestHandler } from 'express';
import { rateLimit } from 'express-rate-limit';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import { sql } from 'kysely';
import { loadSession, requireAuth, requireAdmin, verifyOrigin } from './auth/session.js';
import { config } from './config.js';
import { db } from './db/index.js';
import { HttpError } from './lib/http.js';
import { logger } from './lib/logger.js';
import { authRouter } from './routes/auth.js';
import { adminRouter } from './routes/admin.js';
import { aiRouter } from './routes/ai.js';
import { analyticsRouter } from './routes/analytics.js';
import { accessRequestsRouter } from './routes/access-requests.js';
import { materialsRouter, suppliersRouter } from './routes/catalog.js';
import { dashboardRouter } from './routes/dashboard.js';
import { productsRouter } from './routes/products.js';
import { projectsRouter } from './routes/projects.js';
import { teamworkGraphRouter } from './routes/teamwork-graph.js';
import { graphIntelligenceRouter } from './routes/graph-intelligence.js';
import { voiceRouter } from './routes/voice.js';
import { designsRouter } from './routes/designs.js';
import { cadDocumentsRouter } from './routes/cad-documents.js';
import { reviewerRouter, reviewManagementRouter } from './routes/external-reviews.js';
import { helpRouter, helpAdminRouter } from './routes/help.js';
import { assistantRouter, assistantAdminRouter } from './routes/assistant.js';
import { gameRouter, workspaceRouter } from './routes/workspace.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', config.TRUST_PROXY);

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          imgSrc: ["'self'", 'data:', 'https:'],
          styleSrc: ["'self'", "'unsafe-inline'"],
          fontSrc: ["'self'"],
          connectSrc: ["'self'"],
          frameAncestors: ["'none'"],
          upgradeInsecureRequests: config.secureCookies ? [] : null
        }
      },
      crossOriginEmbedderPolicy: false,
      strictTransportSecurity: config.secureCookies
    })
  );

  // The founder console is not implemented yet. Reserve its entire API namespace
  // before ordinary session loading and request logging: no existing workspace or
  // system-admin credential can accidentally authorize it. Replace this guard only
  // when the dedicated authentication and authorization boundary is ready.
  app.use('/api/founders', (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    res.status(404).json({ error: 'Not found' });
  });

  // Liveness/readiness probe for Docker, load balancers and uptime monitors.
  app.get('/api/health', async (_req, res) => {
    try {
      await sql`select 1`.execute(db);
      res.json({ status: 'ok' });
    } catch {
      res.status(503).json({ status: 'db_unavailable' });
    }
  });

  const api = express.Router();
  api.use(
    pinoHttp({
      logger,
      // Log writes only (reads are noisy), with just the fields worth keeping.
      autoLogging: { ignore: (req) => req.method === 'GET' },
      serializers: {
        req: (req) => ({ id: req.id, method: req.method, url: req.url, ip: req.remoteAddress }),
        res: (res) => ({ statusCode: res.statusCode })
      },
      customProps: (req) => ({ userId: req.auth?.userId })
    })
  );
  api.use(express.json({ limit: '200kb' }));
  api.use(cookieParser());
  api.use(verifyOrigin);
  api.use(
    rateLimit({
      windowMs: 60_000,
      limit: config.NODE_ENV === 'test' ? 10_000 : 600,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      message: { error: 'Too many requests. Slow down a little.' }
    })
  );
  api.use(loadSession);
  // Guest sessions are intentionally restricted to their sample workspace. In particular,
  // they cannot join/create workspaces, invite people, manage accounts, or invoke AI services.
  api.use((req, res, next) => {
    if (!req.auth?.isDemo) return next();
    const path = req.path;
    const safeAuth = (req.method === 'GET' && path === '/auth/me') || (req.method === 'POST' && (path === '/auth/logout' || path === '/auth/demo'));
    const safeWorkspace = (req.method === 'GET' && ['/workspace/data', '/workspace/members'].includes(path)) || (req.method === 'POST' && path === '/workspace/sample-data');
    const safeFeature = /^\/(products|materials|suppliers|projects|dashboard|game)(\/|$)/.test(path) || (/^\/teamwork-graph(\/|$)/.test(path) && !/^\/teamwork-graph\/ask\/?$/i.test(path));
    const safeHelp = req.method === 'GET' && /^\/help\/articles(?:\/|$)/.test(path);
    const safeReviewer = /^\/reviewer(?:\/|$)/.test(path) && ['GET', 'POST'].includes(req.method);
    const safeAnalytics = path === '/analytics/track' && req.method === 'POST';
    if (safeAuth || safeWorkspace || safeFeature || safeReviewer || safeHelp || safeAnalytics) return next();
    res.status(403).json({ error: 'This feature is not available in the temporary demo.', code: 'demo_restricted' });
  });

  api.use('/auth', authRouter);
  api.use('/ai', requireAuth, requireAdmin, aiRouter);
  api.use('/access-requests', accessRequestsRouter);
  api.use('/reviewer', reviewerRouter);
  api.use('/external-reviews', requireAuth, reviewManagementRouter);
  api.use('/assistant', requireAuth, assistantRouter);
  api.use('/assistant-admin', requireAuth, assistantAdminRouter);
  api.use('/help', requireAuth, helpRouter);
  api.use('/help-admin', requireAuth, helpAdminRouter);
  api.use('/analytics', analyticsRouter);
  api.use('/admin', requireAuth, adminRouter);
  api.use('/workspace', requireAuth, workspaceRouter);
  api.use('/game', requireAuth, gameRouter);
  api.use('/dashboard', requireAuth, dashboardRouter);
  api.use('/products', requireAuth, productsRouter);
  api.use('/projects', requireAuth, projectsRouter);
  api.use('/teamwork-graph', requireAuth, graphIntelligenceRouter, teamworkGraphRouter);
  api.use('/voice', requireAuth, voiceRouter);
  api.use('/designs', requireAuth, designsRouter);
  if(config.CAD_NATIVE_EXPERIMENTAL) api.use('/cad-documents', requireAuth, rateLimit({windowMs:60_000, limit:config.NODE_ENV==='test'?10000:60, standardHeaders:'draft-8', legacyHeaders:false}), cadDocumentsRouter);
  api.use('/materials', requireAuth, materialsRouter);
  api.use('/suppliers', requireAuth, suppliersRouter);
  api.use((_req, res) => res.status(404).json({ error: 'Not found' }));

  app.use('/api', api);

  // Serve the built web app (apps/web/dist) in production.
  const here = path.dirname(fileURLToPath(import.meta.url));
  const webDist = [path.resolve(here, '../public'), path.resolve(here, '../../web/dist')].find((p) => existsSync(path.join(p, 'index.html')));
  if (webDist) {
    app.use(
      express.static(webDist, {
        index: false,
        setHeaders: (res, file) => {
          res.setHeader('Cache-Control', file.includes(`${path.sep}assets${path.sep}`) ? 'public, max-age=31536000, immutable' : 'no-cache');
        }
      })
    );
    app.get(/^(?!\/api\/).*/, (req, res) => {
      res.setHeader('Cache-Control', 'no-cache');
      const pagePath = req.path.replace(/\/+$/, '') || '/';
      if (pagePath !== '/' && pagePath !== '/request-access') res.setHeader('X-Robots-Tag', 'noindex, nofollow');
      if (pagePath === '/review' || /^\/reset(?:\/|$)/.test(pagePath) || /^\/founders(?:\/|$)/i.test(pagePath)) { res.setHeader('Referrer-Policy', 'no-referrer'); res.setHeader('Cache-Control', 'no-store'); }
      const accessPage = path.join(webDist, 'request-access.html');
      res.sendFile(pagePath === '/request-access' && existsSync(accessPage) ? accessPage : path.join(webDist, 'index.html'));
    });
  }

  const onError: ErrorRequestHandler = (err, req, res, _next) => {
    if (err instanceof HttpError) {
      res.status(err.status).json({ error: err.message, code: err.code, details: err.details });
      return;
    }
    if (err?.type === 'entity.parse.failed') {
      res.status(400).json({ error: 'Malformed JSON body' });
      return;
    }
    if (err?.type === 'entity.too.large') {
      res.status(413).json({ error: 'Request body is too large' });
      return;
    }
    if (err?.code === '40P01' || err?.code === '40001') {
      res.status(409).json({ error: 'A concurrent update conflicted. Reload and retry.', code: 'retryable_conflict' });
      return;
    }
    // Postgres unique violation, e.g. two sign-ups racing for the same email.
    if (err?.code === '23505') {
      res.status(409).json({ error: 'That already exists' });
      return;
    }
    (req.log ?? logger).error({ err }, 'unhandled error');
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  };
  app.use(onError);

  return app;
}
