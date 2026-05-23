import { NextFunction, Request, Response } from 'express';
import { logger } from '../lib/logger';

export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction
) {
  logger.error(err);
  res.status(500).json({ message: 'An unexpected error occurred' });
}