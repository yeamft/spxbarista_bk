import type { Server as HttpServer } from "node:http";
import jwt from "jsonwebtoken";
import { Server } from "socket.io";
import { config } from "./config.js";
import type { AuthPayload } from "./middleware/auth.js";

export type OrdersSocketEvent = {
  type: string;
  orderId?: string;
  orderNo?: string;
  message: string;
  actor?: string;
  at: string;
  meta?: Record<string, unknown>;
};

export type OrdersPatchEvent = {
  orderId: string;
  order: Record<string, unknown>;
  at: string;
  actor?: string;
};

export function createSocketServer(httpServer: HttpServer) {
  const allowlist = config.corsOrigin.split(",").map((value) => value.trim()).filter(Boolean);
  const io = new Server(httpServer, {
    cors: {
      origin(origin, callback) {
        if (!origin || allowlist.includes(origin) || allowlist.includes("*")) {
          callback(null, true);
          return;
        }
        if (
          !config.isProd &&
          /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin)
        ) {
          callback(null, true);
          return;
        }
        callback(new Error(`CORS blocked for origin: ${origin}`), false);
      },
      methods: ["GET", "POST", "PATCH", "DELETE"],
      credentials: true,
    },
    // Prefer websocket; polling fallback keeps mobile hotspots working.
    transports: ["websocket", "polling"],
    pingInterval: 20_000,
    pingTimeout: 25_000,
    connectionStateRecovery: {
      maxDisconnectionDuration: 2 * 60 * 1000,
      skipMiddlewares: true,
    },
    maxHttpBufferSize: 1e6,
  });

  io.use((socket, next) => {
    try {
      const token =
        (typeof socket.handshake.auth?.token === "string" && socket.handshake.auth.token) ||
        (typeof socket.handshake.query?.token === "string" && socket.handshake.query.token) ||
        "";
      if (!token) {
        // Allow anonymous read-only for guest digital menu; mark as guest.
        socket.data.auth = null;
        return next();
      }
      const decoded = jwt.verify(token, config.jwtSecret) as AuthPayload;
      socket.data.auth = decoded;
      return next();
    } catch {
      return next(new Error("Unauthorized socket"));
    }
  });

  io.on("connection", (socket) => {
    const auth = socket.data.auth as AuthPayload | null;
    if (auth?.sub) {
      void socket.join(`user:${auth.sub}`);
      if (auth.role) void socket.join(`role:${auth.role}`);
    }

    socket.emit("orders:event", {
      type: "sync",
      message: "Connected to coffee service realtime",
      at: new Date().toISOString(),
    } satisfies OrdersSocketEvent);

    // Clients must not forge order events — only authenticated staff can relay local UX hints.
    socket.on("orders:event", (payload: OrdersSocketEvent) => {
      if (!socket.data.auth) return;
      if (!payload?.type || !payload?.message) return;
      const event: OrdersSocketEvent = {
        ...payload,
        actor: payload.actor || socket.data.auth.name,
        at: payload.at || new Date().toISOString(),
      };
      socket.broadcast.emit("orders:event", event);
    });

    socket.on("join:branch", (branch: string) => {
      if (typeof branch === "string" && branch.trim()) {
        void socket.join(`branch:${branch.trim()}`);
      }
    });

    socket.on("barista:availability", (payload: unknown) => {
      // Availability mutations go through REST; ignore client forge attempts.
      if (!socket.data.auth) return;
      if (!payload || typeof payload !== "object") return;
    });
  });

  return io;
}
