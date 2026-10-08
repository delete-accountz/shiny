BEGIN;

CREATE TABLE IF NOT EXISTS operational_alerts (
  id uuid PRIMARY KEY,
  severity varchar(16) NOT NULL CHECK (severity IN ('INFO','WARNING','CRITICAL')),
  alert_type varchar(64) NOT NULL,
  resource_type varchar(64),
  resource_id varchar(200),
  order_id uuid REFERENCES orders(id) ON DELETE SET NULL,
  payment_id uuid REFERENCES payments(id) ON DELETE SET NULL,
  message text NOT NULL,
  context jsonb NOT NULL DEFAULT '{}'::jsonb,
  acknowledged_at timestamptz,
  acknowledged_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS operational_alerts_open_idx
  ON operational_alerts(created_at DESC)
  WHERE acknowledged_at IS NULL;

CREATE INDEX IF NOT EXISTS operational_alerts_resource_idx
  ON operational_alerts(resource_type, resource_id, created_at DESC);

COMMIT;
