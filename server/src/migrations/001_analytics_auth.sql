CREATE TABLE IF NOT EXISTS sales_events (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  vehicle_id BIGINT REFERENCES vehicles(id) ON DELETE SET NULL,
  amount NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
  sold_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  source VARCHAR(100) NOT NULL DEFAULT 'manual',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sales_events_sold_at
  ON sales_events(sold_at);

CREATE TABLE IF NOT EXISTS service_events (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  vehicle_id BIGINT REFERENCES vehicles(id) ON DELETE SET NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'open'
    CHECK (status IN ('open','in_progress','completed','cancelled')),
  description TEXT NOT NULL,
  opened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  source VARCHAR(100) NOT NULL DEFAULT 'manual',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (completed_at IS NULL OR completed_at >= opened_at)
);

CREATE INDEX IF NOT EXISTS idx_service_events_opened_at
  ON service_events(opened_at);

CREATE TABLE IF NOT EXISTS app_users (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email VARCHAR(254) NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role VARCHAR(20) NOT NULL DEFAULT 'viewer'
    CHECK (role IN ('admin','operator','viewer')),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_app_users_email_lower
  ON app_users (lower(email));

CREATE TABLE IF NOT EXISTS api_credentials (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  role VARCHAR(20) NOT NULL DEFAULT 'operator'
    CHECK (role IN ('admin','operator','viewer')),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS nifi_request_logs (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  flow_name VARCHAR(150) NOT NULL DEFAULT 'vehicle-ingestion',
  outcome VARCHAR(20) NOT NULL CHECK (outcome IN ('success','failure')),
  http_status INTEGER,
  message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_nifi_request_logs_created_at
  ON nifi_request_logs(created_at);
