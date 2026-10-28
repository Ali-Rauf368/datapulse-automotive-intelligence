-- Base schema required by DataPulse. Safe to run against an existing database
-- that already has this compatible vehicles table.
CREATE TABLE IF NOT EXISTS vehicles (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  vin VARCHAR(17) NOT NULL UNIQUE,
  make VARCHAR(100) NOT NULL,
  model VARCHAR(100) NOT NULL,
  model_year INTEGER NOT NULL CHECK (model_year BETWEEN 1886 AND 2200),
  status VARCHAR(20) NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'sold', 'in_service')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vehicles_status ON vehicles(status);
