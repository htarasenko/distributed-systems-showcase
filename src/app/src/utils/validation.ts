import Joi from 'joi';
import { BetRequest, UserRequest, GameRequest } from '../types';

export const betSchema = Joi.object<BetRequest>({
  userId: Joi.string().uuid().required(),
  gameId: Joi.string().uuid().required(),
  amount: Joi.number().positive().max(10000).required(),
  betType: Joi.string().valid('win', 'lose', 'draw', 'over', 'under', 'exact_score', 'total_goals', 'first_goal', 'last_goal').required(),
  betValue: Joi.string().max(100).optional(),
  odds: Joi.number().positive().min(1.01).max(100).required()
});

export const userSchema = Joi.object<UserRequest>({
  username: Joi.string().alphanum().min(3).max(50).required(),
  email: Joi.string().email().required(),
  firstName: Joi.string().min(1).max(100).required(),
  lastName: Joi.string().min(1).max(100).required(),
  initialBalance: Joi.number().min(0).max(10000).default(0)
});

export const gameSchema = Joi.object<GameRequest>({
  name: Joi.string().min(1).max(255).required(),
  description: Joi.string().max(1000).optional(),
  gameType: Joi.string().valid('football', 'basketball', 'tennis', 'esports', 'horse_racing', 'other').required(),
  startDate: Joi.date().iso().required(),
  endDate: Joi.date().iso().greater(Joi.ref('startDate')).required()
});

export const analyticsQuerySchema = Joi.object({
  startDate: Joi.string().isoDate().optional(),
  endDate: Joi.string().isoDate().optional(),
  groupBy: Joi.string().valid('hour', 'day').default('hour')
});

export const betHistoryQuerySchema = Joi.object({
  userId: Joi.string().uuid().required(),
  limit: Joi.number().integer().min(1).max(1000).default(100),
  offset: Joi.number().integer().min(0).default(0)
});

export const gameQuerySchema = Joi.object({
  status: Joi.string().valid('scheduled', 'live', 'finished', 'cancelled', 'postponed').optional(),
  gameType: Joi.string().valid('football', 'basketball', 'tennis', 'esports', 'horse_racing', 'other').optional(),
  limit: Joi.number().integer().min(1).max(1000).default(50),
  offset: Joi.number().integer().min(0).default(0)
});
