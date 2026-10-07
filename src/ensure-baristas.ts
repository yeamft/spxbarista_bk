import bcrypt from "bcryptjs";
import { hashPassword, User } from "./models/User.js";

/** Demo barista PIN accounts the coffee office logs in with. */
const BARISTA_PIN_USERS = [
  { pin: "21", name: "Amir", avatar: "AM" },
  { pin: "22", name: "Alem", avatar: "AL" },
] as const;

/** Create or repair barista PIN rows so clock-in login keeps working in production. */
export async function ensureBaristaPinUsers() {
  for (const row of BARISTA_PIN_USERS) {
    const existing = await User.findOne({
      $or: [{ pin: row.pin }, { username: row.pin }],
    });
    if (existing) {
      existing.pin = row.pin;
      existing.username = row.pin;
      existing.role = "Barista";
      existing.active = true;
      if (!existing.name?.trim()) existing.name = row.name;
      if (!existing.avatar) existing.avatar = row.avatar;
      let hashOk = false;
      try {
        hashOk = Boolean(existing.passwordHash) && (await bcrypt.compare(row.pin, existing.passwordHash));
      } catch {
        hashOk = false;
      }
      if (!hashOk) existing.passwordHash = await hashPassword(row.pin);
      await existing.save();
      console.log("[api] barista ready", existing.name, `PIN ${row.pin}`);
      continue;
    }

    await User.create({
      username: row.pin,
      pin: row.pin,
      name: row.name,
      role: "Barista",
      branch: "Main Office",
      passwordHash: await hashPassword(row.pin),
      avatar: row.avatar,
      active: true,
    });
    console.log("[api] barista created", row.name, `PIN ${row.pin}`);
  }
}
