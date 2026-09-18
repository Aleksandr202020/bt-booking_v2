-- Strengthen database-level invariants that application code already relies on.
ALTER TABLE users
  ADD CONSTRAINT users_ban_reason_chk
  CHECK (
    banned = TRUE
    OR ban_reason IS NULL
  );

ALTER TABLE bookings
  ADD CONSTRAINT bookings_notes_length_chk
  CHECK (notes IS NULL OR length(notes) <= 1000);

ALTER TABLE blocked_slots
  ADD CONSTRAINT blocked_slots_reason_length_chk
  CHECK (length(trim(reason)) BETWEEN 1 AND 300);

ALTER TABLE holidays
  ADD CONSTRAINT holidays_name_length_chk
  CHECK (length(trim(name)) BETWEEN 1 AND 150);

ALTER TABLE app_settings
  ADD CONSTRAINT app_settings_json_object_or_scalar_chk
  CHECK (jsonb_typeof(value) IN ('string', 'number', 'boolean', 'object', 'array'));
