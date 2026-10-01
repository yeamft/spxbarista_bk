import http from "node:http";
import cors from "cors";
import express from "express";
import { config } from "./config.js";
import { connectMongo } from "./db.js";
import { authRouter } from "./routes/auth.js";
import { createOrdersRouter } from "./routes/orders.js";
import { createStationsRouter } from "./routes/stations.js";
import { createMenuRouter } from "./routes/menu.js";
import { createCategoriesRouter } from "./routes/categories.js";
import { createBaristaRouter } from "./routes/barista.js";
import { staffRouter } from "./routes/staff.js";
import { createSocketServer } from "./socket.js";

async function main() {
  await connectMongo();

  const app = express();
  const server = http.createServer(app);
  const io = createSocketServer(server);

  app.set("trust proxy", 1);
  app.disable("x-powered-by");

  const allowedOrigins = config.corsOrigin
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  app.use(
    cors({
      origin(origin, callback) {
        if (!origin || allowedOrigins.includes(origin) || allowedOrigins.includes("*")) {
          callback(null, true);
          return;
        }
        callback(new Error(`CORS blocked for origin: ${origin}`));
      },
      credentials: true,
    }),
  );
  app.use(express.json({ limit: "2mb" }));

  app.get("/health", (_req, res) => {
    res.json({
      ok: true,
      service: "ethioplate-api",
      env: config.nodeEnv,
      time: new Date().toISOString(),
    });
  });

  app.use("/api/auth", authRouter);
  app.use("/api/staff", staffRouter);
  app.use("/api/barista", createBaristaRouter(io));
  app.use("/api/orders", createOrdersRouter(io));
  app.use("/api/stations", createStationsRouter(io));
  app.use("/api/menu", createMenuRouter(io));
  app.use("/api/categories", createCategoriesRouter(io));

  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error(err);
    const message = err instanceof Error ? err.message : "Internal server error";
    const status = /CORS blocked/i.test(message) ? 403 : 500;
    res.status(status).json({
      error: config.isProd && status === 500 ? "Internal server error" : message,
    });
  });

  server.listen(config.port, () => {
    console.log(`[api] Express listening on http://localhost:${config.port} (${config.nodeEnv})`);
    console.log(`[socket] Socket.IO ready on same port`);
  });
}

main().catch((error) => {
  console.error("[api] failed to start", error);
  process.exit(1);
});
