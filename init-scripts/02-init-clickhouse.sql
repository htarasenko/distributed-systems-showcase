-- Initialize ClickHouse database for distributed systems showcase

-- Create database
CREATE DATABASE IF NOT EXISTS distributed_systems;

-- Use the database
USE distributed_systems;

-- Create table for bet events (optimized for analytics)
CREATE TABLE IF NOT EXISTS bet_events (
    bet_id String,
    user_id String,
    amount Float64,
    game_id String,
    bet_type String,
    status String,
    wallet_transaction_id String,
    timestamp DateTime64(3),
    created_at DateTime64(3) DEFAULT now64()
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(timestamp)
ORDER BY (timestamp, user_id, bet_id)
SETTINGS index_granularity = 8192;

-- Create materialized view for hourly aggregations
CREATE MATERIALIZED VIEW IF NOT EXISTS bet_events_hourly
ENGINE = SummingMergeTree()
PARTITION BY toYYYYMM(timestamp)
ORDER BY (timestamp, game_id, bet_type)
AS SELECT
    toStartOfHour(timestamp) as timestamp,
    game_id,
    bet_type,
    count() as bet_count,
    sum(amount) as total_amount,
    avg(amount) as avg_amount,
    min(amount) as min_amount,
    max(amount) as max_amount
FROM bet_events
GROUP BY timestamp, game_id, bet_type;

-- Create materialized view for daily aggregations
CREATE MATERIALIZED VIEW IF NOT EXISTS bet_events_daily
ENGINE = SummingMergeTree()
PARTITION BY toYYYYMM(timestamp)
ORDER BY (timestamp, game_id, bet_type)
AS SELECT
    toStartOfDay(timestamp) as timestamp,
    game_id,
    bet_type,
    count() as bet_count,
    sum(amount) as total_amount,
    avg(amount) as avg_amount,
    min(amount) as min_amount,
    max(amount) as max_amount
FROM bet_events
GROUP BY timestamp, game_id, bet_type;

-- Insert sample data
INSERT INTO bet_events (bet_id, user_id, amount, game_id, bet_type, status, wallet_transaction_id, timestamp) VALUES
    ('bet-001', '550e8400-e29b-41d4-a716-446655440001', 25.50, 'game-1', 'single', 'completed', 'wallet-tx-001', now() - INTERVAL 1 HOUR),
    ('bet-002', '550e8400-e29b-41d4-a716-446655440002', 100.00, 'game-2', 'multiple', 'completed', 'wallet-tx-002', now() - INTERVAL 2 HOUR),
    ('bet-003', '550e8400-e29b-41d4-a716-446655440003', 50.25, 'game-3', 'system', 'pending', 'wallet-tx-003', now() - INTERVAL 30 MINUTE),
    ('bet-004', '550e8400-e29b-41d4-a716-446655440001', 75.00, 'game-1', 'single', 'completed', 'wallet-tx-004', now() - INTERVAL 45 MINUTE),
    ('bet-005', '550e8400-e29b-41d4-a716-446655440004', 200.00, 'game-4', 'multiple', 'completed', 'wallet-tx-005', now() - INTERVAL 1 DAY);
