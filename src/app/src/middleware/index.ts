import { Request, Response, NextFunction } from 'express';
import { httpRequestDuration } from '../services/metrics';
import { AppError } from '../types';
import config from '../config';
import logger from '../utils/logger';

// Request timing middleware
export const requestTiming = (req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = (Date.now() - start) / 1000;
    httpRequestDuration
      .labels(req.method, req.route?.path || req.path, res.statusCode.toString())
      .observe(duration);
  });
  next();
};

// Error handling middleware
export const errorHandler = (error: Error, _req: Request, res: Response, _next: NextFunction) => {
  logger.error('Unhandled error:', error);

  let statusCode = 500;
  let message = 'Internal server error';

  if (error instanceof AppError) {
    statusCode = error.statusCode || 500;
    message = error.message;
  }

  res.status(statusCode).json({
    error: message,
    ...(config.nodeEnv === 'development' && { stack: error.stack })
  });
};

// 404 handler
export const notFoundHandler = (_req: Request, res: Response) => {
  res.status(404).json({
    error: 'Not found'
  });
};
