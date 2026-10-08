BEGIN;

CREATE TABLE IF NOT EXISTS admin_sessions (
  id uuid PRIMARY KEY,
  token_hash char(64) NOT NULL UNIQUE,
  actor_username varchar(128) NOT NULL,
  access_level varchar(32) NOT NULL CHECK (access_level='OWNER'),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  CHECK (expires_at > created_at)
);
CREATE INDEX IF NOT EXISTS admin_sessions_expiry_idx ON admin_sessions(expires_at);

COMMIT;
