-- PostgreSQL initialization script for Versus Game Platform
-- This script runs automatically when the database container starts for the first time

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm"; -- For fuzzy text search

-- Create database if not exists (handled by POSTGRES_DB env var)

-- Set default settings for better performance
ALTER DATABASE versus_db SET timezone TO 'UTC';
ALTER DATABASE versus_db SET default_statistics_target TO 100;

-- Create custom types
DO $$ BEGIN
    CREATE TYPE game_status AS ENUM ('active', 'waiting', 'completed', 'abandoned');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE activity_action AS ENUM ('created', 'completed', 'move_made');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE user_role AS ENUM ('player', 'admin', 'moderator');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Game statistics table
CREATE TABLE IF NOT EXISTS game_stats (
    game_id VARCHAR(255) PRIMARY KEY,
    game_type VARCHAR(100) NOT NULL,
    start_time BIGINT NOT NULL,
    end_time BIGINT,
    duration BIGINT,
    players JSONB NOT NULL,
    winner VARCHAR(100),
    total_moves INTEGER NOT NULL DEFAULT 0,
    status game_status NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Activity log table
CREATE TABLE IF NOT EXISTS activity_log (
    id SERIAL PRIMARY KEY,
    game_id VARCHAR(255) NOT NULL,
    game_type VARCHAR(100) NOT NULL,
    action activity_action NOT NULL,
    timestamp BIGINT NOT NULL,
    players TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Game states table
CREATE TABLE IF NOT EXISTS game_states (
    game_id VARCHAR(255) PRIMARY KEY,
    game_type VARCHAR(100) NOT NULL,
    game_state JSONB NOT NULL,
    move_history JSONB NOT NULL DEFAULT '[]'::jsonb,
    players JSONB NOT NULL,
    status game_status NOT NULL DEFAULT 'waiting',
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(255) PRIMARY KEY,
    username VARCHAR(100) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    is_active BOOLEAN DEFAULT true,
    role user_role DEFAULT 'player'
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_game_stats_type ON game_stats(game_type);
CREATE INDEX IF NOT EXISTS idx_game_stats_status ON game_stats(status);
CREATE INDEX IF NOT EXISTS idx_game_stats_start_time ON game_stats(start_time DESC);
CREATE INDEX IF NOT EXISTS idx_game_stats_created ON game_stats(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_game_stats_players ON game_stats USING GIN(players);

CREATE INDEX IF NOT EXISTS idx_activity_timestamp ON activity_log(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_activity_game_type ON activity_log(game_type);
CREATE INDEX IF NOT EXISTS idx_activity_game_id ON activity_log(game_id);
CREATE INDEX IF NOT EXISTS idx_activity_created ON activity_log(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_game_states_type ON game_states(game_type);
CREATE INDEX IF NOT EXISTS idx_game_states_status ON game_states(status);
CREATE INDEX IF NOT EXISTS idx_game_states_updated ON game_states(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_game_states_players ON game_states USING GIN(players);

CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_active ON users(is_active) WHERE is_active = true;

-- Create function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for automatic updated_at updates
DROP TRIGGER IF EXISTS update_game_stats_updated_at ON game_stats;
CREATE TRIGGER update_game_stats_updated_at
    BEFORE UPDATE ON game_stats
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_game_states_updated_at ON game_states;
CREATE TRIGGER update_game_states_updated_at
    BEFORE UPDATE ON game_states
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_users_updated_at ON users;
CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Grant permissions (adjust if needed for specific users)
-- GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO versus_user;
-- GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO versus_user;

-- Log successful initialization
DO $$
BEGIN
    RAISE NOTICE 'Versus Game Platform database initialized successfully';
END $$;