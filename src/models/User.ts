import bcrypt from "bcryptjs";
import mongoose, { Schema, type InferSchemaType } from "mongoose";

/** Roles accepted by the coffee-office API (includes legacy aliases). */
const STAFF_ROLES = [
  "Administrator",
  "Manager",
  "Branch Manager",
  "Supervisor",
  "Barista",
  "User",
  "Cashier",
  "Coffee House Staff",
  "Accountant",
  "Auditor",
] as const;

const PIN_RE = /^\d{2}$|^\d{4}$/;

const userSchema = new Schema(
  {
    email: { type: String, trim: true, lowercase: true, sparse: true, unique: true },
    /** Login handle — for coffee office this is the 2- or 4-digit PIN. */
    username: { type: String, trim: true, lowercase: true, sparse: true },
    /** Explicit unique PIN (same value as username for coffee office). */
    pin: {
      type: String,
      trim: true,
      sparse: true,
      validate: {
        validator: (value: string | null | undefined) => !value || PIN_RE.test(value),
        message: "PIN must be 2 or 4 digits",
      },
    },
    name: { type: String, required: true, trim: true },
    role: { type: String, enum: STAFF_ROLES, default: "User" },
    branch: { type: String, default: "Main Office" },
    passwordHash: { type: String, required: true },
    active: { type: Boolean, default: true },
    avatar: { type: String, default: "" },
  },
  { timestamps: true },
);

userSchema.methods.verifyPassword = async function verifyPassword(password: string) {
  return bcrypt.compare(password, this.passwordHash);
};

export type UserDoc = InferSchemaType<typeof userSchema> & {
  _id: mongoose.Types.ObjectId;
  verifyPassword?: (password: string) => Promise<boolean>;
};

export const User = mongoose.model("User", userSchema);

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 10);
}

export function isValidStaffPin(pin: string) {
  return PIN_RE.test(pin.trim());
}

export function mapAppRoleToMongo(role: string): (typeof STAFF_ROLES)[number] {
  if (role === "Administrator") return "Administrator";
  if (role === "Manager" || role === "Branch Manager" || role === "Supervisor") return role === "Manager" ? "Manager" : role;
  if (role === "Barista") return "Barista";
  if (role === "User" || role === "Cashier" || role === "Coffee House Staff") return "User";
  if (role === "Accountant") return "Accountant";
  if (role === "Auditor") return "Auditor";
  return "User";
}

export function mapMongoRoleToApp(role: string): string {
  if (role === "Coffee House Staff" || role === "Cashier") return "User";
  if (role === "Branch Manager" || role === "Supervisor") return "Manager";
  return role;
}

export function toPublicUser(user: {
  _id: mongoose.Types.ObjectId;
  email?: string | null;
  username?: string | null;
  pin?: string | null;
  name: string;
  role: string;
  branch: string;
  avatar?: string | null;
}) {
  const pin = user.pin || user.username || "";
  return {
    id: String(user._id),
    email: user.email || undefined,
    username: user.username || undefined,
    name: user.name,
    role: mapMongoRoleToApp(user.role),
    branch: user.branch || "Main Office",
    avatar: user.avatar || "",
    password: pin,
  };
}

export { STAFF_ROLES };
