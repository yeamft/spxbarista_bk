import mongoose from "mongoose";
import dns from "node:dns";
import { config } from "./config.js";

// Avoid querySrv ECONNREFUSED on networks that break MongoDB Atlas SRV DNS.
dns.setServers(["8.8.8.8", "1.1.1.1"]);

export async function connectMongo() {
  mongoose.set("strictQuery", true);
  await mongoose.connect(config.mongoUri, {
    serverSelectionTimeoutMS: 20000,
  });
  console.log(`[mongo] connected → ${config.mongoUri.replace(/\/\/.*@/, "//***@")}`);
}

export async function disconnectMongo() {
  await mongoose.disconnect();
}
