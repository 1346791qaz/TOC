import {
  ASSUMPTION_STATUSES,
  BINDING_POINTS,
  METRIC_TYPES,
  PRESENCE,
  SCOPE_LEVELS,
} from "@shared/enums";

export type FieldType = "text" | "textarea" | "number" | "boolean" | "select" | "combobox" | "section";

export interface FieldDef {
  name: string;
  label: string;
  type: FieldType;
  /** Static options for a select. */
  options?: readonly string[];
  /** Pull select options at render time from a dynamicOptions[key] list. */
  optionsKey?: string;
  required?: boolean;
  full?: boolean;
  placeholder?: string;
  maxLength?: number;
  /** Preset suggestions for a combobox (free text always allowed). */
  comboOptions?: string[];
  /** Name of another field whose current value controls which combobox options to show. */
  dependsOn?: string;
  /** Map of the depended-on field's value → combobox options to show. */
  comboOptionsByValue?: Record<string, string[]>;
}

// ---------------------------------------------------------------------------
// Source system suggestions
// ---------------------------------------------------------------------------
export const SOURCE_SYSTEMS: string[] = [
  // Relational databases
  "Oracle",
  "SQL Server",
  "MySQL",
  "PostgreSQL",
  "MariaDB",
  "SQLite",
  "DB2",
  "Sybase",
  "Azure SQL",
  "Teradata",
  // Cloud data warehouses
  "Snowflake",
  "BigQuery",
  "Redshift",
  "Azure Synapse",
  "Databricks",
  "SAP HANA",
  // NoSQL / document
  "MongoDB",
  "Cassandra",
  "DynamoDB",
  "Elasticsearch",
  "Redis",
  // ERP
  "SAP",
  "SAP S/4HANA",
  "SAP ECC",
  "Oracle EBS",
  "Oracle ERP Cloud",
  "Microsoft Dynamics",
  "NetSuite",
  "Infor",
  "JD Edwards",
  "PeopleSoft",
  // CRM / Marketing
  "Salesforce",
  "HubSpot",
  "Marketo",
  // HR / ITSM / Ops
  "Workday",
  "ServiceNow",
  // Manufacturing / supply chain
  "MES",
  "WMS",
  "PLM",
  // BI / files / generic
  "Power BI",
  "Tableau",
  "SharePoint",
  "Excel",
  "CSV",
  "ERP",
  "CRM",
];

// ---------------------------------------------------------------------------
// Data type suggestions by source system
// ---------------------------------------------------------------------------
const DEFAULT_TYPES: string[] = [
  "VARCHAR",
  "CHAR",
  "TEXT",
  "INT",
  "INTEGER",
  "BIGINT",
  "SMALLINT",
  "DECIMAL",
  "NUMERIC",
  "FLOAT",
  "DOUBLE",
  "BOOLEAN",
  "DATE",
  "DATETIME",
  "TIMESTAMP",
  "JSON",
  "BLOB",
  "CLOB",
  "BINARY",
  "UUID",
];

export const TYPE_OPTIONS_BY_SOURCE: Record<string, string[]> = {
  Oracle: [
    "NUMBER", "INTEGER", "FLOAT", "BINARY_FLOAT", "BINARY_DOUBLE",
    "VARCHAR2", "NVARCHAR2", "CHAR", "NCHAR",
    "CLOB", "NCLOB", "BLOB", "RAW", "LONG RAW",
    "DATE", "TIMESTAMP", "INTERVAL YEAR TO MONTH", "INTERVAL DAY TO SECOND",
    "XMLTYPE", "SDO_GEOMETRY",
  ],
  "SQL Server": [
    "TINYINT", "SMALLINT", "INT", "BIGINT",
    "DECIMAL", "NUMERIC", "FLOAT", "REAL", "MONEY", "SMALLMONEY", "BIT",
    "CHAR", "VARCHAR", "VARCHAR(MAX)", "NCHAR", "NVARCHAR", "NVARCHAR(MAX)", "TEXT", "NTEXT",
    "DATE", "DATETIME", "DATETIME2", "SMALLDATETIME", "DATETIMEOFFSET", "TIME",
    "BINARY", "VARBINARY", "VARBINARY(MAX)", "IMAGE",
    "XML", "UNIQUEIDENTIFIER", "JSON",
  ],
  MySQL: [
    "TINYINT", "SMALLINT", "INT", "BIGINT",
    "DECIMAL", "FLOAT", "DOUBLE",
    "VARCHAR", "CHAR", "TEXT", "TINYTEXT", "MEDIUMTEXT", "LONGTEXT",
    "BLOB", "TINYBLOB", "MEDIUMBLOB", "LONGBLOB",
    "DATE", "DATETIME", "TIMESTAMP", "TIME", "YEAR",
    "JSON", "ENUM", "SET", "BINARY", "VARBINARY",
  ],
  MariaDB: [
    "TINYINT", "SMALLINT", "INT", "BIGINT",
    "DECIMAL", "FLOAT", "DOUBLE",
    "VARCHAR", "CHAR", "TEXT", "TINYTEXT", "MEDIUMTEXT", "LONGTEXT",
    "BLOB", "DATE", "DATETIME", "TIMESTAMP", "TIME",
    "JSON", "ENUM", "SET", "UUID",
  ],
  PostgreSQL: [
    "SMALLINT", "INTEGER", "BIGINT", "DECIMAL", "NUMERIC", "REAL", "DOUBLE PRECISION",
    "SERIAL", "BIGSERIAL", "BOOLEAN",
    "CHAR", "VARCHAR", "TEXT", "BYTEA",
    "DATE", "TIMESTAMP", "TIMESTAMPTZ", "TIME", "TIMETZ", "INTERVAL",
    "UUID", "JSON", "JSONB", "ARRAY", "HSTORE",
    "INET", "CIDR", "MACADDR", "XML", "BIT", "BIT VARYING",
  ],
  SQLite: [
    "INTEGER", "REAL", "TEXT", "BLOB", "NUMERIC",
  ],
  Snowflake: [
    "NUMBER", "DECIMAL", "INT", "BIGINT", "FLOAT", "DOUBLE", "BOOLEAN",
    "VARCHAR", "CHAR", "STRING", "TEXT",
    "DATE", "DATETIME", "TIME", "TIMESTAMP", "TIMESTAMP_LTZ", "TIMESTAMP_NTZ", "TIMESTAMP_TZ",
    "VARIANT", "OBJECT", "ARRAY", "GEOGRAPHY",
  ],
  BigQuery: [
    "INT64", "FLOAT64", "NUMERIC", "BIGNUMERIC", "BOOL",
    "STRING", "BYTES",
    "DATE", "DATETIME", "TIME", "TIMESTAMP",
    "ARRAY", "STRUCT", "JSON", "GEOGRAPHY", "INTERVAL",
  ],
  Redshift: [
    "SMALLINT", "INTEGER", "BIGINT", "DECIMAL", "REAL", "DOUBLE PRECISION", "BOOLEAN",
    "CHAR", "VARCHAR",
    "DATE", "TIMESTAMP", "TIMESTAMPTZ",
    "GEOMETRY", "HLLSKETCH", "SUPER",
  ],
  "Azure SQL": [
    "TINYINT", "SMALLINT", "INT", "BIGINT",
    "DECIMAL", "NUMERIC", "FLOAT", "REAL", "MONEY", "BIT",
    "CHAR", "VARCHAR", "VARCHAR(MAX)", "NCHAR", "NVARCHAR", "NVARCHAR(MAX)",
    "DATE", "DATETIME", "DATETIME2", "DATETIMEOFFSET", "TIME",
    "BINARY", "VARBINARY", "VARBINARY(MAX)",
    "XML", "UNIQUEIDENTIFIER", "JSON",
  ],
  "Azure Synapse": [
    "TINYINT", "SMALLINT", "INT", "BIGINT",
    "DECIMAL", "NUMERIC", "FLOAT", "REAL", "MONEY", "BIT",
    "CHAR", "VARCHAR", "NCHAR", "NVARCHAR",
    "DATE", "DATETIME", "DATETIME2", "DATETIMEOFFSET", "TIME",
    "BINARY", "VARBINARY", "UNIQUEIDENTIFIER",
  ],
  Databricks: [
    "TINYINT", "SMALLINT", "INT", "BIGINT", "FLOAT", "DOUBLE", "DECIMAL", "BOOLEAN",
    "STRING", "BINARY",
    "DATE", "TIMESTAMP", "TIMESTAMP_NTZ",
    "ARRAY", "MAP", "STRUCT", "VARIANT",
  ],
  "SAP HANA": [
    "TINYINT", "SMALLINT", "INTEGER", "BIGINT",
    "DECIMAL", "SMALLDECIMAL", "REAL", "DOUBLE",
    "VARCHAR", "NVARCHAR", "CHAR", "NCHAR", "CLOB", "NCLOB", "BLOB",
    "DATE", "TIME", "SECONDDATE", "TIMESTAMP",
    "BOOLEAN", "VARBINARY",
  ],
  Teradata: [
    "BYTEINT", "SMALLINT", "INTEGER", "BIGINT",
    "DECIMAL", "NUMERIC", "FLOAT", "REAL", "DOUBLE PRECISION",
    "CHAR", "VARCHAR", "LONG VARCHAR", "CLOB",
    "DATE", "TIME", "TIMESTAMP",
    "BYTE", "VARBYTE", "BLOB",
  ],
  DB2: [
    "SMALLINT", "INTEGER", "BIGINT",
    "DECIMAL", "NUMERIC", "REAL", "DOUBLE", "DECFLOAT",
    "CHAR", "VARCHAR", "LONG VARCHAR", "CLOB", "GRAPHIC", "VARGRAPHIC", "DBCLOB",
    "DATE", "TIME", "TIMESTAMP",
    "BLOB", "BINARY", "VARBINARY", "XML",
  ],
  MongoDB: [
    "String", "Number", "Date", "Boolean",
    "ObjectId", "Array", "Object", "Binary",
    "Int32", "Int64", "Decimal128", "Double",
    "Timestamp", "UUID", "Null",
  ],
  Cassandra: [
    "ascii", "bigint", "blob", "boolean",
    "counter", "date", "decimal", "double", "float",
    "inet", "int", "list", "map", "set",
    "smallint", "text", "time", "timestamp", "timeuuid",
    "tinyint", "tuple", "uuid", "varchar", "varint",
  ],
  DynamoDB: [
    "String (S)", "Number (N)", "Binary (B)",
    "String Set (SS)", "Number Set (NS)", "Binary Set (BS)",
    "Map (M)", "List (L)", "Boolean (BOOL)", "Null (NULL)",
  ],
  Salesforce: [
    "Auto Number", "Checkbox", "Currency", "Date", "Date/Time",
    "Email", "Formula", "Geolocation", "Long Text Area",
    "Lookup", "Master-Detail", "Multi-Select Picklist",
    "Number", "Percent", "Phone", "Picklist",
    "Rich Text Area", "Roll-Up Summary", "Text", "Text Area",
    "URL",
  ],
  SAP: [
    "CHAR", "NUMC", "DATS", "TIMS",
    "INT4", "INT2", "INT1", "DEC", "FLTP",
    "CURR", "CUKY", "QUAN", "UNIT",
    "LRAW", "RAW", "STRING", "RAWSTRING",
    "CLNT", "LANG", "ACCP", "SSTRING", "PREC",
  ],
  "SAP S/4HANA": [
    "CHAR", "NUMC", "DATS", "TIMS",
    "INT4", "INT2", "INT1", "DEC", "FLTP",
    "CURR", "CUKY", "QUAN", "UNIT",
    "LRAW", "RAW", "STRING", "RAWSTRING",
    "CLNT", "LANG", "ACCP", "SSTRING",
  ],
  "SAP ECC": [
    "CHAR", "NUMC", "DATS", "TIMS",
    "INT4", "INT2", "INT1", "DEC", "FLTP",
    "CURR", "CUKY", "QUAN", "UNIT",
    "LRAW", "RAW", "STRING", "RAWSTRING",
    "CLNT", "LANG",
  ],
  Workday: [
    "Text", "Number", "Date", "Boolean",
    "Lookup", "Multi-Instance", "Integer", "Decimal", "Currency",
  ],
  ServiceNow: [
    "string", "integer", "boolean",
    "glide_date", "glide_date_time", "glide_duration",
    "float", "decimal", "currency2",
    "reference", "choice", "list",
    "url", "email", "phone_number",
    "journal", "journal_input", "translated_text",
    "sys_class_name", "guid",
  ],
  "Oracle EBS": [
    "VARCHAR2", "NVARCHAR2", "CHAR", "NUMBER",
    "DATE", "TIMESTAMP", "CLOB", "BLOB", "XMLTYPE",
  ],
  "Microsoft Dynamics": [
    "String", "Integer", "Decimal", "DateTime", "Boolean",
    "Lookup", "OptionSet", "MultiSelectOptionSet",
    "Money", "Memo", "UniqueIdentifier",
  ],
  NetSuite: [
    "Free-Form Text", "Integer Number", "Decimal Number",
    "Date", "Date/Time", "Check Box",
    "List/Record", "Multi-Select", "Email Address",
    "Phone Number", "URL", "Percent", "Currency",
    "Rich Text", "Long Text",
  ],
  Excel: [
    "General", "Number", "Currency", "Accounting",
    "Date", "Time", "Percentage", "Fraction",
    "Scientific", "Text", "Special", "Custom",
  ],
};

// Exported so EntityForm can call it without duplicating the logic.
export function resolveTypeOptions(sourceSystem: string | undefined | null): string[] {
  if (!sourceSystem || sourceSystem.trim() === "") return DEFAULT_TYPES;
  const dep = sourceSystem.trim().toLowerCase();
  const exactKey = Object.keys(TYPE_OPTIONS_BY_SOURCE).find(
    (k) => k.toLowerCase() === dep,
  );
  if (exactKey) return TYPE_OPTIONS_BY_SOURCE[exactKey];
  const partialKey = Object.keys(TYPE_OPTIONS_BY_SOURCE).find(
    (k) => dep.startsWith(k.toLowerCase()) || k.toLowerCase().startsWith(dep),
  );
  return partialKey ? TYPE_OPTIONS_BY_SOURCE[partialKey] : DEFAULT_TYPES;
}

export const engagementFields: FieldDef[] = [
  { name: "name", label: "Name", type: "text", required: true, full: true },
  { name: "client_org", label: "Client / Org", type: "text", full: true },
  { name: "notes", label: "Notes", type: "textarea", full: true },
];

export const valueStreamFields: FieldDef[] = [
  { name: "name", label: "Name", type: "text", required: true, full: true },
  { name: "scope_level", label: "Scope", type: "select", options: SCOPE_LEVELS },
  { name: "problem_statement", label: "Problem statement (entry point)", type: "textarea", full: true },
  { name: "narrative", label: "Narrative", type: "textarea", full: true },
];

export const personaFields: FieldDef[] = [
  { name: "name", label: "Name / Role", type: "text", required: true, full: true },
  { name: "role_title", label: "Role title", type: "text" },
  { name: "function", label: "Function / Dept", type: "text" },
  { name: "scope_level", label: "Scope", type: "select", options: SCOPE_LEVELS },
  { name: "responsibilities", label: "Responsibilities", type: "textarea", full: true },
  { name: "authority_notes", label: "Authority / decision rights", type: "textarea", full: true },
];

export const processStepFields: FieldDef[] = [
  { name: "name", label: "Step name", type: "text", required: true, full: true },
  { name: "sequence_index", label: "Sequence #", type: "number" },
  { name: "cycle_time", label: "Cycle time", type: "number" },
  { name: "wait_time", label: "Wait time", type: "number" },
  { name: "pct_complete_accurate", label: "% C&A", type: "number" },
  { name: "entry_criteria", label: "Entry criteria", type: "textarea", full: true },
  { name: "action", label: "Action", type: "textarea", full: true },
  { name: "exit_criteria", label: "Exit criteria", type: "textarea", full: true },
  {
    name: "pain_points",
    label: "Pain points",
    type: "textarea",
    full: true,
    maxLength: 5000,
    placeholder: "What hurts at this step? (up to 5000 characters)",
  },
  // Step-level data landscape.
  { name: "data_source_systems", label: "Source system(s)", type: "text", full: true, placeholder: "e.g. SAP, Data Warehouse, MES, hardcopy, spreadsheet" },
  { name: "data_databases", label: "Database(s)", type: "text", full: true, placeholder: "e.g. SAP ECC, EDW (Snowflake)" },
  { name: "data_tables", label: "Table(s)", type: "text", full: true, placeholder: "e.g. VBAP, MARA, fact_orders" },
  { name: "data_etl_jobs", label: "Related ETL jobs", type: "textarea", full: true, placeholder: "e.g. nightly SAP→EDW extract (job ODS_LOAD_ORDERS)" },
];

// Fields for a data_element definition (the shared field record).
export const dataElementFields: FieldDef[] = [
  { name: "name", label: "Data element (short name)", type: "text", required: true, full: true },
  { name: "business_description", label: "Business name / description", type: "textarea", full: true },
  {
    name: "source_system",
    label: "Source system",
    type: "combobox",
    comboOptions: SOURCE_SYSTEMS,
    placeholder: "e.g. Salesforce, MySQL, SAP…",
  },
  { name: "table_or_view", label: "Table / view", type: "text" },
  { name: "field_name", label: "Field name", type: "text" },
  {
    name: "data_type",
    label: "Type",
    type: "combobox",
    comboOptions: DEFAULT_TYPES,
    dependsOn: "source_system",
    placeholder: "e.g. VARCHAR, CHAR, TEXT…",
  },
  { name: "length", label: "Length", type: "text", placeholder: "e.g. 255, MAX, 14,2" },
  { name: "example_value", label: "Example value", type: "text" },
];

// Fields for a step_data_elements junction record (the step-specific usage).
export const stepDataElementFields: FieldDef[] = [
  { name: "binding_point", label: "Binding point (entry = source · action/exit = target)", type: "select", options: BINDING_POINTS, full: true },
  { name: "presence", label: "Presence", type: "select", options: PRESENCE },
  { name: "is_key", label: "Key data component", type: "boolean" },
  { name: "quality_notes", label: "Quality notes", type: "textarea", full: true },
];

export const metricFields: FieldDef[] = [
  { name: "name", label: "Metric", type: "text", required: true, full: true },
  { name: "metric_type", label: "Type", type: "select", options: METRIC_TYPES },
  { name: "unit", label: "Unit", type: "text" },
  { name: "is_leading", label: "Leading indicator", type: "boolean" },
  { name: "baseline_value", label: "Baseline", type: "number" },
  { name: "current_value", label: "Current", type: "number" },
  { name: "target_value", label: "Target", type: "number" },
  { name: "source", label: "Source", type: "text", full: true },
];

export const assumptionFields: FieldDef[] = [
  { name: "statement", label: "Assumption", type: "textarea", required: true, full: true },
  { name: "status", label: "Status", type: "select", options: ASSUMPTION_STATUSES },
  { name: "evidence", label: "Evidence", type: "textarea", full: true },
];
