ALTER TABLE bookings
  ADD CONSTRAINT bookings_booking_time_slot_chk
  CHECK (
    booking_time >= TIME '09:00'
    AND booking_time < TIME '21:00'
    AND EXTRACT(MINUTE FROM booking_time) = 0
    AND EXTRACT(SECOND FROM booking_time) = 0
  );

ALTER TABLE blocked_slots
  ADD CONSTRAINT blocked_slots_booking_time_slot_chk
  CHECK (
    booking_time IS NULL
    OR (
      booking_time >= TIME '09:00'
      AND booking_time < TIME '21:00'
      AND EXTRACT(MINUTE FROM booking_time) = 0
      AND EXTRACT(SECOND FROM booking_time) = 0
    )
  );
