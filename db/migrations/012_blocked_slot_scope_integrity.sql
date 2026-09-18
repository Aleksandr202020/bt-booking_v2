CREATE OR REPLACE FUNCTION enforce_blocked_slot_scope()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('booking-date:' || NEW.booking_date::text));

  IF NEW.booking_time IS NULL THEN
    IF EXISTS (
      SELECT 1
      FROM blocked_slots
      WHERE booking_date = NEW.booking_date
        AND booking_time IS NOT NULL
        AND id <> NEW.id
    ) THEN
      RAISE EXCEPTION 'WHOLE_DAY_BLOCK_CONFLICT'
        USING ERRCODE = '23514',
              CONSTRAINT = 'blocked_slots_scope_conflict_chk';
    END IF;
  ELSIF EXISTS (
    SELECT 1
    FROM blocked_slots
    WHERE booking_date = NEW.booking_date
      AND booking_time IS NULL
      AND id <> NEW.id
  ) THEN
    RAISE EXCEPTION 'SLOT_BLOCK_CONFLICT_WITH_WHOLE_DAY'
      USING ERRCODE = '23514',
            CONSTRAINT = 'blocked_slots_scope_conflict_chk';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER blocked_slots_scope_conflict_trg
BEFORE INSERT OR UPDATE OF booking_date, booking_time ON blocked_slots
FOR EACH ROW
EXECUTE FUNCTION enforce_blocked_slot_scope();
