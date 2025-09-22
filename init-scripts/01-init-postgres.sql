-- Initialize PostgreSQL database for distributed systems showcase

-- Create tables
CREATE TABLE IF NOT EXISTS bets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    amount DECIMAL(10,2) NOT NULL,
    game_id VARCHAR(255) NOT NULL,
    bet_type VARCHAR(50) NOT NULL,
    status VARCHAR(50) DEFAULT 'pending',
    wallet_transaction_id VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_bets_user_id ON bets(user_id);
CREATE INDEX IF NOT EXISTS idx_bets_created_at ON bets(created_at);
CREATE INDEX IF NOT EXISTS idx_bets_game_id ON bets(game_id);
CREATE INDEX IF NOT EXISTS idx_bets_status ON bets(status);

-- Create a function to update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger to automatically update updated_at
CREATE TRIGGER update_bets_updated_at 
    BEFORE UPDATE ON bets 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Insert sample data
INSERT INTO bets (user_id, amount, game_id, bet_type, status) VALUES
    ('550e8400-e29b-41d4-a716-446655440001', 25.50, 'game-1', 'single', 'completed'),
    ('550e8400-e29b-41d4-a716-446655440002', 100.00, 'game-2', 'multiple', 'completed'),
    ('550e8400-e29b-41d4-a716-446655440003', 50.25, 'game-3', 'system', 'pending'),
    ('550e8400-e29b-41d4-a716-446655440001', 75.00, 'game-1', 'single', 'completed'),
    ('550e8400-e29b-41d4-a716-446655440004', 200.00, 'game-4', 'multiple', 'completed')
ON CONFLICT (id) DO NOTHING;
