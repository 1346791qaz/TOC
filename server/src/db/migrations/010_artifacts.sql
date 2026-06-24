-- Artifacts: digital, physical, or intangible items that move through the value stream
-- but are not specific data elements (e.g. Word docs, spreadsheets, PDFs, videos, paper files).

CREATE TABLE artifacts (
  id               TEXT PRIMARY KEY,
  value_stream_id  TEXT NOT NULL REFERENCES value_streams(id),
  name             TEXT NOT NULL,
  artifact_type    TEXT NOT NULL DEFAULT 'document',
  description      TEXT,
  form             TEXT NOT NULL DEFAULT 'digital',
  created_at       TEXT NOT NULL,
  updated_at       TEXT NOT NULL,
  deleted_at       TEXT
);
CREATE INDEX idx_artifacts_vs ON artifacts(value_stream_id);

-- Junction table: which artifacts are bound to which process steps.
CREATE TABLE step_artifacts (
  id           TEXT PRIMARY KEY,
  step_id      TEXT NOT NULL REFERENCES process_steps(id),
  artifact_id  TEXT NOT NULL REFERENCES artifacts(id),
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL,
  deleted_at   TEXT
);
CREATE INDEX idx_step_artifacts_step     ON step_artifacts(step_id);
CREATE INDEX idx_step_artifacts_artifact ON step_artifacts(artifact_id);
