import type { NextFunction, Request, Response } from "express";

/** Express 4 does not catch rejected promises in async routes. */
export function asyncHandler<Req extends Request>(
  fn: (req: Req, res: Response, next: NextFunction) => unknown,
) {
  return (req: Req, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

export function isDuplicateKeyError(error: unknown) {
  return Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      Number((error as { code: unknown }).code) === 11000,
  );
}
