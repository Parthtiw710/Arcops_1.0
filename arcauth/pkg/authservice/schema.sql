-- -----------------------------------------------------------------------------
-- ARCAUTH SCHEMA DDL — Single-User/Single-Tenant Edition
-- -----------------------------------------------------------------------------

-- 1. Users & Core Profile Table (no team_id — single-user)
CREATE TABLE IF NOT EXISTS auth_users (
    id VARCHAR(64) PRIMARY KEY,
    email VARCHAR(255) UNIQUE,
    mobile VARCHAR(32) UNIQUE,
    password_hash TEXT,
    full_name VARCHAR(128),
    avatar_url TEXT,
    metadata TEXT DEFAULT '{}',
    plan_tier INT NOT NULL DEFAULT 0,       -- 0: Free, 1: Pro, 2: Enterprise
    billing_id VARCHAR(64) DEFAULT NULL,
    stripe_customer_id VARCHAR(255) DEFAULT NULL,
    is_email_verified INT DEFAULT 0,
    is_mobile_verified INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_auth_users_email ON auth_users(email);
CREATE INDEX IF NOT EXISTS idx_auth_users_mobile ON auth_users(mobile);

-- 2. OAuth Social Identities (GitHub / Google)
CREATE TABLE IF NOT EXISTS auth_identities (
    id VARCHAR(64) PRIMARY KEY,
    user_id VARCHAR(64) NOT NULL,
    provider VARCHAR(32) NOT NULL,
    provider_user_id VARCHAR(255) NOT NULL,
    identity_data TEXT DEFAULT '{}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_auth_identities_user_id ON auth_identities(user_id);

-- 3. Scoped Bearer API Keys (no team_id — single-user scope)
CREATE TABLE IF NOT EXISTS auth_api_keys (
    id               VARCHAR(64)  PRIMARY KEY,
    user_id          VARCHAR(64)  NOT NULL,
    role             VARCHAR(16)  NOT NULL DEFAULT 'api',  -- 'admin' | 'anon' | 'sbx' | 'api'
    key_hash         VARCHAR(128) NOT NULL UNIQUE,
    key_display_prefix VARCHAR(32) NOT NULL,
    key_suffix       VARCHAR(4)   NOT NULL,
    name             VARCHAR(64)  NOT NULL,
    last_used_at     TIMESTAMP NULL,
    expires_at       TIMESTAMP NULL,
    created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_auth_api_keys_hash ON auth_api_keys(key_hash);

-- 4. Active Web Sessions
CREATE TABLE IF NOT EXISTS auth_sessions (
    id VARCHAR(64) PRIMARY KEY,
    user_id VARCHAR(64) NOT NULL,
    token_hash VARCHAR(128) NOT NULL UNIQUE,
    user_agent TEXT,
    ip_address VARCHAR(45),
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_auth_sessions_hash ON auth_sessions(token_hash);
