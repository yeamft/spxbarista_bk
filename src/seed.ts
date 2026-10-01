import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { connectMongo, disconnectMongo } from "./db.js";
import { hashPassword, User } from "./models/User.js";
import { Station } from "./models/Station.js";
import { MenuItem } from "./models/MenuItem.js";
import { Category } from "./models/Category.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

type Catalog = {
  stations: string[];
  categories: string[];
  menuItems: Array<{
    id: string;
    name_en: string;
    name_am: string;
    category: string;
    price: number;
    cost: number;
    station: string;
    emoji: string;
    unitLabel: string;
    available: boolean;
  }>;
};

function loadCatalog(): Catalog {
  const raw = readFileSync(join(__dirname, "data", "catalog.json"), "utf8");
  return JSON.parse(raw) as Catalog;
}

/** Demo staff — login PIN is stored as password hash (2-digit PINs match the web app). */
const COFFEE_OFFICE_USERS = [
  { username: "11", name: "Liya Demeke", role: "Administrator" as const, pin: "11", avatar: "LD" },
  { username: "12", name: "Sara Bekele", role: "Manager" as const, pin: "12", avatar: "SB" },
  { username: "21", name: "Amir", role: "Barista" as const, pin: "21", avatar: "AM" },
  { username: "22", name: "Alem", role: "Barista" as const, pin: "22", avatar: "AL" },
  { username: "31", name: "Genet Tilahun", role: "User" as const, pin: "31", avatar: "GT" },
  { username: "32", name: "Marta Yohannes", role: "User" as const, pin: "32", avatar: "MY" },
];

async function seedUsers() {
  for (const row of COFFEE_OFFICE_USERS) {
    const existing = await User.findOne({ username: row.username });
    if (existing) {
      existing.name = row.name;
      existing.role = row.role;
      existing.branch = "Main Office";
      existing.avatar = row.avatar;
      existing.username = row.pin;
      existing.pin = row.pin;
      existing.passwordHash = await hashPassword(row.pin);
      existing.active = true;
      await existing.save();
      console.log("[seed] updated", row.username, row.name, `PIN ${row.pin}`);
      continue;
    }
    await User.create({
      username: row.pin,
      pin: row.pin,
      name: row.name,
      role: row.role,
      branch: "Main Office",
      passwordHash: await hashPassword(row.pin),
      avatar: row.avatar,
      active: true,
    });
    console.log("[seed] created", row.username, row.name, `PIN ${row.pin}`);
  }
}

async function seedStations(stations: string[]) {
  let upserts = 0;
  for (let i = 0; i < stations.length; i += 1) {
    const name = stations[i]!;
    await Station.findOneAndUpdate(
      { name },
      { name, active: true, sortOrder: i },
      { upsert: true, new: true },
    );
    upserts += 1;
  }
  console.log(`[seed] stations upserted: ${upserts}`);
}

async function seedCategories(categories: string[]) {
  let upserts = 0;
  for (let i = 0; i < categories.length; i += 1) {
    const name = categories[i]!;
    await Category.findOneAndUpdate(
      { name },
      { name, active: true, sortOrder: i },
      { upsert: true, new: true },
    );
    upserts += 1;
  }
  console.log(`[seed] categories upserted: ${upserts}`);
}

async function seedMenu(items: Catalog["menuItems"]) {
  let upserts = 0;
  for (const item of items) {
    await MenuItem.findOneAndUpdate(
      { itemId: item.id },
      {
        itemId: item.id,
        name_en: item.name_en,
        name_am: item.name_am,
        category: item.category,
        price: item.price,
        cost: item.cost,
        station: item.station,
        emoji: item.emoji,
        unitLabel: item.unitLabel,
        available: item.available !== false,
        active: true,
      },
      { upsert: true, new: true },
    );
    upserts += 1;
  }
  console.log(`[seed] menu items upserted: ${upserts}`);
}

async function seed() {
  await connectMongo();
  const catalog = loadCatalog();
  await seedUsers();
  await seedStations(catalog.stations);
  await seedCategories(catalog.categories ?? []);
  await seedMenu(catalog.menuItems);
  await disconnectMongo();
  console.log("[seed] done");
}

seed().catch(async (error) => {
  console.error(error);
  await disconnectMongo().catch(() => undefined);
  process.exit(1);
});
