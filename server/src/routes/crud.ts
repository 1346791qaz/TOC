import { Router, type Request, type Response } from "express";
import { ZodError } from "zod";
import type { EntityKey } from "@shared/schemas";
import { repoFor } from "../repositories";

function sendError(res: Response, err: unknown): void {
  if (err instanceof ZodError) {
    res.status(400).json({ error: "validation_error", issues: err.issues });
    return;
  }
  const message = err instanceof Error ? err.message : "unknown error";
  // Foreign-key / constraint violations from SQLite surface here.
  res.status(400).json({ error: "request_failed", message });
}

/** Build a REST router exposing soft-delete-aware CRUD for one entity. */
export function crudRouter(key: EntityKey): Router {
  const router = Router();
  const repo = repoFor(key);

  // Equality filters come from the query string (e.g. ?value_stream_id=...).
  const parseWhere = (req: Request): Record<string, string> => {
    const where: Record<string, string> = {};
    for (const [k, v] of Object.entries(req.query)) {
      if (k === "trashed" || k === "orderBy") continue;
      if (typeof v === "string") where[k] = v;
    }
    return where;
  };

  router.get("/", (req, res) => {
    try {
      const where = parseWhere(req);
      res.json(
        repo.list({
          where: Object.keys(where).length ? where : undefined,
          trashed: req.query.trashed === "true",
          orderBy: typeof req.query.orderBy === "string" ? req.query.orderBy : undefined,
        }),
      );
    } catch (err) {
      sendError(res, err);
    }
  });

  router.get("/:id", (req, res) => {
    const row = repo.get(req.params.id, { includeDeleted: req.query.includeDeleted === "true" });
    if (!row) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    res.json(row);
  });

  router.post("/", (req, res) => {
    try {
      res.status(201).json(repo.create(req.body));
    } catch (err) {
      sendError(res, err);
    }
  });

  router.patch("/:id", (req, res) => {
    try {
      const updated = repo.update(req.params.id, req.body);
      if (!updated) {
        res.status(404).json({ error: "not_found" });
        return;
      }
      res.json(updated);
    } catch (err) {
      sendError(res, err);
    }
  });

  // Soft delete only — there is no hard-delete endpoint by design.
  router.delete("/:id", (req, res) => {
    const ok = repo.softDelete(req.params.id);
    if (!ok) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    res.status(204).end();
  });

  router.post("/:id/restore", (req, res) => {
    const ok = repo.restore(req.params.id);
    if (!ok) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    res.json(repo.get(req.params.id));
  });

  return router;
}
