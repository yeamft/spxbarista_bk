import { Router } from "express";
import { z } from "zod";
import { MenuItem } from "../models/MenuItem.js";
import { requireAuth, requireRoles, type AuthedRequest } from "../middleware/auth.js";
import type { Server as SocketServer } from "socket.io";

function serialize(item: {
  _id: { toString(): string };
  itemId: string;
  name_en: string;
  name_am: string;
  category: string;
  price: number;
  cost: number;
  station: string;
  emoji: string;
  unitLabel: string;
  available: boolean;
  active: boolean;
}) {
  return {
    id: item.itemId,
    mongoId: String(item._id),
    name_en: item.name_en,
    name_am: item.name_am,
    category: item.category,
    price: item.price,
    cost: item.cost,
    station: item.station,
    emoji: item.emoji,
    unitLabel: item.unitLabel,
    available: item.available,
    active: item.active,
  };
}

const MANAGER_ROLES = ["Administrator", "Manager", "Branch Manager", "Supervisor"] as const;

export function createMenuRouter(io: SocketServer) {
  const router = Router();

  router.get("/", async (_req, res) => {
    const items = await MenuItem.find({ active: true }).sort({ category: 1, name_en: 1 }).lean();
    res.json({
      items: items.map((row) =>
        serialize({
          ...row,
          _id: row._id,
        }),
      ),
    });
  });

  // Soft auth: coffee office uses password-only demo login (no JWT).
  router.patch("/:itemId/availability", async (req, res) => {
    const parsed = z.object({ available: z.boolean() }).safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid availability payload" });
      return;
    }

    const item = await MenuItem.findOne({ itemId: req.params.itemId, active: true });
    if (!item) {
      // Item may only exist in the local catalog — treat as soft success.
      res.json({
        item: {
          id: req.params.itemId,
          available: parsed.data.available,
          soft: true,
        },
      });
      return;
    }
    item.available = parsed.data.available;
    await item.save();
    const payload = serialize(item);
    io.emit("menu:updated", { type: "availability", item: payload });
    res.json({ item: payload });
  });

  router.post(
    "/",
    requireAuth,
    requireRoles(...MANAGER_ROLES),
    async (req: AuthedRequest, res) => {
      const parsed = z
        .object({
          id: z.string().trim().min(1),
          name_en: z.string().trim().min(1),
          name_am: z.string().optional(),
          category: z.string().trim().min(1),
          price: z.number().optional(),
          cost: z.number().optional(),
          station: z.string().optional(),
          emoji: z.string().optional(),
          unitLabel: z.string().optional(),
          available: z.boolean().optional(),
        })
        .safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: "Invalid menu item" });
        return;
      }
      const data = parsed.data;
      const item = await MenuItem.findOneAndUpdate(
        { itemId: data.id },
        {
          itemId: data.id,
          name_en: data.name_en,
          name_am: data.name_am ?? "",
          category: data.category,
          price: data.price ?? 0,
          cost: data.cost ?? 0,
          station: data.station || "Coffee Station Pickup",
          emoji: data.emoji ?? "",
          unitLabel: data.unitLabel || "Cup",
          available: data.available !== false,
          active: true,
        },
        { upsert: true, new: true },
      );
      const payload = serialize(item);
      io.emit("menu:updated", { type: "upsert", item: payload });
      res.status(201).json({ item: payload });
    },
  );

  router.delete(
    "/:itemId",
    requireAuth,
    requireRoles(...MANAGER_ROLES),
    async (req: AuthedRequest, res) => {
      const item = await MenuItem.findOne({ itemId: req.params.itemId });
      if (!item) {
        res.status(404).json({ error: "Menu item not found" });
        return;
      }
      item.active = false;
      await item.save();
      io.emit("menu:updated", { type: "deleted", item: serialize(item) });
      res.json({ ok: true });
    },
  );

  return router;
}
