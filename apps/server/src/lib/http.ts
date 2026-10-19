import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { z, type ZodType } from 'zod';

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
    public details?: unknown
  ) {
    super(message);
  }
}

export const badRequest = (msg: string, details?: unknown) => new HttpError(400, msg, 'bad_request', details);
export const unauthorized = (msg = 'Please sign in') => new HttpError(401, msg, 'unauthorized');
export const forbidden = (msg = 'You do not have permission to do that') => new HttpError(403, msg, 'forbidden');
export const notFound = (what = 'Resource') => new HttpError(404, `${what} not found`, 'not_found');
export const conflict = (msg: string) => new HttpError(409, msg, 'conflict');

/** Wraps an async route so rejected promises reach the error handler. */
export function route(fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
}

export function parse<T extends ZodType>(schema: T, input: unknown): z.infer<T> {
  const result = schema.safeParse(input);
  if (!result.success) {
    const first = result.error.issues[0];
    const field = first?.path.join('.');
    throw badRequest(field ? `${field}: ${first.message}` : (first?.message ?? 'Invalid input'), z.flattenError(result.error));
  }
  return result.data;
}

export const uuid = z.uuid();
export const money = z.coerce.number().min(0).max(1e10).transform((n) => Math.round(n * 100) / 100);
export const shortText = (max = 200) => z.string().trim().max(max);
export const url = z
  .string()
  .trim()
  .max(2000)
  .refine((v) => v === '' || /^https?:\/\//i.test(v), 'Must start with http:// or https://');
