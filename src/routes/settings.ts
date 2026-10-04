import { Router } from "express";
import { z } from "zod";
import { Settings } from "../models/Settings.js";
import { requireAuth, requireRoles, type AuthedRequest } from "../middleware/auth.js";

export const settingsRouter = Router();

const SYSTEM_KEY = "system";

settingsRouter.get("/", requireAuth, async (_req: AuthedRequest, res) => {
  const doc = await Settings.findOne({ key: SYSTEM_KEY }).lean();
  res.json({
    key: SYSTEM_KEY,
    data: doc?.data ?? {},
    updatedAt: doc?.updatedAt ?? null,
  });
});

settingsRouter.put(
  "/",
  requireAuth,
  requireRoles("Administrator", "Manager", "Branch Manager", "Supervisor"),
  async (req: AuthedRequest, res) => {
    const parsed = z.object({ data: z.unknown() }).safeParse(req.body);
    if (!parsed.success || !parsed.data.data || typeof parsed.data.data !== "object") {
      res.status(400).json({ error: "Invalid settings payload" });
      return;
    }

    const doc = await Settings.findOneAndUpdate(
      { key: SYSTEM_KEY },
      { key: SYSTEM_KEY, data: parsed.data.data },
      { upsert: true, new: true },
    );
    res.json({ key: SYSTEM_KEY, data: doc.data, updatedAt: doc.updatedAt });
  },
);
