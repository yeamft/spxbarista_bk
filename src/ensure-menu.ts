import { Category } from "./models/Category.js";
import { MenuItem } from "./models/MenuItem.js";
import { Station } from "./models/Station.js";

const STATION = "Coffee Station Pickup";

const OFFICE_STATIONS = [
  "Meeting Room 1",
  "Meeting Room 2",
  "Mr Omar Office",
  "Pool Office",
  "Mr Nebil Office",
  "Mr Tariq Office",
  "IT Office",
  "Finance Office",
] as const;

const ALL_STATIONS = [STATION, ...OFFICE_STATIONS] as const;

const CATEGORIES = ["Coffee", "Tea"] as const;

const MENU = [
  { id: "espresso", name_en: "Espresso", name_am: "ኤስፕሬሶ", category: "Coffee", price: 80, emoji: "E", unitLabel: "Cup" },
  { id: "double-espresso", name_en: "Double Espresso", name_am: "ድርብ ኤስፕሬሶ", category: "Coffee", price: 100, emoji: "DE", unitLabel: "Cup" },
  { id: "americano", name_en: "Americano", name_am: "አሜሪካኖ", category: "Coffee", price: 100, emoji: "A", unitLabel: "Cup" },
  { id: "latte", name_en: "Latte", name_am: "ላቴ", category: "Coffee", price: 130, emoji: "L", unitLabel: "Cup" },
  { id: "macchiato", name_en: "Macchiato", name_am: "ማኪያቶ", category: "Coffee", price: 95, emoji: "M", unitLabel: "Cup" },
  { id: "double-macchiato", name_en: "Double Macchiato", name_am: "ድርብ ማኪያቶ", category: "Coffee", price: 115, emoji: "DM", unitLabel: "Cup" },
  { id: "french-press", name_en: "French Press", name_am: "ፍሬንች ፕሬስ", category: "Coffee", price: 110, emoji: "FP", unitLabel: "Pot" },
  { id: "french-press-small", name_en: "French Press Small", name_am: "ፍሬንች ፕሬስ ትንሽ", category: "Coffee", price: 110, emoji: "FS", unitLabel: "Small" },
  { id: "french-press-big", name_en: "French Press Big", name_am: "ፍሬንች ፕሬስ ትልቅ", category: "Coffee", price: 150, emoji: "FB", unitLabel: "Big" },
  { id: "v60", name_en: "V60", name_am: "ቪ60", category: "Coffee", price: 120, emoji: "V", unitLabel: "Cup" },
  { id: "chmix", name_en: "Chmix", name_am: "ችሚክስ", category: "Coffee", price: 120, emoji: "C", unitLabel: "Cup" },
  { id: "tea", name_en: "Tea", name_am: "ሻይ", category: "Tea", price: 60, emoji: "T", unitLabel: "Cup" },
] as const;

/** Seed office delivery points and hide leftover restaurant stations. */
export async function ensureCoffeeStations() {
  for (let i = 0; i < ALL_STATIONS.length; i += 1) {
    const name = ALL_STATIONS[i]!;
    await Station.findOneAndUpdate(
      { name },
      { name, active: true, sortOrder: i },
      { upsert: true, new: true },
    );
  }
  const hidden = await Station.updateMany(
    { name: { $nin: [...ALL_STATIONS] } },
    { active: false },
  );
  console.log(
    `[api] stations ready ${ALL_STATIONS.length}` +
      (hidden.modifiedCount ? `, hid ${hidden.modifiedCount} extra stations` : ""),
  );
}

/** Keep Mongo menu limited to the coffee-office drinks list. */
export async function ensureCoffeeMenu() {
  const keepIds = MENU.map((row) => row.id);

  for (let i = 0; i < CATEGORIES.length; i += 1) {
    const name = CATEGORIES[i]!;
    await Category.findOneAndUpdate(
      { name },
      { name, active: true, sortOrder: i },
      { upsert: true, new: true },
    );
  }
  await Category.updateMany({ name: { $nin: [...CATEGORIES] } }, { active: false });

  for (const row of MENU) {
    await MenuItem.findOneAndUpdate(
      { itemId: row.id },
      {
        itemId: row.id,
        name_en: row.name_en,
        name_am: row.name_am,
        category: row.category,
        price: row.price,
        cost: 0,
        station: STATION,
        emoji: row.emoji,
        unitLabel: row.unitLabel,
        available: true,
        active: true,
      },
      { upsert: true, new: true },
    );
  }

  const hidden = await MenuItem.updateMany(
    { itemId: { $nin: keepIds } },
    { active: false, available: false },
  );
  console.log(
    `[api] menu ready ${MENU.length} drinks` +
      (hidden.modifiedCount ? `, hid ${hidden.modifiedCount} extra items` : ""),
  );
}
