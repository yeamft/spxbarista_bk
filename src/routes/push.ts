import { Router } from "express";
import { z } from "zod";
import { requireAuth, type AuthedRequest } from "../middleware/auth.js";
import { PushSubscription } from "../models/PushSubscription.js";
import { getVapidPublicKey } from "../lib/web-push.js";

export function createPushRouter() {
  const router = Router();

  router.get("/vapid-public-key", (_req, res) => {
    const publicKey = getVapidPublicKey();
    if (!publicKey) {
      res.status(503).json({ error: "Push is not configured" });
      return;
    }
    res.json({ publicKey });
  });

  router.post("/subscribe", requireAuth, async (req: AuthedRequest, res) => {
    const parsed = z
      .object({
        endpoint: z.string().url(),
        keys: z.object({
          p256dh: z.string().min(1),
          auth: z.string().min(1),
        }),
      })
      .safeParse(req.body);
    if (!parsed.success || !req.user) {
      res.status(400).json({ error: "Invalid subscription" });
      return;
    }

    const userName = req.user.name.trim();
    const doc = await PushSubscription.findOneAndUpdate(
      { endpoint: parsed.data.endpoint },
      {
        endpoint: parsed.data.endpoint,
        p256dh: parsed.data.keys.p256dh,
        auth: parsed.data.keys.auth,
        userId: String(req.user._id),
        userName,
        userNameKey: userName.toLowerCase(),
        role: req.user.role,
        userAgent: String(req.headers["user-agent"] || "").slice(0, 300),
      },
      { upsert: true, new: true },
    );

    res.json({ ok: true, id: String(doc._id) });
  });

  router.delete("/subscribe", requireAuth, async (req: AuthedRequest, res) => {
    const endpoint = typeof req.body?.endpoint === "string" ? req.body.endpoint : "";
    if (endpoint) {
      await PushSubscription.deleteOne({ endpoint, userId: String(req.user?._id) });
    } else if (req.user) {
      await PushSubscription.deleteMany({ userId: String(req.user._id) });
    }
    res.json({ ok: true });
  });

  return router;
}
