import { clickhouse } from './database';
import logger from '../utils/logger';
import { BetEventMessage } from '../types';

// Initialize ClickHouse table for bet events
export async function initializeClickHouseTable(): Promise<void> {
  try {
    // The table should already be created by the init script
    // Just verify it exists and log the status
    await clickhouse.query('SELECT 1 FROM bet_events LIMIT 1').toPromise();
    logger.info('ClickHouse bet_events table verified');
  } catch (error) {
    logger.error('ClickHouse bet_events table not found or not accessible:', error);
    throw error;
  }
}

// Insert bet event into ClickHouse
export async function insertBetEvent(betEvent: BetEventMessage): Promise<void> {
  try {
    const insertData = {
      bet_id: betEvent.betId,
      user_id: betEvent.userId,
      amount: Number(betEvent.amount),
      game_id: betEvent.gameId,
      bet_type: betEvent.betType,
      status: 'completed',
      wallet_transaction_id: betEvent.transactionId,
      timestamp: betEvent.timestamp
    };

    // Convert ISO 8601 timestamp to ClickHouse format (YYYY-MM-DD HH:MM:SS)
    const clickhouseTimestamp = new Date(insertData.timestamp).toISOString().replace('T', ' ').replace('Z', '').substring(0, 19);

    // Use raw query instead of insert method to get better error handling
    const insertQuery = `
      INSERT INTO distributed_systems.bet_events 
      (bet_id, user_id, amount, game_id, bet_type, status, wallet_transaction_id, timestamp)
      VALUES ('${insertData.bet_id}', '${insertData.user_id}', ${insertData.amount}, '${insertData.game_id}', '${insertData.bet_type}', '${insertData.status}', '${insertData.wallet_transaction_id}', '${clickhouseTimestamp}')
    `;

    await clickhouse.query(insertQuery).toPromise();


    logger.info('Bet event written to ClickHouse', { betId: betEvent.betId });
  } catch (error) {
    logger.error('Failed to insert bet event into ClickHouse:', error, {
      betId: betEvent.betId,
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
      errorStack: error instanceof Error ? error.stack : undefined
    });
    throw error;
  }
}

// Get analytics data from ClickHouse
export async function getBetAnalytics(
  startDate?: string,
  endDate?: string,
  groupBy: 'hour' | 'day' = 'day'
): Promise<Array<{
  period: string;
  bet_count: number;
  total_amount: number;
  avg_amount: number;
}>> {
  try {
    let query = `
      SELECT 
        toStartOf${groupBy === 'hour' ? 'Hour' : 'Day'}(timestamp) as period,
        count() as bet_count,
        sum(amount) as total_amount,
        avg(amount) as avg_amount
      FROM bet_events 
      WHERE 1=1
    `;

    const params: string[] = [];
    if (startDate) {
      query += ' AND timestamp >= ?';
      params.push(startDate);
    }
    if (endDate) {
      query += ' AND timestamp <= ?';
      params.push(endDate);
    }

    query += ' GROUP BY period ORDER BY period';

    const result = await clickhouse.query(query, { params }).toPromise();
    return (result as any).data as Array<{
      period: string;
      bet_count: number;
      total_amount: number;
      avg_amount: number;
    }>;
  } catch (error) {
    logger.error('Failed to fetch analytics from ClickHouse:', error);
    throw error;
  }
}

// Health check for ClickHouse
export async function checkClickHouseHealth(): Promise<boolean> {
  try {
    await clickhouse.query('SELECT 1 as test').toPromise();
    return true;
  } catch (error) {
    logger.error('ClickHouse health check failed:', error);
    return false;
  }
}
