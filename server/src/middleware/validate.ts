import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';

// ------------------------------------------------------------------ //
//  validate  - validates req.body against the supplied Zod schema     //
// ------------------------------------------------------------------ //

/**
 * Returns Express middleware that validates `req.body` against the
 * provided Zod schema.
 *
 * On success the parsed (and potentially transformed / defaulted) data
 * replaces `req.body` so downstream handlers receive clean input.
 *
 * On failure a 400 response is returned with structured validation errors.
 */
export function validate(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      // `parse` throws ZodError when validation fails
      const parsed = schema.parse(req.body);

      // Replace req.body with the parsed output so handlers benefit
      // from defaults, coercions, and stripped unknown keys.
      req.body = parsed;

      next();
    } catch (err) {
      if (err instanceof ZodError) {
        const errors = err.errors.map((e) => ({
          field: e.path.join('.'),
          message: e.message,
        }));

        res.status(400).json({
          error: 'Validation failed',
          details: errors,
        });
        return;
      }

      // Unexpected error - let the global error handler deal with it.
      next(err);
    }
  };
}
