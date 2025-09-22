// Database types
export interface User {
  id: string;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  balance: number;
  currency: string;
  status: 'active' | 'suspended' | 'banned';
  version: number;
  created_at: Date;
  updated_at: Date;
}

export interface Game {
  id: string;
  name: string;
  description?: string;
  game_type: 'football' | 'basketball' | 'tennis' | 'esports' | 'horse_racing' | 'other';
  start_date: Date;
  end_date: Date;
  result?: string;
  status: 'scheduled' | 'live' | 'finished' | 'cancelled' | 'postponed';
  created_at: Date;
  updated_at: Date;
}

export interface Bet {
  id: string;
  user_id: string;
  game_id: string;
  amount: number;
  bet_type: 'win' | 'lose' | 'draw' | 'over' | 'under' | 'exact_score' | 'total_goals' | 'first_goal' | 'last_goal';
  bet_value?: string;
  odds: number;
  potential_win: number;
  status: 'pending' | 'won' | 'lost' | 'cancelled' | 'refunded';
  result?: string;
  settled_at?: Date;
  created_at: Date;
  updated_at: Date;
}

export interface WalletTransaction {
  id: string;
  user_id: string;
  transaction_id: string;
  transaction_type: 'bet' | 'deposit' | 'withdrawal' | 'refund' | 'win_payout';
  amount: number;
  balance_before: number;
  balance_after: number;
  bet_id?: string;
  description?: string;
  created_at: Date;
}

// API Request/Response types
export interface BetRequest {
  userId: string;
  gameId: string;
  amount: number;
  betType: 'win' | 'lose' | 'draw' | 'over' | 'under' | 'exact_score' | 'total_goals' | 'first_goal' | 'last_goal';
  betValue?: string;
  odds: number;
}

export interface BetResponse {
  betId: string;
  status: 'accepted' | 'rejected';
  transactionId?: string;
  newBalance?: number;
  potentialWin?: number;
  processingTime?: {
    database: number;
    total: number;
  };
  error?: string;
  details?: any;
}

export interface UserRequest {
  username: string;
  email: string;
  firstName: string;
  lastName: string;
  initialBalance?: number;
}

export interface UserResponse {
  userId: string;
  username: string;
  email: string;
  balance: number;
  status: string;
  createdAt: Date;
}

export interface GameRequest {
  name: string;
  description?: string;
  gameType: 'football' | 'basketball' | 'tennis' | 'esports' | 'horse_racing' | 'other';
  startDate: Date;
  endDate: Date;
}

export interface GameResponse {
  gameId: string;
  name: string;
  gameType: string;
  startDate: Date;
  endDate: Date;
  status: string;
  createdAt: Date;
}

export interface HealthCheckResponse {
  status: 'healthy' | 'unhealthy';
  timestamp: string;
  services: {
    postgresql: 'connected' | 'disconnected';
    clickhouse: 'connected' | 'disconnected';
    kafka: 'connected' | 'disconnected';
  };
  error?: string;
}

export interface AnalyticsResponse {
  analytics: Array<{
    period: string;
    bet_count: number;
    total_amount: number;
    avg_amount: number;
  }>;
  groupBy: 'hour' | 'day';
  period: string | { startDate: string; endDate: string };
}

// Kafka message types
export interface BetEventMessage {
  betId: string;
  userId: string;
  amount: number;
  gameId: string;
  betType: 'win' | 'lose' | 'draw' | 'over' | 'under' | 'exact_score' | 'total_goals' | 'first_goal' | 'last_goal';
  betValue?: string;
  odds: number;
  potentialWin: number;
  transactionId: string;
  newBalance: number;
  timestamp: string;
}


// Configuration types
export interface DatabaseConfig {
  connectionString: string;
  max?: number;
  min?: number;
  idleTimeoutMillis?: number;
  connectionTimeoutMillis?: number;
}

export interface KafkaConfig {
  clientId: string;
  brokers: string[];
  retry: {
    initialRetryTime: number;
    retries: number;
  };
}

export interface ClickHouseConfig {
  url: string;
  database: string;
}

export interface AppConfig {
  port: number;
  nodeEnv: string;
  database: DatabaseConfig;
  kafka: KafkaConfig;
  clickhouse: ClickHouseConfig;
}

// Error classes
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly isOperational: boolean;

  constructor(message: string, statusCode: number = 500, isOperational: boolean = true) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;

    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends AppError {
  constructor(message: string, _details?: any) {
    super(message, 400);
    this.name = 'ValidationError';
  }
}

export class DatabaseError extends AppError {
  constructor(message: string, originalError?: Error) {
    super(message, 500);
    this.name = 'DatabaseError';
    if (originalError && originalError.stack) {
      this.stack = originalError.stack;
    }
  }
}

export class KafkaError extends AppError {
  constructor(message: string, originalError?: Error) {
    super(message, 500);
    this.name = 'KafkaError';
    if (originalError && originalError.stack) {
      this.stack = originalError.stack;
    }
  }
}


// Metrics types
export interface ProcessingTime {
  database: number;
  total: number;
}

export interface MetricsLabels {
  method: string;
  route: string;
  statusCode: number;
}

// Query parameters
export interface AnalyticsQuery {
  startDate?: string;
  endDate?: string;
  groupBy?: 'hour' | 'day';
}

export interface BetHistoryQuery {
  userId: string;
  limit?: number;
  offset?: number;
}
