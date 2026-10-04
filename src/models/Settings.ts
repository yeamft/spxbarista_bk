import mongoose, { Schema } from "mongoose";

const settingsSchema = new Schema(
  {
    key: { type: String, required: true, unique: true, trim: true, default: "system" },
    data: { type: Schema.Types.Mixed, required: true, default: {} },
  },
  { timestamps: true },
);

export const Settings = mongoose.model("Settings", settingsSchema);
