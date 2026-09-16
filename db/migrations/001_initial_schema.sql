CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE user_role AS ENUM ('customer', 'admin');
CREATE TYPE car_category AS ENUM ('passenger', 'crossover', 'minivan', 'commercial');
CREATE TYPE booking_status AS ENUM (
  'pending',
  'confirmed',
  'completed',
  'cancelled_customer',
  'cancelled_admin',
  'no_show'
);

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL CHECK (length(trim(name)) >= 2),
  email TEXT NOT NULL UNIQUE,
  phone TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role user_role NOT NULL DEFAULT 'customer',
  banned BOOLEAN NOT NULL DEFAULT FALSE,
  ban_reason TEXT,
  banned_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT users_ban_state_chk CHECK (
    (banned = FALSE AND banned_at IS NULL)
    OR (banned = TRUE AND banned_at IS NOT NULL)
  )
);

CREATE TABLE sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX sessions_user_id_idx ON sessions(user_id);
CREATE INDEX sessions_expires_at_idx ON sessions(expires_at);

CREATE TABLE cars (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  make TEXT NOT NULL,
  model TEXT NOT NULL,
  registration_number TEXT NOT NULL,
  category car_category NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (id, user_id)
);

CREATE INDEX cars_user_id_idx ON cars(user_id);

CREATE TABLE bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  car_id UUID NOT NULL,
  booking_date DATE NOT NULL,
  booking_time TIME NOT NULL,
  price_cents INTEGER NOT NULL CHECK (price_cents > 0),
  status booking_status NOT NULL DEFAULT 'pending',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT bookings_car_owner_fk
    FOREIGN KEY (car_id, user_id) REFERENCES cars(id, user_id) ON DELETE RESTRICT
);

CREATE INDEX bookings_user_id_idx ON bookings(user_id);
CREATE INDEX bookings_date_time_idx ON bookings(booking_date, booking_time);
CREATE INDEX bookings_car_id_idx ON bookings(car_id);

CREATE UNIQUE INDEX bookings_one_active_slot_idx
  ON bookings (booking_date, booking_time)
  WHERE status IN ('pending', 'confirmed');

CREATE TABLE blocked_slots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_date DATE NOT NULL,
  booking_time TIME,
  reason TEXT NOT NULL,
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX blocked_slots_whole_day_idx
  ON blocked_slots(booking_date)
  WHERE booking_time IS NULL;

CREATE UNIQUE INDEX blocked_slots_slot_idx
  ON blocked_slots(booking_date, booking_time)
  WHERE booking_time IS NOT NULL;

CREATE TABLE holidays (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL UNIQUE,
  name TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  target_id UUID,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX audit_logs_actor_id_idx ON audit_logs(actor_id);
CREATE INDEX audit_logs_created_at_idx ON audit_logs(created_at);

CREATE TABLE app_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO app_settings(key, value) VALUES
  ('timezone', '"Europe/Riga"'::jsonb),
  ('opening_time', '"09:00"'::jsonb),
  ('closing_time', '"21:00"'::jsonb),
  ('slot_minutes', '60'::jsonb),
  ('max_customer_bookings_in_window', '3'::jsonb),
  ('max_customer_bookings_per_car_in_window', '2'::jsonb)
ON CONFLICT (key) DO NOTHING;
