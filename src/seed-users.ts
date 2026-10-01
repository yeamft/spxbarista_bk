/**
 * Seeds only coffee-office staff users into MongoDB.
 * Usage: npm run seed:users
 */
import dns from "node:dns";
import { connectMongo, disconnectMongo } from "./db.js";
import { hashPassword, User } from "./models/User.js";

// Hotspot / ISP DNS often fails mongodb+srv SRV lookups.
dns.setServers(["8.8.8.8", "1.1.1.1"]);

const COFFEE_OFFICE_USERS = [
  { username: "11", name: "Liya Demeke", role: "Administrator" as const, pin: "11", avatar: "LD" },
  { username: "12", name: "Sara Bekele", role: "Manager" as const, pin: "12", avatar: "SB" },
  { username: "21", name: "Amir", role: "Barista" as const, pin: "21", avatar: "AM" },
  { username: "22", name: "Alem", role: "Barista" as const, pin: "22", avatar: "AL" },
  { username: "31", name: "Genet Tilahun", role: "User" as const, pin: "31", avatar: "GT" },
  { username: "32", name: "Marta Yohannes", role: "User" as const, pin: "32", avatar: "MY" },
];

async function seedUsers() {
  await connectMongo();
  for (const row of COFFEE_OFFICE_USERS) {
    const passwordHash = await hashPassword(row.pin);
    const existing = await User.findOne({
      $or: [{ username: row.pin }, { pin: row.pin }],
    });
    if (existing) {
      existing.name = row.name;
      existing.role = row.role;
      existing.branch = "Main Office";
      existing.avatar = row.avatar;
      existing.username = row.pin;
      existing.pin = row.pin;
      existing.passwordHash = passwordHash;
      existing.active = true;
      await existing.save();
      console.log("[seed:users] updated", row.username, row.name, `PIN ${row.pin}`);
      continue;
    }
    await User.create({
      username: row.pin,
      pin: row.pin,
      name: row.name,
      role: row.role,
      branch: "Main Office",
      passwordHash,
      avatar: row.avatar,
      active: true,
    });
    console.log("[seed:users] created", row.username, row.name, `PIN ${row.pin}`);
  }
  await disconnectMongo();
  console.log("[seed:users] done");
}

seedUsers().catch(async (error) => {
  console.error(error);
  try {
    await disconnectMongo();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
