ALTER TABLE bookings
  ADD CONSTRAINT bookings_user_fk
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT;
