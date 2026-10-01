import { Router } from "express";
import { z } from "zod";
import { Station } from "../models/Station.js";
import { requireAuth, requireRoles, type AuthedRequest } from "../middleware/auth.js";
import type { Server as SocketServer } from "socket.io";

function serialize(station: {
  _id: { toString(): string };
  name: string;
  active: boolean;
  sortOrder: number;
}) {
  return {
    id: String(station._id),
    name: station.name,
    active: station.active,
    sortOrder: station.sortOrder,
  };
}

export function createStationsRouter(io: SocketServer) {
  const router = Router();

  router.get("/", async (_req, res) => {
    const stations = await Station.find({ active: true }).sort({ sortOrder: 1, name: 1 }).lean();
    res.json({
      stations: stations.map((row) => ({
        id: String(row._id),
        name: row.name,
        active: row.active,
        sortOrder: row.sortOrder,
      })),
    });
  });

  router.post(
    "/",
    requireAuth,
    requireRoles("Administrator", "Branch Manager", "Supervisor"),
    async (req: AuthedRequest, res) => {
      const parsed = z
        .object({
          name: z.string().trim().min(1),
          sortOrder: z.number().optional(),
        })
        .safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: "Invalid station" });
        return;
      }
      const name = parsed.data.name.trim().replace(/\s+/g, " ");
      const existing = await Station.findOne({ name: new RegExp(`^${name}$`, "i") });
      if (existing) {
        if (!existing.active) {
          existing.active = true;
          await existing.save();
          io.emit("stations:updated", { type: "reactivated", station: serialize(existing) });
          res.json({ station: serialize(existing) });
          return;
        }
        res.status(409).json({ error: "Station already exists" });
        return;
      }
      const count = await Station.countDocuments();
      const station = await Station.create({
        name,
        sortOrder: parsed.data.sortOrder ?? count,
        active: true,
      });
      io.emit("stations:updated", { type: "created", station: serialize(station) });
      res.status(201).json({ station: serialize(station) });
    },
  );

  router.patch(
    "/:id",
    requireAuth,
    requireRoles("Administrator", "Branch Manager", "Supervisor"),
    async (req: AuthedRequest, res) => {
      const parsed = z
        .object({
          name: z.string().trim().min(1).optional(),
          active: z.boolean().optional(),
          sortOrder: z.number().optional(),
        })
        .safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: "Invalid station update" });
        return;
      }
      const station = await Station.findById(req.params.id);
      if (!station) {
        res.status(404).json({ error: "Station not found" });
        return;
      }
      if (parsed.data.name) station.name = parsed.data.name.trim().replace(/\s+/g, " ");
      if (parsed.data.active !== undefined) station.active = parsed.data.active;
      if (parsed.data.sortOrder !== undefined) station.sortOrder = parsed.data.sortOrder;
      await station.save();
      io.emit("stations:updated", { type: "updated", station: serialize(station) });
      res.json({ station: serialize(station) });
    },
  );

  router.delete(
    "/:id",
    requireAuth,
    requireRoles("Administrator", "Branch Manager", "Supervisor"),
    async (req: AuthedRequest, res) => {
      const station = await Station.findById(req.params.id);
      if (!station) {
        res.status(404).json({ error: "Station not found" });
        return;
      }
      station.active = false;
      await station.save();
      io.emit("stations:updated", { type: "deleted", station: serialize(station) });
      res.json({ ok: true });
    },
  );

  return router;
}
