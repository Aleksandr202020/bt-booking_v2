-- Make the vehicle catalog explicitly application-owned.
-- SS.COM is not queried at runtime and no synchronization job is required.

ALTER TABLE vehicle_makes
  ALTER COLUMN source SET DEFAULT 'local';

ALTER TABLE vehicle_models
  ALTER COLUMN source SET DEFAULT 'local';

UPDATE vehicle_makes
SET source = 'local'
WHERE source IS DISTINCT FROM 'local';

UPDATE vehicle_models
SET source = 'local'
WHERE source IS DISTINCT FROM 'local';

-- Preserve existing customer cars while ensuring every new catalog row
-- is owned by this application rather than an external provider.
COMMENT ON COLUMN vehicle_makes.source IS 'Catalog ownership/source label; local means maintained by BT Booking.';
COMMENT ON COLUMN vehicle_models.source IS 'Catalog ownership/source label; local means maintained by BT Booking.';
