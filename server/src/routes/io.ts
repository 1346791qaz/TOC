import { Router } from "express";
import { ZodError } from "zod";
import { exportEngagement, importEngagement } from "../io/portable";
import { importStructured, structuredImportRequestSchema } from "../io/structuredImport";

export function ioRouter(): Router {
  const router = Router();

  // Download an engagement as a portable, re-importable JSON bundle.
  router.get("/export/:engagementId", (req, res) => {
    try {
      const bundle = exportEngagement(req.params.engagementId);
      res
        .setHeader(
          "Content-Disposition",
          `attachment; filename="engagement-${req.params.engagementId}.json"`,
        )
        .json(bundle);
    } catch (err) {
      res.status(404).json({ error: "export_failed", message: (err as Error).message });
    }
  });

  router.post("/import", (req, res) => {
    try {
      res.json(importEngagement(req.body));
    } catch (err) {
      if (err instanceof ZodError) {
        res.status(400).json({ error: "invalid_bundle", issues: err.issues });
        return;
      }
      res.status(400).json({ error: "import_failed", message: (err as Error).message });
    }
  });

  // Structured CSV/JSON import for steps, personas, and data elements.
  router.post("/import-structured", (req, res) => {
    try {
      const { value_stream_id, kind, rows } = structuredImportRequestSchema.parse(req.body);
      res.json(importStructured(value_stream_id, kind, rows));
    } catch (err) {
      if (err instanceof ZodError) {
        res.status(400).json({ error: "validation_error", issues: err.issues });
        return;
      }
      res.status(400).json({ error: "import_failed", message: (err as Error).message });
    }
  });

  return router;
}
