-- Expand locations with type, address, and map coordinates.
ALTER TABLE locations ADD COLUMN location_type TEXT NOT NULL DEFAULT 'work_center';
ALTER TABLE locations ADD COLUMN address TEXT;
ALTER TABLE locations ADD COLUMN latitude  REAL;
ALTER TABLE locations ADD COLUMN longitude REAL;
