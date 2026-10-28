import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import cookieParser from 'cookie-parser';
import express, { type ErrorRequestHandler } from 'express';
import { rateLimit } from 'express-rate-limit';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import { sql } from 'kysely';
import { loadSession, requireAuth, verifyOrigin } from './auth/session.js';
import { config } from './config.js';
import { db } from './db/index.js';
import { HttpError } from './lib/http.js';
import { logger } from './lib/logger.js';
import { authRouter } from './routes/auth.js';
import { adminRouter } from './routes/admin.js';
import { analyticsRouter } from './routes/analytics.js';
import { accessRequestsRouter } from './routes/access-requests.js';
import { materialsRouter, suppliersRouter } from './routes/catalog.js';
import { dashboardRouter } from './routes/dashboard.js';
import { productsRouter } from './routes/products.js';
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

  api.use('/auth', authRouter);
  api.use('/access-requests', accessRequestsRouter);
  api.use('/analytics', analyticsRouter);
  api.use('/admin', requireAuth, adminRouter);
  api.use('/workspace', requireAuth, workspaceRouter);
  api.use('/game', requireAuth, gameRouter);
  api.use('/dashboard', requireAuth, dashboardRouter);
  api.use('/products', requireAuth, productsRouter);
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
    app.get(/^(?!\/api\/).*/, (_req, res) => {
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(path.join(webDist, 'index.html'));
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
