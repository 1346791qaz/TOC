-- Many-to-many: lift step-specific attributes off data_elements into a
-- separate junction table (step_data_elements). One field definition can
-- now be linked to multiple process steps without duplication.

-- 1. Give data_elements its own value-stream scope (was implicit via step).
ALTER TABLE data_elements ADD COLUMN value_stream_id TEXT;
UPDATE data_elements
  SET value_stream_id = (
    SELECT value_stream_id FROM process_steps WHERE process_steps.id = data_elements.step_id
  );
CREATE INDEX idx_data_elements_vs ON data_elements(value_stream_id);

-- 2. Create the junction table.
CREATE TABLE step_data_elements (
  id               TEXT PRIMARY KEY,
  step_id          TEXT NOT NULL REFERENCES process_steps(id),
  data_element_id  TEXT NOT NULL REFERENCES data_elements(id),
  binding_point    TEXT NOT NULL DEFAULT 'entry',
  presence         TEXT NOT NULL DEFAULT 'present',
  quality_notes    TEXT,
  is_key           INTEGER NOT NULL DEFAULT 0,
  created_at       TEXT NOT NULL,
  updated_at       TEXT NOT NULL,
  deleted_at       TEXT
);
CREATE INDEX idx_step_data_elements_step ON step_data_elements(step_id);
CREATE INDEX idx_step_data_elements_de ON step_data_elements(data_element_id);

-- 3. Migrate existing one-step bindings into the junction table.
INSERT INTO step_data_elements
  (id, step_id, data_element_id, binding_point, presence, quality_notes, is_key,
   created_at, updated_at, deleted_at)
SELECT
  lower(hex(randomblob(4))) || '-' ||
  lower(hex(randomblob(2))) || '-4' ||
  substr(lower(hex(randomblob(2))), 2) || '-' ||
  substr('89ab', abs(random()) % 4 + 1, 1) ||
  substr(lower(hex(randomblob(2))), 2) || '-' ||
  lower(hex(randomblob(6))),
  step_id,
  id,
  binding_point,
  presence,
  quality_notes,
  is_key,
  created_at,
  updated_at,
  deleted_at
FROM data_elements
WHERE step_id IS NOT NULL;

-- 4. Remove step-specific columns from data_elements (requires SQLite >= 3.35).
DROP INDEX idx_data_elements_step;
ALTER TABLE data_elements DROP COLUMN step_id;
ALTER TABLE data_elements DROP COLUMN binding_point;
ALTER TABLE data_elements DROP COLUMN presence;
ALTER TABLE data_elements DROP COLUMN quality_notes;
ALTER TABLE data_elements DROP COLUMN is_key;
