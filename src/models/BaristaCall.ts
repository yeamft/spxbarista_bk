import mongoose, { Schema, type InferSchemaType } from "mongoose";

const baristaCallSchema = new Schema(
  {
    callId: { type: String, required: true, unique: true, index: true },
    requestedBy: { type: String, required: true, trim: true },
    requestedByRole: { type: String, default: "" },
    baristaName: { type: String, default: "" },
    location: { type: String, default: "Cafe" },
    note: { type: String, default: "" },
    status: {
      type: String,
      enum: ["open", "acknowledged", "done"],
      default: "open",
      index: true,
    },
    createdAtIso: { type: String, required: true },
    acknowledgedAt: { type: String },
    acknowledgedBy: { type: String },
  },
  { timestamps: true },
);

export type BaristaCallDoc = InferSchemaType<typeof baristaCallSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const BaristaCall = mongoose.model("BaristaCall", baristaCallSchema);

export function toBaristaCallDto(doc: BaristaCallDoc) {
  return {
    id: doc.callId,
    requestedBy: doc.requestedBy,
    requestedByRole: doc.requestedByRole || undefined,
    baristaName: doc.baristaName || "",
    location: doc.location || "Cafe",
    note: doc.note || "",
    status: doc.status as "open" | "acknowledged" | "done",
    createdAt: doc.createdAtIso,
    acknowledgedAt: doc.acknowledgedAt || undefined,
    acknowledgedBy: doc.acknowledgedBy || undefined,
  };
}
