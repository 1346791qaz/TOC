-- Database connections: stores saved connection configs per value stream.
-- driver_type controls which Node.js driver is used at runtime.
-- password is stored plaintext (local-first app, no remote exposure).
-- extra_options is a JSON string for driver-specific overrides or a raw
-- connection string when driver_type = 'other'.
CREATE TABLE db_connections (
  id              TEXT    PRIMARY KEY,
  value_stream_id TEXT    NOT NULL REFERENCES value_streams(id),
  name            TEXT    NOT NULL,
  driver_type     TEXT    NOT NULL DEFAULT 'postgresql',
  host            TEXT,
  port            INTEGER,
  database_name   TEXT,
  username        TEXT,
  password        TEXT,
  ssl             INTEGER NOT NULL DEFAULT 0,
  extra_options   TEXT,
  created_at      TEXT    NOT NULL,
  updated_at      TEXT    NOT NULL,
  deleted_at      TEXT
);

CREATE INDEX idx_db_connections_vs ON db_connections (value_stream_id);
