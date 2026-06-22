-- Track which client IP addresses have accepted the User Agreement.
CREATE TABLE accepted_agreements (
  ip          TEXT PRIMARY KEY NOT NULL,
  user_agent  TEXT,
  accepted_at TEXT NOT NULL
);
