import { Router } from "express";
import { z } from "zod";
import {
  hashPassword,
  isValidStaffPin,
  mapAppRoleToMongo,
  toPublicUser,
  User,
} from "../models/User.js";
import { requireAuth, requireRoles, type AuthedRequest } from "../middleware/auth.js";

export const staffRouter = Router();

const MANAGE_ROLES = ["Administrator", "Manager", "Branch Manager"] as const;

function avatarFromName(name: string) {
  return name
    .split(/\s+/)
    .map((part) => part[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

staffRouter.get(
  "/",
  requireAuth,
  requireRoles("Administrator", "Manager", "Branch Manager", "Supervisor"),
  async (_req, res) => {
    const users = await User.find({ active: true })
      .select("-passwordHash")
      .sort({ name: 1 })
      .lean();
    res.json({
      users: users.map((user) => toPublicUser(user)),
    });
  },
);

staffRouter.get("/me", requireAuth, async (req: AuthedRequest, res) => {
  const user = req.user!;
  res.json({
    id: String(user._id),
    email: user.email,
    username: user.username,
    name: user.name,
    role: user.role,
    branch: user.branch,
    avatar: user.avatar,
  });
});

const updateStaffSchema = z.object({
  name: z.string().trim().min(1),
  role: z.string().optional(),
  branch: z.string().optional(),
  pin: z.string().trim().regex(/^\d{2}$|^\d{4}$/, "PIN must be 2 or 4 digits").optional(),
});

staffRouter.patch(
  "/:id",
  requireAuth,
  requireRoles(...MANAGE_ROLES),
  async (req: AuthedRequest, res) => {
    const parsed = updateStaffSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: parsed.error.issues[0]?.message || "Invalid update payload",
      });
      return;
    }

    const user = await User.findById(req.params.id);
    if (!user || !user.active) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const { name, branch } = parsed.data;
    const nextPin = parsed.data.pin?.trim();
    const nextRole = parsed.data.role
      ? mapAppRoleToMongo(parsed.data.role)
      : user.role;

    if (nextPin && nextPin !== user.pin && nextPin !== user.username) {
      if (!isValidStaffPin(nextPin)) {
        res.status(400).json({ error: "PIN must be 2 or 4 digits" });
        return;
      }
      const taken = await User.findOne({
        _id: { $ne: user._id },
        $or: [{ pin: nextPin }, { username: nextPin }],
      });
      if (taken) {
        res.status(409).json({ error: "That PIN is already in use" });
        return;
      }
      user.pin = nextPin;
      user.username = nextPin;
      user.passwordHash = await hashPassword(nextPin);
    }

    user.name = name;
    user.role = nextRole;
    if (branch !== undefined) {
      user.branch = branch.trim() || "Main Office";
    }
    user.avatar = avatarFromName(name);

    try {
      await user.save();
      res.json(toPublicUser(user));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not update user";
      if (/duplicate|E11000/i.test(message)) {
        res.status(409).json({ error: "That PIN is already in use" });
        return;
      }
      res.status(400).json({ error: message });
    }
  },
);

staffRouter.delete(
  "/:id",
  requireAuth,
  requireRoles(...MANAGE_ROLES),
  async (req: AuthedRequest, res) => {
    if (String(req.user?._id) === String(req.params.id)) {
      res.status(400).json({ error: "You cannot remove your own account." });
      return;
    }

    const user = await User.findById(req.params.id);
    if (!user || !user.active) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const managerLike = ["Administrator", "Manager", "Branch Manager", "Supervisor"];
    if (managerLike.includes(user.role)) {
      const remaining = await User.countDocuments({
        _id: { $ne: user._id },
        active: true,
        role: { $in: managerLike },
      });
      if (remaining < 1) {
        res.status(400).json({ error: "At least one admin or manager account is required." });
        return;
      }
    }

    user.active = false;
    await user.save();
    res.json({ ok: true, id: String(user._id) });
  },
);
