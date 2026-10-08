import mongoose from "mongoose";
import dns from "node:dns";
import { config } from "./config.js";

// Avoid querySrv ECONNREFUSED on networks that break MongoDB Atlas SRV DNS.
dns.setServers(["8.8.8.8", "1.1.1.1"]);

export async function connectMongo() {
  mongoose.set("strictQuery", true);
  mongoose.set("autoIndex", true);

  await mongoose.connect(config.mongoUri, {
    maxPoolSize: 50,
    minPoolSize: 5,
    maxIdleTimeMS: 30_000,
    serverSelectionTimeoutMS: 20_000,
    socketTimeoutMS: 45_000,
    retryWrites: true,
  });

  mongoose.connection.on("disconnected", () => {
    console.warn("[mongo] disconnected — waiting to reconnect");
  });
  mongoose.connection.on("reconnected", () => {
    console.log("[mongo] reconnected");
  });
  mongoose.connection.on("error", (error) => {
    console.error("[mongo] connection error", error);
  });

  console.log(`[mongo] connected → ${config.mongoUri.replace(/\/\/.*@/, "//***@")}`);
}

export async function disconnectMongo() {
  await mongoose.disconnect();
}
