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
const isProd = nodeEnv === "production";

const jwtSecret = isProd
  ? required("JWT_SECRET")
  : required("JWT_SECRET", "dev-change-me-ethioplate-coffee");

if (
  isProd &&
  (jwtSecret.startsWith("dev-") ||
    jwtSecret === "dev-change-me-ethioplate-coffee" ||
    jwtSecret.length < 24)
) {
  throw new Error(
    "JWT_SECRET must be a strong secret in production (min 24 chars, not a dev-* value). " +
      "Set it in Render → Environment → JWT_SECRET, then redeploy.",
  );
}

export const config = {
  port: Number(process.env.API_PORT || process.env.PORT || 4000),
  mongoUri: required("MONGODB_URI", "mongodb://127.0.0.1:27017/ethioplate"),
  jwtSecret,
  corsOrigin: process.env.CORS_ORIGIN || "http://localhost:3000",
  nodeEnv,
  isProd,
};
