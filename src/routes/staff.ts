import { Router } from "express";
import { toPublicUser, User } from "../models/User.js";
import { requireAuth, requireRoles, type AuthedRequest } from "../middleware/auth.js";

export const staffRouter = Router();

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
