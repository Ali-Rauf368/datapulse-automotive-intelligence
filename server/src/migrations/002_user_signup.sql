-- Add a display name for self-registered DataPulse users.
ALTER TABLE app_users
  ADD COLUMN IF NOT EXISTS name VARCHAR(100) NOT NULL DEFAULT 'DataPulse User';
