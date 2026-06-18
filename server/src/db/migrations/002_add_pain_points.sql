-- Add a free-text Pain Points field to process steps (capped at 5000 chars in
-- the application layer; SQLite TEXT is unbounded).
ALTER TABLE process_steps ADD COLUMN pain_points TEXT;
