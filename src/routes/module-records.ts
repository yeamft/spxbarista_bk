import { Router } from "express";
import { z } from "zod";
import { ModuleRecord } from "../models/ModuleRecord.js";
import { requireAuth, type AuthedRequest } from "../middleware/auth.js";

export const moduleRecordsRouter = Router();

moduleRecordsRouter.get("/:key", requireAuth, async (req: AuthedRequest, res) => {
  const moduleKey = String(req.params.key || "").trim();
  if (!moduleKey) {
    res.status(400).json({ error: "Module key is required" });
    return;
  }

  const rows = await ModuleRecord.find({ moduleKey, active: true })
    .sort({ position: 1, updatedAt: -1 })
    .lean();

  res.json({
    moduleKey,
    records: rows.map((row) => ({
      recordId: row.recordId,
      data: row.data,
      position: row.position,
      updatedAt: row.updatedAt,
    })),
  });
});

const upsertSchema = z.object({
  records: z.array(
    z.object({
      id: z.string().trim().min(1),
      data: z.unknown().optional(),
    }).passthrough(),
  ),
  removedIds: z.array(z.string().trim().min(1)).optional(),
});

moduleRecordsRouter.put("/:key", requireAuth, async (req: AuthedRequest, res) => {
  const moduleKey = String(req.params.key || "").trim();
  if (!moduleKey) {
    res.status(400).json({ error: "Module key is required" });
    return;
  }

  const parsed = upsertSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid module records payload" });
    return;
  }

  const records = parsed.data.records;
  const nextIds = records.map((row) => row.id);
  const removedIds = parsed.data.removedIds ?? [];

  const ops = records.map((record, position) => {
    const { id, ...rest } = record;
    const data = record.data && typeof record.data === "object" ? record.data : { id, ...rest };
    return {
      updateOne: {
        filter: { moduleKey, recordId: id },
        update: {
          $set: {
            moduleKey,
            recordId: id,
            data,
            position,
            active: true,
          },
        },
        upsert: true,
      },
    };
  });

  if (ops.length > 0) {
    await ModuleRecord.bulkWrite(ops, { ordered: false });
  }

  if (removedIds.length > 0) {
    await ModuleRecord.updateMany(
      { moduleKey, recordId: { $in: removedIds } },
      { $set: { active: false } },
    );
  } else if (records.length === 0) {
    await ModuleRecord.updateMany({ moduleKey }, { $set: { active: false } });
  } else {
    await ModuleRecord.updateMany(
      { moduleKey, recordId: { $nin: nextIds }, active: true },
      { $set: { active: false } },
    );
  }

  const rows = await ModuleRecord.find({ moduleKey, active: true })
    .sort({ position: 1, updatedAt: -1 })
    .lean();

  res.json({
    ok: true,
    moduleKey,
    records: rows.map((row) => ({
      recordId: row.recordId,
      data: row.data,
      position: row.position,
      updatedAt: row.updatedAt,
    })),
  });
});
