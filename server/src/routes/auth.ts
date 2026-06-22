import { Router } from "express";
import { createHash, timingSafeEqual } from "node:crypto";

// One-way hash of the access password. To change the password, set the
// VSME_PASSWORD environment variable before starting the server.
const ACCESS_HASH = createHash("sha256")
  .update(process.env.VSME_PASSWORD ?? "G0ldr@tt")
  .digest();

export function authRouter(): Router {
  const router = Router();

  router.post("/login", (req, res) => {
    const { password } = req.body as { password?: string };
    if (!password || typeof password !== "string") {
      res.status(400).json({ error: "password_required" });
      return;
    }
    const attempt = createHash("sha256").update(password).digest();
    // timingSafeEqual prevents timing-based attacks.
    if (attempt.length === ACCESS_HASH.length && timingSafeEqual(attempt, ACCESS_HASH)) {
      res.json({ ok: true });
    } else {
      res.status(401).json({ error: "invalid_password" });
    }
  });

  return router;
}
