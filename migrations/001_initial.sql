BEGIN;

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY,
  username varchar(32) NOT NULL,
  email varchar(254) NOT NULL,
  password_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_unique ON users (lower(email));
CREATE UNIQUE INDEX IF NOT EXISTS users_username_lower_unique ON users (lower(username));

CREATE TABLE IF NOT EXISTS sessions (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash char(64) NOT NULL UNIQUE,
  csrf_token_hash char(64),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  CHECK (expires_at > created_at)
);
CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions(user_id);
CREATE INDEX IF NOT EXISTS sessions_expiry_idx ON sessions(expires_at);

CREATE TABLE IF NOT EXISTS session_revocations (
  token_hash char(64) PRIMARY KEY,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS session_revocations_expiry_idx ON session_revocations(expires_at);

CREATE TABLE IF NOT EXISTS products (
  id uuid PRIMARY KEY,
  name varchar(200) NOT NULL,
  price_cents bigint NOT NULL CHECK (price_cents >= 0),
  currency char(3) NOT NULL DEFAULT 'BRL',
  description text NOT NULL DEFAULT '',
  image text,
  category varchar(120) NOT NULL DEFAULT '',
  tags jsonb NOT NULL DEFAULT '[]'::jsonb,
  active boolean NOT NULL DEFAULT true,
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS products_active_idx ON products(active);

CREATE TABLE IF NOT EXISTS inventory (
  product_id uuid PRIMARY KEY REFERENCES products(id) ON DELETE CASCADE,
  available_quantity bigint NOT NULL CHECK (available_quantity >= 0),
  reserved_quantity bigint NOT NULL DEFAULT 0 CHECK (reserved_quantity >= 0),
  consumed_quantity bigint NOT NULL DEFAULT 0 CHECK (consumed_quantity >= 0),
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (available_quantity + reserved_quantity + consumed_quantity >= 0)
);

CREATE TABLE IF NOT EXISTS coupons (
  id uuid PRIMARY KEY,
  code varchar(128) NOT NULL UNIQUE,
  coupon_type varchar(16) NOT NULL CHECK (coupon_type IN ('percent','fixed')),
  value bigint NOT NULL CHECK (value >= 0),
  currency char(3) NOT NULL DEFAULT 'BRL',
  starts_at timestamptz,
  expires_at timestamptz,
  usage_limit bigint CHECK (usage_limit IS NULL OR usage_limit >= 0),
  used_count bigint NOT NULL DEFAULT 0 CHECK (used_count >= 0),
  minimum_amount_cents bigint NOT NULL DEFAULT 0 CHECK (minimum_amount_cents >= 0),
  product_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  category varchar(120),
  customer_id uuid REFERENCES users(id) ON DELETE SET NULL,
  active boolean NOT NULL DEFAULT true,
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (expires_at IS NULL OR starts_at IS NULL OR expires_at > starts_at),
  CHECK (usage_limit IS NULL OR used_count <= usage_limit)
);
CREATE INDEX IF NOT EXISTS coupons_active_idx ON coupons(active);
CREATE INDEX IF NOT EXISTS coupons_expiry_idx ON coupons(expires_at);

CREATE TABLE IF NOT EXISTS orders (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  status varchar(16) NOT NULL CHECK (status IN ('PENDING','PAID','FAILED','CANCELLED','EXPIRED')),
  subtotal_cents bigint NOT NULL CHECK (subtotal_cents >= 0),
  discount_cents bigint NOT NULL DEFAULT 0 CHECK (discount_cents >= 0),
  total_cents bigint NOT NULL CHECK (total_cents >= 0),
  currency char(3) NOT NULL DEFAULT 'BRL',
  coupon_id uuid REFERENCES coupons(id) ON DELETE SET NULL,
  idempotency_key_hash char(64) NOT NULL UNIQUE,
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  failure_code varchar(128),
  last_reconciliation_at timestamptz,
  last_reconciliation_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (discount_cents <= subtotal_cents),
  CHECK (total_cents = subtotal_cents - discount_cents)
);
CREATE INDEX IF NOT EXISTS orders_user_created_idx ON orders(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS orders_status_created_idx ON orders(status, created_at);
CREATE INDEX IF NOT EXISTS orders_reconciliation_idx ON orders(status, last_reconciliation_at);

CREATE TABLE IF NOT EXISTS order_items (
  id uuid PRIMARY KEY,
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  product_name text NOT NULL,
  quantity bigint NOT NULL CHECK (quantity > 0),
  unit_price_cents bigint NOT NULL CHECK (unit_price_cents >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(order_id, product_id)
);
CREATE INDEX IF NOT EXISTS order_items_product_idx ON order_items(product_id);

CREATE TABLE IF NOT EXISTS payments (
  id uuid PRIMARY KEY,
  order_id uuid NOT NULL UNIQUE REFERENCES orders(id) ON DELETE RESTRICT,
  provider varchar(32) NOT NULL DEFAULT 'promisse',
  provider_transaction_id varchar(200) UNIQUE,
  provider_status varchar(32) CHECK (provider_status IN ('pending','PAID','payment.failed')),
  status varchar(16) NOT NULL CHECK (status IN ('PENDING','PAID','FAILED','CANCELLED','EXPIRED')),
  amount_cents bigint NOT NULL CHECK (amount_cents >= 0),
  currency char(3) NOT NULL DEFAULT 'BRL',
  copy_paste text,
  qr_code_base64 text,
  expires_at timestamptz,
  last_provider_query_at timestamptz,
  reconciliation_required boolean NOT NULL DEFAULT false,
  reconciliation_reason text,
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS payments_status_idx ON payments(status);
CREATE INDEX IF NOT EXISTS payments_provider_status_idx ON payments(provider_status);
CREATE INDEX IF NOT EXISTS payments_reconciliation_idx ON payments(reconciliation_required, status);

CREATE TABLE IF NOT EXISTS coupon_reservations (
  id uuid PRIMARY KEY,
  coupon_id uuid NOT NULL REFERENCES coupons(id) ON DELETE RESTRICT,
  order_id uuid NOT NULL UNIQUE REFERENCES orders(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  state varchar(16) NOT NULL CHECK (state IN ('RESERVED','CONSUMED','RELEASED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  consumed_at timestamptz,
  released_at timestamptz
);
CREATE INDEX IF NOT EXISTS coupon_reservations_coupon_state_idx ON coupon_reservations(coupon_id, state);

CREATE TABLE IF NOT EXISTS webhook_events (
  id uuid PRIMARY KEY,
  provider varchar(32) NOT NULL DEFAULT 'promisse',
  event_id varchar(200) NOT NULL UNIQUE,
  event_name varchar(64) NOT NULL,
  transaction_id varchar(200),
  amount_cents bigint CHECK (amount_cents IS NULL OR amount_cents >= 0),
  payload_hash char(64) NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  processing_error text
);
CREATE INDEX IF NOT EXISTS webhook_events_transaction_idx ON webhook_events(transaction_id);
CREATE INDEX IF NOT EXISTS webhook_events_unprocessed_idx ON webhook_events(processed_at);

CREATE TABLE IF NOT EXISTS pending_webhook_events (
  id uuid PRIMARY KEY,
  event_id varchar(200) NOT NULL UNIQUE,
  provider varchar(32) NOT NULL DEFAULT 'promisse',
  event_name varchar(64) NOT NULL,
  transaction_id varchar(200) NOT NULL,
  amount_cents bigint NOT NULL CHECK (amount_cents >= 0),
  payload_hash char(64) NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  last_error text,
  resolved_at timestamptz
);
CREATE INDEX IF NOT EXISTS pending_webhook_retry_idx ON pending_webhook_events(resolved_at, next_attempt_at);

CREATE TABLE IF NOT EXISTS reconciliation_attempts (
  id uuid PRIMARY KEY,
  payment_id uuid REFERENCES payments(id) ON DELETE CASCADE,
  provider_transaction_id varchar(200),
  reason varchar(128) NOT NULL,
  attempt_number integer NOT NULL CHECK (attempt_number > 0),
  status varchar(16) NOT NULL CHECK (status IN ('STARTED','SUCCESS','RETRY','FAILED')),
  error_code varchar(128),
  error_message text,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  next_retry_at timestamptz
);
CREATE INDEX IF NOT EXISTS reconciliation_payment_idx ON reconciliation_attempts(payment_id, started_at DESC);
CREATE INDEX IF NOT EXISTS reconciliation_retry_idx ON reconciliation_attempts(status, next_retry_at);

CREATE TABLE IF NOT EXISTS audit_events (
  id uuid PRIMARY KEY,
  event varchar(128) NOT NULL,
  actor_id uuid REFERENCES users(id) ON DELETE SET NULL,
  resource_type varchar(64),
  resource_id varchar(200),
  request_id varchar(128),
  order_id uuid REFERENCES orders(id) ON DELETE SET NULL,
  payment_id uuid REFERENCES payments(id) ON DELETE SET NULL,
  result varchar(32),
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_events_created_idx ON audit_events(created_at DESC);
CREATE INDEX IF NOT EXISTS audit_events_resource_idx ON audit_events(resource_type, resource_id);
CREATE INDEX IF NOT EXISTS audit_events_order_idx ON audit_events(order_id, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_events_payment_idx ON audit_events(payment_id, created_at DESC);

CREATE TABLE IF NOT EXISTS analytics_events (
  id uuid PRIMARY KEY,
  event varchar(64) NOT NULL CHECK (event IN ('page_view','product_view','checkout_start')),
  path varchar(200) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS analytics_events_created_idx ON analytics_events(created_at DESC);

CREATE TABLE IF NOT EXISTS support_tickets (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  subject varchar(200) NOT NULL,
  message text NOT NULL,
  status varchar(32) NOT NULL CHECK (status IN ('open','in_progress','resolved')),
  admin_reply text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS support_tickets_user_idx ON support_tickets(user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS posts (
  id uuid PRIMARY KEY,
  slug varchar(100) NOT NULL UNIQUE,
  title varchar(240) NOT NULL,
  summary text NOT NULL,
  content text NOT NULL,
  image text,
  category varchar(120) NOT NULL,
  status varchar(16) NOT NULL CHECK (status IN ('draft','published','scheduled')),
  published_at timestamptz,
  scheduled_at timestamptz,
  seo_title varchar(240),
  seo_description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS faqs (
  id uuid PRIMARY KEY,
  question varchar(500) NOT NULL,
  answer text NOT NULL,
  category varchar(120) NOT NULL,
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS admin_users (
  id uuid PRIMARY KEY,
  username varchar(128) NOT NULL UNIQUE,
  access_level varchar(32) NOT NULL CHECK (access_level = 'OWNER'),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS schema_migrations (
  version varchar(64) PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS orders_paid_revenue_idx ON orders(status, created_at) WHERE status = 'PAID';

COMMIT;
