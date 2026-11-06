import { randomUUID } from 'node:crypto';
import type { ErrorRequestHandler, RequestHandler } from 'express';

/** Server-generated IDs only; never accept arbitrary client-supplied identifiers. */
export const founderRequestContext: RequestHandler = (_req, res, next) => {
  const requestId = randomUUID();
  res.locals.founderRequestId = requestId;
  res.setHeader('X-Request-Id', requestId);
  next();
};

export function databaseErrorCode(err: unknown): string | undefined {
  const code = typeof err === 'object' && err !== null && 'code' in err ? (err as { code?: unknown }).code : undefined;
  return typeof code === 'string' && /^[0-9A-Z]{5}$/.test(code) ? code : undefined;
}

interface SafeLogger {
  error(fields: { requestId: string; category: string; sqlState?: string }, message: string): void;
}

/** Never log a driver error, SQL text, query parameters, headers or body. */
interface SafeRequestLogger {
  info(fields: { requestId: string; method: string; route: string; statusCode: number; durationMs: number }, message: string): void;
}

const safeFounderRoutes = new Set(['/login', '/mfa/setup', '/mfa/verify', '/password/rotate', '/logout', '/me']);
/** Only fixed route names and server-generated identifiers, never raw URL,
 * headers, cookies or body. Unknown paths are deliberately not echoed. */
export function founderRequestLogger(logger: SafeRequestLogger): RequestHandler {
  return (req, res, next) => {
    const start = process.hrtime.bigint();
    const method = ['GET', 'POST', 'HEAD', 'OPTIONS'].includes(req.method) ? req.method : 'OTHER';
    const route = safeFounderRoutes.has(req.path) ? req.path : 'unknown';
    const requestId = res.locals.founderRequestId as string;
    res.once('finish', () => logger.info({ requestId, method, route, statusCode: res.statusCode, durationMs: Math.round(Number(process.hrtime.bigint() - start) / 1e6) }, 'Founder request completed'));
    next();
  };
}

export function founderErrorHandler(logger: SafeLogger): ErrorRequestHandler {
  return (err: unknown, _req, res, _next) => {
    const requestId = typeof res.locals.founderRequestId === 'string' ? res.locals.founderRequestId : randomUUID();
    const sqlState = databaseErrorCode(err);
    logger.error({ requestId, category: sqlState ? 'database_error' : 'internal_error', ...(sqlState ? { sqlState } : {}) }, 'Founder authentication failed');
    res.setHeader('X-Request-Id', requestId);
    res.status(503).json({ error: 'Founder authentication unavailable', requestId });
  };
}
