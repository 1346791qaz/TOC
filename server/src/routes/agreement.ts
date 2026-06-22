import { Router } from "express";
import type { Request } from "express";
import { getDb } from "../db/connection";

function getClientIp(req: Request): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (forwarded) {
    const first = Array.isArray(forwarded) ? forwarded[0] : forwarded.split(",")[0];
    return first.trim();
  }
  return req.socket.remoteAddress ?? "unknown";
}

export function agreementRouter(): Router {
  const router = Router();

  router.get("/status", (req, res) => {
    const ip = getClientIp(req);
    const row = getDb().prepare("SELECT 1 FROM accepted_agreements WHERE ip = ?").get(ip);
    res.json({ accepted: !!row });
  });

  router.post("/accept", (req, res) => {
    const ip = getClientIp(req);
    const userAgent = (req.headers["user-agent"] as string) ?? null;
    getDb()
      .prepare(
        "INSERT OR REPLACE INTO accepted_agreements (ip, user_agent, accepted_at) VALUES (?, ?, ?)",
      )
      .run(ip, userAgent, new Date().toISOString());
    res.json({ ok: true });
  });

  return router;
}
