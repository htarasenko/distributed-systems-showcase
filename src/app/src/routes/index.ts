import { Router, Request, Response } from 'express';
import { BetService } from '../services/bet';
import { checkDatabaseHealth } from '../services/database';
import { getBetAnalytics } from '../services/clickhouse';
import { betSchema, analyticsQuerySchema, betHistoryQuerySchema } from '../utils/validation';
import { BetRequest, HealthCheckResponse, AnalyticsResponse, ValidationError } from '../types';
import logger from '../utils/logger';

const router = Router();

// Health check endpoint
router.get('/health', async (_req: Request, res: Response) => {
  try {
    const services = await checkDatabaseHealth();

    const response: HealthCheckResponse = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      services: {
        ...services,
        kafka: 'connected'
      }
    };

    res.json(response);
  } catch (error) {
    logger.error('Health check failed:', error);
    const response: HealthCheckResponse = {
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      services: {
        postgresql: 'disconnected',
        clickhouse: 'disconnected',
        kafka: 'disconnected'
      },
      error: error instanceof Error ? error.message : 'Unknown error'
    };
    res.status(503).json(response);
  }
});

// Betting endpoint
router.post('/bet', async (req: Request, res: Response) => {
  try {
    // Validate input
    const { error, value } = betSchema.validate(req.body);
    if (error) {
      throw new ValidationError('Validation failed');
    }

    const betRequest = value as BetRequest;
    const response = await BetService.processBet(betRequest);

    if (response.status === 'rejected') {
      res.status(400).json(response);
      return;
    }

    res.json(response);
  } catch (error) {
    logger.error('Bet processing failed:', error);

    let statusCode = 500;
    let errorMessage = 'Internal server error';

    if (error instanceof ValidationError) {
      statusCode = error.statusCode || 400;
      errorMessage = error.message;
    }

    const response = {
      betId: (req.body as any)?.betId || 'unknown',
      status: 'rejected' as const,
      error: errorMessage
    };

    res.status(statusCode).json(response);
  }
});

// Get bet history
router.get('/bets/:userId', async (req: Request, res: Response) => {
  try {
    const { error, value } = betHistoryQuerySchema.validate({
      userId: req.params['userId'],
      ...req.query
    });

    if (error) {
      throw new ValidationError('Invalid query parameters');
    }

    const { userId, limit, offset } = value;
    const result = await BetService.getBetHistory(userId, limit, offset);

    res.json(result);
  } catch (error) {
    logger.error('Failed to fetch bet history:', error);

    let statusCode = 500;
    let errorMessage = 'Failed to fetch bet history';

    if (error instanceof ValidationError) {
      statusCode = error.statusCode || 400;
      errorMessage = error.message;
    }

    res.status(statusCode).json({ error: errorMessage });
  }
});

// Get analytics
router.get('/analytics/bets', async (req: Request, res: Response) => {
  try {
    const { error, value } = analyticsQuerySchema.validate(req.query);

    if (error) {
      throw new ValidationError('Invalid query parameters');
    }

    const { startDate, endDate, groupBy } = value;
    const analytics = await getBetAnalytics(startDate, endDate, groupBy);

    const response: AnalyticsResponse = {
      analytics,
      groupBy,
      period: startDate && endDate ? { startDate, endDate } : 'all'
    };

    res.json(response);
  } catch (error) {
    logger.error('Failed to fetch analytics:', error);

    let statusCode = 500;
    let errorMessage = 'Failed to fetch analytics';

    if (error instanceof ValidationError) {
      statusCode = error.statusCode || 400;
      errorMessage = error.message;
    }

    res.status(statusCode).json({ error: errorMessage });
  }
});

export default router;
