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

export function signToken(user: UserDoc) {
  const payload: AuthPayload = {
    sub: String(user._id),
    role: user.role,
    name: user.name,
  };
  return jwt.sign(payload, config.jwtSecret, { expiresIn: "7d" });
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
    const user = await User.findById(decoded.sub);
    if (!user || !user.active) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
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
