-- OIL Constraint Mapper — initial schema.
-- Conventions: ids are uuid TEXT; timestamps are ISO-8601 TEXT; booleans are
-- INTEGER (0/1); deleted_at is NULL for live rows. Foreign keys reference rows
-- regardless of their soft-delete state — soft delete is enforced in queries.

CREATE TABLE engagements (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  client_org  TEXT,
  notes       TEXT,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  deleted_at  TEXT
);

CREATE TABLE value_streams (
  id               TEXT PRIMARY KEY,
  engagement_id    TEXT NOT NULL REFERENCES engagements(id),
  name             TEXT NOT NULL,
  problem_statement TEXT,
  scope_level      TEXT NOT NULL DEFAULT 'local',
  narrative        TEXT,
  created_at       TEXT NOT NULL,
  updated_at       TEXT NOT NULL,
  deleted_at       TEXT
);
CREATE INDEX idx_value_streams_engagement ON value_streams(engagement_id);

CREATE TABLE assumptions (
  id               TEXT PRIMARY KEY,
  value_stream_id  TEXT NOT NULL REFERENCES value_streams(id),
  statement        TEXT NOT NULL,
  status           TEXT NOT NULL DEFAULT 'unvalidated',
  evidence         TEXT,
  created_at       TEXT NOT NULL,
  updated_at       TEXT NOT NULL,
  deleted_at       TEXT
);
CREATE INDEX idx_assumptions_vs ON assumptions(value_stream_id);

CREATE TABLE metrics (
  id               TEXT PRIMARY KEY,
  value_stream_id  TEXT NOT NULL REFERENCES value_streams(id),
  name             TEXT NOT NULL,
  unit             TEXT,
  metric_type      TEXT NOT NULL DEFAULT 'other',
  baseline_value   REAL,
  current_value    REAL,
  target_value     REAL,
  is_leading       INTEGER NOT NULL DEFAULT 0,
  source           TEXT,
  created_at       TEXT NOT NULL,
  updated_at       TEXT NOT NULL,
  deleted_at       TEXT
);
CREATE INDEX idx_metrics_vs ON metrics(value_stream_id);

CREATE TABLE personas (
  id               TEXT PRIMARY KEY,
  value_stream_id  TEXT NOT NULL REFERENCES value_streams(id),
  name             TEXT NOT NULL,
  role_title       TEXT,
  function         TEXT,
  scope_level      TEXT NOT NULL DEFAULT 'local',
  responsibilities TEXT,
  authority_notes  TEXT,
  created_at       TEXT NOT NULL,
  updated_at       TEXT NOT NULL,
  deleted_at       TEXT
);
CREATE INDEX idx_personas_vs ON personas(value_stream_id);

CREATE TABLE process_steps (
  id               TEXT PRIMARY KEY,
  value_stream_id  TEXT NOT NULL REFERENCES value_streams(id),
  name             TEXT NOT NULL,
  sequence_index   INTEGER NOT NULL DEFAULT 0,
  entry_criteria   TEXT,
  action           TEXT,
  exit_criteria    TEXT,
  cycle_time       REAL,
  wait_time        REAL,
  pct_complete_accurate REAL,
  created_at       TEXT NOT NULL,
  updated_at       TEXT NOT NULL,
  deleted_at       TEXT
);
CREATE INDEX idx_process_steps_vs ON process_steps(value_stream_id);

CREATE TABLE step_personas (
  id           TEXT PRIMARY KEY,
  step_id      TEXT NOT NULL REFERENCES process_steps(id),
  persona_id   TEXT NOT NULL REFERENCES personas(id),
  role_on_step TEXT NOT NULL DEFAULT 'executor',
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL,
  deleted_at   TEXT
);
CREATE INDEX idx_step_personas_step ON step_personas(step_id);
CREATE INDEX idx_step_personas_persona ON step_personas(persona_id);

CREATE TABLE data_elements (
  id            TEXT PRIMARY KEY,
  step_id       TEXT NOT NULL REFERENCES process_steps(id),
  name          TEXT NOT NULL,
  binding_point TEXT NOT NULL DEFAULT 'entry',
  data_type     TEXT,
  source_system TEXT,
  presence      TEXT NOT NULL DEFAULT 'present',
  quality_notes TEXT,
  is_key        INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  deleted_at    TEXT
);
CREATE INDEX idx_data_elements_step ON data_elements(step_id);

CREATE TABLE constraints (
  id                   TEXT PRIMARY KEY,
  value_stream_id      TEXT NOT NULL REFERENCES value_streams(id),
  title                TEXT NOT NULL,
  description          TEXT,
  kind                 TEXT NOT NULL DEFAULT 'constraint',
  target_type          TEXT NOT NULL,
  target_id            TEXT,
  severity             TEXT NOT NULL DEFAULT 'medium',
  likelihood           TEXT,
  toc_status           TEXT NOT NULL DEFAULT 'none',
  is_system_constraint INTEGER NOT NULL DEFAULT 0,
  created_at           TEXT NOT NULL,
  updated_at           TEXT NOT NULL,
  deleted_at           TEXT
);
CREATE INDEX idx_constraints_vs ON constraints(value_stream_id);
CREATE INDEX idx_constraints_target ON constraints(target_type, target_id);

CREATE TABLE flow_edges (
  id              TEXT PRIMARY KEY,
  value_stream_id TEXT NOT NULL REFERENCES value_streams(id),
  from_type       TEXT NOT NULL,
  from_id         TEXT NOT NULL,
  to_type         TEXT NOT NULL,
  to_id           TEXT NOT NULL,
  edge_type       TEXT NOT NULL DEFAULT 'sequence',
  notes           TEXT,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL,
  deleted_at      TEXT
);
CREATE INDEX idx_flow_edges_vs ON flow_edges(value_stream_id);
