BEGIN;

CREATE TABLE IF NOT EXISTS webhooks (
  id uuid PRIMARY KEY,
  name varchar(120) NOT NULL,
  url text NOT NULL,
  method varchar(8) NOT NULL CHECK (method IN ('POST','PUT','PATCH')),
  events jsonb NOT NULL DEFAULT '[]'::jsonb,
  active boolean NOT NULL DEFAULT true,
  secret_ciphertext text NOT NULL,
  headers_ciphertext jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS webhooks_active_idx ON webhooks(active);

CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id uuid PRIMARY KEY,
  webhook_id uuid NOT NULL REFERENCES webhooks(id) ON DELETE CASCADE,
  event varchar(64) NOT NULL,
  status varchar(16) NOT NULL CHECK (status IN ('success','failed')),
  status_code integer,
  duration_ms integer NOT NULL CHECK (duration_ms >= 0),
  attempts integer NOT NULL CHECK (attempts > 0),
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS webhook_deliveries_webhook_idx ON webhook_deliveries(webhook_id, created_at DESC);

COMMIT;
