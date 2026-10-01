import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Load env from server/.env.local (preferred) or server/.env
dotenv.config({ path: path.resolve(__dirname, "../.env.local") });
dotenv.config({ path: path.resolve(__dirname, "../.env") });

function required(name: string, fallback?: string) {
  const value = process.env[name] ?? fallback;
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

const nodeEnv = process.env.NODE_ENV || "development";
const jwtSecret = required("JWT_SECRET", "dev-change-me-ethioplate-coffee");

if (nodeEnv === "production" && jwtSecret.startsWith("dev-")) {
  throw new Error("JWT_SECRET must be set to a strong secret in production");
}

export const config = {
  port: Number(process.env.API_PORT || process.env.PORT || 4000),
  mongoUri: required("MONGODB_URI", "mongodb://127.0.0.1:27017/ethioplate"),
  jwtSecret,
  corsOrigin: process.env.CORS_ORIGIN || "http://localhost:3000",
  nodeEnv,
  isProd: nodeEnv === "production",
};
