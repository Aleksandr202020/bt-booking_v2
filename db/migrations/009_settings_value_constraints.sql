ALTER TABLE app_settings
  ADD CONSTRAINT app_settings_booking_limits_chk
  CHECK (
    key NOT IN (
      'customer_booking_window_days',
      'max_customer_bookings_in_window',
      'max_customer_bookings_per_car_in_window'
    )
    OR (
      jsonb_typeof(value) = 'number'
      AND (value #>> '{}')::numeric >= 1
      AND (value #>> '{}')::numeric <= 365
    )
  );
