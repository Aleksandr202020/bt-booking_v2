INSERT INTO app_settings(key, value) VALUES
  ('customer_booking_window_days', '30'::jsonb)
ON CONFLICT (key) DO NOTHING;
