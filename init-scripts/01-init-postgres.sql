-- Initialize PostgreSQL database for distributed systems showcase

-- Create users table
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username VARCHAR(50) NOT NULL UNIQUE,
    email VARCHAR(255) NOT NULL UNIQUE,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    balance DECIMAL(10,2) NOT NULL DEFAULT 0.00 CHECK (balance >= 0),
    currency VARCHAR(3) DEFAULT 'EUR',
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'banned')),
    version INTEGER NOT NULL DEFAULT 0, -- For optimistic locking
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create games table
CREATE TABLE IF NOT EXISTS games (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    game_type VARCHAR(50) NOT NULL CHECK (game_type IN ('football', 'basketball', 'tennis', 'esports', 'horse_racing', 'other')),
    start_date TIMESTAMP WITH TIME ZONE NOT NULL,
    end_date TIMESTAMP WITH TIME ZONE NOT NULL,
    result VARCHAR(100), -- Winner, score, or result description
    status VARCHAR(20) DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'live', 'finished', 'cancelled', 'postponed')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT valid_dates CHECK (end_date > start_date)
);

-- Create bets table
CREATE TABLE IF NOT EXISTS bets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
    amount DECIMAL(10,2) NOT NULL CHECK (amount > 0),
    bet_type VARCHAR(50) NOT NULL CHECK (bet_type IN ('win', 'lose', 'draw', 'over', 'under', 'exact_score', 'total_goals', 'first_goal', 'last_goal')),
    bet_value VARCHAR(100), -- Specific bet value (e.g., "2-1", "over 2.5", "Messi")
    odds DECIMAL(5,2) NOT NULL CHECK (odds > 1.0), -- Decimal odds (e.g., 2.50)
    potential_win DECIMAL(10,2) NOT NULL, -- amount * odds
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'won', 'lost', 'cancelled', 'refunded')),
    result VARCHAR(100), -- Actual result for this bet
    settled_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create wallet_transactions table for audit trail
CREATE TABLE IF NOT EXISTS wallet_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    transaction_id VARCHAR(255) NOT NULL UNIQUE,
    transaction_type VARCHAR(50) NOT NULL CHECK (transaction_type IN ('bet', 'deposit', 'withdrawal', 'refund', 'win_payout')),
    amount DECIMAL(10,2) NOT NULL,
    balance_before DECIMAL(10,2) NOT NULL,
    balance_after DECIMAL(10,2) NOT NULL,
    bet_id UUID REFERENCES bets(id) ON DELETE SET NULL,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for better performance
-- Users indexes
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);

-- Games indexes
CREATE INDEX IF NOT EXISTS idx_games_start_date ON games(start_date);
CREATE INDEX IF NOT EXISTS idx_games_end_date ON games(end_date);
CREATE INDEX IF NOT EXISTS idx_games_status ON games(status);
CREATE INDEX IF NOT EXISTS idx_games_game_type ON games(game_type);

-- Bets indexes
CREATE INDEX IF NOT EXISTS idx_bets_user_id ON bets(user_id);
CREATE INDEX IF NOT EXISTS idx_bets_game_id ON bets(game_id);
CREATE INDEX IF NOT EXISTS idx_bets_status ON bets(status);
CREATE INDEX IF NOT EXISTS idx_bets_created_at ON bets(created_at);
CREATE INDEX IF NOT EXISTS idx_bets_settled_at ON bets(settled_at);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_bets_user_id_created_at ON bets(user_id, created_at);

-- Wallet transactions indexes
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_user_id ON wallet_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_transaction_id ON wallet_transactions(transaction_id);
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_created_at ON wallet_transactions(created_at);
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_type ON wallet_transactions(transaction_type);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_wallet_transactions_user_id_created_at ON wallet_transactions(user_id, created_at);

-- Create a function to update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers to automatically update updated_at
CREATE TRIGGER update_users_updated_at 
    BEFORE UPDATE ON users 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_games_updated_at 
    BEFORE UPDATE ON games 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_bets_updated_at 
    BEFORE UPDATE ON bets 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Insert sample users
INSERT INTO users (username, email, first_name, last_name, balance, status) VALUES
    ('john_doe', 'john.doe@email.com', 'John', 'Doe', 1000.00, 'active'),
    ('jane_smith', 'jane.smith@email.com', 'Jane', 'Smith', 500.00, 'active'),
    ('mike_wilson', 'mike.wilson@email.com', 'Mike', 'Wilson', 250.00, 'active'),
    ('sarah_brown', 'sarah.brown@email.com', 'Sarah', 'Brown', 750.00, 'active'),
    ('alex_jones', 'alex.jones@email.com', 'Alex', 'Jones', 1200.00, 'active')
ON CONFLICT (username) DO NOTHING;

-- Insert sample games
INSERT INTO games (name, description, game_type, start_date, end_date, status) VALUES
    ('Real Madrid vs Barcelona', 'El Clasico - Spanish La Liga', 'football', 
     '2024-01-15 20:00:00+00', '2024-01-15 22:00:00+00', 'finished'),
    ('Lakers vs Warriors', 'NBA Regular Season', 'basketball', 
     '2024-01-16 19:30:00+00', '2024-01-16 22:00:00+00', 'finished'),
    ('Djokovic vs Nadal', 'Australian Open Final', 'tennis', 
     '2024-01-17 15:00:00+00', '2024-01-17 18:00:00+00', 'finished'),
    ('CS:GO Major Championship', 'Counter-Strike Global Offensive Major', 'esports', 
     '2024-01-18 16:00:00+00', '2024-01-18 20:00:00+00', 'scheduled'),
    ('Kentucky Derby', 'Horse Racing Classic', 'horse_racing', 
     '2024-01-19 18:00:00+00', '2024-01-19 19:00:00+00', 'scheduled')
ON CONFLICT (id) DO NOTHING;

-- Insert sample bets
INSERT INTO bets (user_id, game_id, amount, bet_type, bet_value, odds, potential_win, status) VALUES
    ((SELECT id FROM users WHERE username = 'john_doe'), 
     (SELECT id FROM games WHERE name = 'Real Madrid vs Barcelona'), 
     50.00, 'win', 'Real Madrid', 2.10, 105.00, 'won'),
    ((SELECT id FROM users WHERE username = 'jane_smith'), 
     (SELECT id FROM games WHERE name = 'Lakers vs Warriors'), 
     25.00, 'over', '220.5', 1.85, 46.25, 'lost'),
    ((SELECT id FROM users WHERE username = 'mike_wilson'), 
     (SELECT id FROM games WHERE name = 'Djokovic vs Nadal'), 
     100.00, 'win', 'Djokovic', 1.75, 175.00, 'won'),
    ((SELECT id FROM users WHERE username = 'sarah_brown'), 
     (SELECT id FROM games WHERE name = 'CS:GO Major Championship'), 
     75.00, 'win', 'Team A', 3.20, 240.00, 'pending'),
    ((SELECT id FROM users WHERE username = 'alex_jones'), 
     (SELECT id FROM games WHERE name = 'Kentucky Derby'), 
     200.00, 'win', 'Thunder Horse', 4.50, 900.00, 'pending')
ON CONFLICT (id) DO NOTHING;
