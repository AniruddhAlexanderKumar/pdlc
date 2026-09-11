import type { z } from "zod";
import { ValidationError } from "@/server/errors";

/**
 * Parses input against a domain schema, converting a Zod failure into the
 * application's own `ValidationError` (400) with field-level details.
 *
 * Repositories call this on the way in so that callers only ever have to
 * handle our error hierarchy, never Zod's.
 */
export function parseOrThrow<Schema extends z.ZodTypeAny>(
  schema: Schema,
  input: unknown,
  message: string,
): z.output<Schema> {
  const result = schema.safeParse(input);

  if (!result.success) {
    throw new ValidationError(
      message,
      result.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
    );
  }

  return result.data;
}
