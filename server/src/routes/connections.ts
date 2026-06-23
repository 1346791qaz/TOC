import { Router } from "express";
import { repos } from "../repositories/index";
import { testConnection, listSchemas, listTables, listColumns } from "../lib/dbConnector";

export function connectionsRouter(): Router {
  const router = Router();

  // POST /api/db_connections/:id/test — check connectivity and measure latency
  router.post("/:id/test", async (req, res) => {
    try {
      const conn = repos.db_connections.get(req.params.id);
      if (!conn) { res.status(404).json({ error: "Connection not found" }); return; }
      const result = await testConnection(conn);
      res.json(result);
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e) });
    }
  });

  // GET /api/db_connections/:id/schema — list schemas/databases visible to the credentials
  router.get("/:id/schema", async (req, res) => {
    try {
      const conn = repos.db_connections.get(req.params.id);
      if (!conn) { res.status(404).json({ error: "Connection not found" }); return; }
      const schemas = await listSchemas(conn);
      res.json(schemas);
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });

  // GET /api/db_connections/:id/schema/:schema/tables — list tables in a schema
  router.get("/:id/schema/:schema/tables", async (req, res) => {
    try {
      const conn = repos.db_connections.get(req.params.id);
      if (!conn) { res.status(404).json({ error: "Connection not found" }); return; }
      const tables = await listTables(conn, req.params.schema);
      res.json(tables);
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });

  // GET /api/db_connections/:id/schema/:schema/tables/:table/columns — list columns
  router.get("/:id/schema/:schema/tables/:table/columns", async (req, res) => {
    try {
      const conn = repos.db_connections.get(req.params.id);
      if (!conn) { res.status(404).json({ error: "Connection not found" }); return; }
      const columns = await listColumns(conn, req.params.schema, req.params.table);
      res.json(columns);
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });

  return router;
}
