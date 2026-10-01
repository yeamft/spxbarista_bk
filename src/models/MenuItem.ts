import mongoose, { Schema, type InferSchemaType } from "mongoose";

const menuItemSchema = new Schema(
  {
    itemId: { type: String, required: true, unique: true, trim: true },
    name_en: { type: String, required: true, trim: true },
    name_am: { type: String, default: "", trim: true },
    category: { type: String, required: true, trim: true },
    price: { type: Number, default: 0 },
    cost: { type: Number, default: 0 },
    station: { type: String, default: "Coffee Station Pickup", trim: true },
    emoji: { type: String, default: "" },
    unitLabel: { type: String, default: "Cup" },
    available: { type: Boolean, default: true },
    active: { type: Boolean, default: true },
  },
  { timestamps: true },
);

export type MenuItemDoc = InferSchemaType<typeof menuItemSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const MenuItem = mongoose.model("MenuItem", menuItemSchema);
