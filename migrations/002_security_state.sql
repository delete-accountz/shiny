BEGIN;

CREATE TABLE IF NOT EXISTS csrf_tokens (
  token_hash char(64) PRIMARY KEY,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS csrf_tokens_expiry_idx ON csrf_tokens(expires_at);

CREATE TABLE IF NOT EXISTS rate_limit_buckets (
  bucket_key varchar(300) PRIMARY KEY,
  window_started_at timestamptz NOT NULL,
  attempt_count integer NOT NULL CHECK (attempt_count >= 0),
  expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS rate_limit_buckets_expiry_idx ON rate_limit_buckets(expires_at);

CREATE TABLE IF NOT EXISTS idempotency_records (
  scope varchar(128) NOT NULL,
  key_hash char(64) NOT NULL,
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  resource_type varchar(64) NOT NULL,
  resource_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  PRIMARY KEY(scope,key_hash)
);

COMMIT;
