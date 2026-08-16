import { NextFunction, Request, RequestHandler, Response } from 'express';

// Express 4 does not catch rejected promises from async route handlers —
// an unhandled rejection here crashes the entire process (not just the
// request), taking down every shop until the process is manually
// restarted. Wrap handlers with this so errors reach the error middleware
// as a normal 500 response instead.
export function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
