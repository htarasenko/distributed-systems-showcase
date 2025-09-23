import { PoolClient } from 'pg';
import { v4 as uuidv4 } from 'uuid';
import { pgPool } from './database';
import { publishBetEvent } from './kafka';
import { insertBetEvent } from './clickhouse';
import { betProcessingDuration, databaseOperations } from './metrics';
import { BetRequest, BetResponse, BetEventMessage } from '../types';
import logger from '../utils/logger';

export class BetService {
  // Process a bet request
  static async processBet(betRequest: BetRequest): Promise<BetResponse> {
    const startTime = Date.now();
    let client: PoolClient | null = null;

    try {
      const { userId, gameId, amount, betType, betValue, odds } = betRequest;
      const betId = uuidv4();
      const transactionId = `tx-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      logger.info('Processing bet', { betId, userId, amount, gameId, betType, betValue, odds });

      // Get database connection
      client = await pgPool.connect();

      // Step 1: PostgreSQL Transaction (ACID)
      await client.query('BEGIN');

      try {
        // Check user balance with row lock
        const balanceResult = await client.query(
          'SELECT balance, version FROM users WHERE id = $1 FOR UPDATE',
          [userId]
        );

        if (balanceResult.rows.length === 0) {
          await client.query('ROLLBACK');
          return {
            betId,
            status: 'rejected',
            error: 'User not found'
          };
        }

        const { balance, version } = balanceResult.rows[0] as { balance: number; version: number };

        if (balance < amount) {
          await client.query('ROLLBACK');
          return {
            betId,
            status: 'rejected',
            error: 'Insufficient balance',
            details: { currentBalance: balance }
          };
        }

        const newBalance = balance - amount;

        // Update balance with optimistic locking
        const updateResult = await client.query(
          'UPDATE users SET balance = $1, version = version + 1, updated_at = NOW() WHERE id = $2 AND version = $3',
          [newBalance, userId, version]
        );

        if (updateResult.rowCount === 0) {
          await client.query('ROLLBACK');
          return {
            betId,
            status: 'rejected',
            error: 'Concurrent modification detected. Please retry.'
          };
        }

        // Calculate potential win
        const potentialWin = amount * odds;

        // Insert bet record
        await client.query(
          'INSERT INTO bets (id, user_id, game_id, amount, bet_type, bet_value, odds, potential_win, status) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)',
          [betId, userId, gameId, amount, betType, betValue, odds, potentialWin, 'pending']
        );

        // Insert transaction record
        await client.query(
          'INSERT INTO wallet_transactions (user_id, transaction_id, transaction_type, amount, balance_before, balance_after, bet_id) VALUES ($1, $2, $3, $4, $5, $6, $7)',
          [userId, transactionId, 'bet', amount, balance, newBalance, betId]
        );

        // Commit transaction
        await client.query('COMMIT');

        const dbDuration = Date.now() - startTime;

        // Step 2: Response to user (immediate)
        const response: BetResponse = {
          betId,
          status: 'accepted',
          transactionId,
          newBalance,
          potentialWin,
          processingTime: {
            database: dbDuration,
            total: Date.now() - startTime
          }
        };

        // Step 3: Publish event to Kafka (asynchronous, after response)
        publishBetEvent(betId, userId, amount, gameId, betType, betValue, odds, potentialWin, transactionId, newBalance);

        // Record metrics
        betProcessingDuration.labels('accepted').observe((Date.now() - startTime) / 1000);
        databaseOperations.labels('bet_insert', 'bets', 'success').inc();

        logger.info('Bet processed successfully', {
          betId,
          transactionId,
          newBalance,
          dbDuration
        });

        return response;

      } catch (dbError) {
        await client.query('ROLLBACK');
        betProcessingDuration.labels('rejected').observe((Date.now() - startTime) / 1000);
        databaseOperations.labels('bet_insert', 'bets', 'error').inc();
        throw dbError;
      }

    } catch (error) {
      betProcessingDuration.labels('error').observe((Date.now() - startTime) / 1000);
      throw error;
    } finally {
      if (client) {
        client.release();
      }
    }
  }

  // Get bet history for a user
  static async getBetHistory(userId: string, limit: number = 50, offset: number = 0) {
    try {
      const result = await pgPool.query(
        'SELECT b.*, g.name as game_name, g.game_type, g.status as game_status FROM bets b JOIN games g ON b.game_id = g.id WHERE b.user_id = $1 ORDER BY b.created_at DESC LIMIT $2 OFFSET $3',
        [userId, limit, offset]
      );

      return {
        userId,
        bets: result.rows,
        pagination: {
          limit,
          offset,
          total: result.rows.length
        }
      };
    } catch (error) {
      logger.error('Failed to fetch bet history:', error);
      throw error;
    }
  }

  // Process Kafka bet event and write to ClickHouse
  static async processBetEvent(
    betEvent: BetEventMessage,
    topic: string,
    partition: number,
    offset: string
  ): Promise<void> {
    try {
      logger.info('Processing bet event from Kafka', {
        betId: betEvent.betId,
        topic,
        partition,
        offset
      });

      await insertBetEvent(betEvent);

    } catch (error) {
      logger.error('Failed to process bet event:', error, {
        betId: betEvent.betId,
        topic,
        partition,
        offset
      });
      throw error;
    }
  }
}
