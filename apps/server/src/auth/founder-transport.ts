import type { RequestHandler } from 'express';

/** To be mounted ahead of every founder lifecycle endpoint. */
export function founderTransportGuard(expectedOrigin: string): RequestHandler {
  const canonical = new URL(expectedOrigin).origin;
  return (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    res.set('X-Robots-Tag', 'noindex, nofollow');
    res.set('Referrer-Policy', 'no-referrer');
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      // Unlike the ordinary application middleware, absence of an Origin is not
      // sufficient for this sensitive cookie-authenticated namespace.
      if (req.get('origin') !== canonical || !req.is('application/json')) {
        res.status(403).json({ error: 'Request rejected' });
        return;
      }
    }
    next();
  };
}
