import { Router } from "express";
import { repos } from "../repositories/index";
import { testConnection, listSchemas, listTables, listColumns, previewRows } from "../lib/dbConnector";
import type { ColumnInfo } from "../lib/dbConnector";
import type { DataElement } from "@shared/schemas";

function buildDdl(schema: string, table: string, columns: ColumnInfo[]): string {
  const lines = columns.map((col) => {
    let def = `  "${col.column_name}" ${col.data_type}`;
    if (col.length) def += `(${col.length})`;
    if (!col.is_nullable) def += " NOT NULL";
    if (col.column_default !== null) def += ` DEFAULT ${col.column_default}`;
    return def;
  });
  return `CREATE TABLE "${schema}"."${table}" (\n${lines.join(",\n")}\n);`;
}

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

  // GET /api/db_connections/:id/schema/:schema/tables/:table/ddl — approximate CREATE TABLE DDL
  router.get("/:id/schema/:schema/tables/:table/ddl", async (req, res) => {
    try {
      const conn = repos.db_connections.get(req.params.id);
      if (!conn) { res.status(404).json({ error: "Connection not found" }); return; }
      const columns = await listColumns(conn, req.params.schema, req.params.table);
      const ddl = buildDdl(req.params.schema, req.params.table, columns);
      res.json({ ddl });
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });

  // GET /api/db_connections/:id/schema/:schema/tables/:table/preview — first 100 rows
  router.get("/:id/schema/:schema/tables/:table/preview", async (req, res) => {
    try {
      const conn = repos.db_connections.get(req.params.id);
      if (!conn) { res.status(404).json({ error: "Connection not found" }); return; }
      const result = await previewRows(conn, req.params.schema, req.params.table);
      res.json(result);
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });

  // POST /api/db_connections/:id/trash-cascade
  // Soft-deletes a connection, all its linked data elements, and their step bindings.
  // Returns counts so the client can display a confirmation summary.
  router.post("/:id/trash-cascade", (req, res) => {
    const conn = repos.db_connections.get(req.params.id);
    if (!conn) { res.status(404).json({ error: "Connection not found" }); return; }

    const des = repos.data_elements.list({ where: { db_connection_id: req.params.id } }) as DataElement[];
    let sdeCount = 0;

    for (const de of des) {
      const sdes = repos.step_data_elements.list({ where: { data_element_id: de.id } });
      for (const sde of sdes) {
        repos.step_data_elements.softDelete(sde.id);
        sdeCount++;
      }
      repos.data_elements.softDelete(de.id);
    }

    repos.db_connections.softDelete(req.params.id);
    res.json({ de_count: des.length, sde_count: sdeCount });
  });

  return router;
}
