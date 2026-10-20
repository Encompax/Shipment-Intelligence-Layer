import { NextFunction, Request, Response } from 'express';
import { logger } from '../lib/logger';

export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction
) {
  logger.error(err);
  const reportedStatus = typeof err === "object" && err && "status" in err
    ? Number((err as { status?: unknown }).status)
    : 500;
  const status = reportedStatus === 403 ? 403 : 500;
  res.status(status).json({ message: status === 403 ? "Origin is not allowed" : "An unexpected error occurred" });
}
