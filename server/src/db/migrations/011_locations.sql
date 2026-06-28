-- Locations: physical workcenters, rooms, or stations where process steps occur.
-- App-wide (no value_stream_id) — a plant floor or building belongs to the whole org.

CREATE TABLE locations (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  description TEXT,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  deleted_at  TEXT
);

-- Add optional location reference to process steps (null = location not relevant).
ALTER TABLE process_steps ADD COLUMN location_id TEXT REFERENCES locations(id);
