-- Who changed what and when. Rows are only ever inserted.
CREATE TABLE IF NOT EXISTS audit_log (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_id BIGINT,
  actor_email VARCHAR(254),
  actor_kind VARCHAR(20) NOT NULL DEFAULT 'user'
    CHECK (actor_kind IN ('user', 'machine', 'system')),
  action VARCHAR(50) NOT NULL,
  entity VARCHAR(30) NOT NULL,
  entity_id BIGINT,
  summary TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_entity ON audit_log(entity, entity_id);
