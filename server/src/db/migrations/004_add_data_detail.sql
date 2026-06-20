-- Two levels of data detail.
-- Step level: the higher-level data landscape governing the step.
ALTER TABLE process_steps ADD COLUMN data_source_systems TEXT;
ALTER TABLE process_steps ADD COLUMN data_databases TEXT;
ALTER TABLE process_steps ADD COLUMN data_tables TEXT;
ALTER TABLE process_steps ADD COLUMN data_etl_jobs TEXT;

-- Data element level: the specific data point for an activity. binding_point
-- already records entry (source) vs action/exit (target); table_or_view +
-- field_name pin down the physical location.
ALTER TABLE data_elements ADD COLUMN business_description TEXT;
ALTER TABLE data_elements ADD COLUMN table_or_view TEXT;
ALTER TABLE data_elements ADD COLUMN field_name TEXT;
ALTER TABLE data_elements ADD COLUMN example_value TEXT;
