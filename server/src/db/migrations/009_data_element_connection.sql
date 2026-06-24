-- Track which DB Connection a Data Element was imported from.
-- Nullable: catalog elements and elements created before this migration carry no connection.
-- Used for cascade-trash and blocked-restore checks.
ALTER TABLE data_elements ADD COLUMN db_connection_id TEXT REFERENCES db_connections(id);
