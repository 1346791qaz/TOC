import express from "express";
import cors from "cors";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ENTITY_KEYS } from "@shared/schemas";
import { runMigrations } from "./db/migrate";
import { getDb } from "./db/connection";
import { crudRouter } from "./routes/crud";
import { analyticsRouter } from "./routes/analytics";
import { ioRouter } from "./routes/io";
import { agreementRouter } from "./routes/agreement";
import { authRouter } from "./routes/auth";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PORT = Number(process.env.PORT ?? 3001);

function buildApp() {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: "32mb" }));

  app.get("/api/health", (_req, res) => {
    const row = getDb().prepare("SELECT COUNT(*) AS n FROM _migrations").get() as { n: number };
    res.json({ status: "ok", migrations: row.n, time: new Date().toISOString() });
  });

  // Generic CRUD for every entity, mounted at /api/<entity>.
  for (const key of ENTITY_KEYS) {
    app.use(`/api/${key}`, crudRouter(key));
  }

  // Derived/analytical endpoints and portability.
  app.use("/api/analytics", analyticsRouter());
  app.use("/api/io", ioRouter());
  app.use("/api/agreement", agreementRouter());
  app.use("/api/auth", authRouter());

  // In production, serve the built frontend from dist/
  const distPath = path.resolve(__dirname, "../../dist");
  app.use(express.static(distPath));
  app.get("*", (_req, res) => {
    res.sendFile(path.join(distPath, "index.html"));
  });

  return app;
}

const applied = runMigrations();
if (applied.length) console.log(`[db] applied migrations: ${applied.join(", ")}`);

buildApp().listen(PORT, () => {
  console.log(`[oil] API listening on http://localhost:${PORT}`);
});

export { buildApp };
