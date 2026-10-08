import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { config } from "../config.js";
import { User, type UserDoc } from "../models/User.js";

export type AuthPayload = {
  sub: string;
  role: string;
  name: string;
};

export type AuthedRequest = Request & {
  user?: UserDoc;
  auth?: AuthPayload;
};

export function signToken(user: { _id: unknown; role: string; name: string }) {
  const payload: AuthPayload = {
    sub: String(user._id),
    role: user.role,
    name: user.name,
  };
  return jwt.sign(payload, config.jwtSecret, { expiresIn: "7d" });
}

const userCache = new Map<string, { user: UserDoc; at: number }>();
const AUTH_CACHE_MS = 20_000;

export function invalidateAuthCache(userId?: string) {
  if (userId) {
    userCache.delete(userId);
    return;
  }
  userCache.clear();
}

export async function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  try {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : "";
    if (!token) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const decoded = jwt.verify(token, config.jwtSecret) as AuthPayload;
    const cached = userCache.get(decoded.sub);
    const user =
      cached && Date.now() - cached.at < AUTH_CACHE_MS
        ? cached.user
        : await User.findById(decoded.sub);
    if (!user || !user.active) {
      userCache.delete(decoded.sub);
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    userCache.set(decoded.sub, { user, at: Date.now() });
    req.auth = decoded;
    req.user = user;
    next();
  } catch {
    res.status(401).json({ error: "Unauthorized" });
  }
}

export function requireRoles(...roles: string[]) {
  return (req: AuthedRequest, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    next();
  };
}
