import { Router } from "express";
import { z } from "zod";
import { Category } from "../models/Category.js";
import type { Server as SocketServer } from "socket.io";

function serialize(category: {
  _id: { toString(): string };
  name: string;
  active: boolean;
  sortOrder: number;
}) {
  return {
    id: String(category._id),
    name: category.name,
    active: category.active,
    sortOrder: category.sortOrder,
  };
}

export function createCategoriesRouter(io: SocketServer) {
  const router = Router();

  router.get("/", async (_req, res) => {
    const categories = await Category.find({ active: true }).sort({ sortOrder: 1, name: 1 }).lean();
    res.json({
      categories: categories.map((row) => ({
        id: String(row._id),
        name: row.name,
        active: row.active,
        sortOrder: row.sortOrder,
      })),
    });
  });

  router.post("/", async (req, res) => {
      const parsed = z.object({ name: z.string().trim().min(1) }).safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: "Invalid category" });
        return;
      }
      const name = parsed.data.name.trim().replace(/\s+/g, " ");
      const existing = await Category.findOne({ name: new RegExp(`^${name}$`, "i") });
      if (existing) {
        if (!existing.active) {
          existing.active = true;
          await existing.save();
          io.emit("categories:updated", { type: "reactivated", category: serialize(existing) });
          res.json({ category: serialize(existing) });
          return;
        }
        res.status(409).json({ error: "Category already exists" });
        return;
      }
      const count = await Category.countDocuments();
      const category = await Category.create({ name, sortOrder: count, active: true });
      io.emit("categories:updated", { type: "created", category: serialize(category) });
      res.status(201).json({ category: serialize(category) });
  });

  router.patch("/:id", async (req, res) => {
      const parsed = z
        .object({
          name: z.string().trim().min(1).optional(),
          active: z.boolean().optional(),
          sortOrder: z.number().optional(),
        })
        .safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: "Invalid category update" });
        return;
      }
      const category = await Category.findById(req.params.id);
      if (!category) {
        res.status(404).json({ error: "Category not found" });
        return;
      }
      if (parsed.data.name) category.name = parsed.data.name.trim().replace(/\s+/g, " ");
      if (parsed.data.active !== undefined) category.active = parsed.data.active;
      if (parsed.data.sortOrder !== undefined) category.sortOrder = parsed.data.sortOrder;
      await category.save();
      io.emit("categories:updated", { type: "updated", category: serialize(category) });
      res.json({ category: serialize(category) });
  });

  router.delete("/:id", async (req, res) => {
      const category = await Category.findById(req.params.id);
      if (!category) {
        res.status(404).json({ error: "Category not found" });
        return;
      }
      category.active = false;
      await category.save();
      io.emit("categories:updated", { type: "deleted", category: serialize(category) });
      res.json({ ok: true });
  });

  return router;
}
