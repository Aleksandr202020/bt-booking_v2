ALTER TABLE users
  ADD CONSTRAINT users_ban_reason_length_chk
  CHECK (ban_reason IS NULL OR length(ban_reason) <= 500);
