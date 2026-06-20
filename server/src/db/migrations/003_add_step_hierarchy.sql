-- Add self-referencing hierarchy to process steps. A NULL parent_step_id means
-- the step is at the top level of its value stream; a non-NULL value nests it
-- as a sub-step. No SQL foreign key (SQLite can't add one via ALTER) — integrity
-- is maintained in the application layer, consistent with other id references.
ALTER TABLE process_steps ADD COLUMN parent_step_id TEXT;
CREATE INDEX idx_process_steps_parent ON process_steps(parent_step_id);
