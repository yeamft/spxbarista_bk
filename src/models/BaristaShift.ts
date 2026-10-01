import mongoose, { Schema, type InferSchemaType } from "mongoose";

const baristaShiftSchema = new Schema(
  {
    baristaId: { type: String, required: true, unique: true, index: true },
    baristaName: { type: String, required: true, trim: true },
    status: {
      type: String,
      enum: ["clocked_in", "clocked_out"],
      default: "clocked_out",
      index: true,
    },
    clockedInAt: { type: String },
    clockedOutAt: { type: String },
    updatedAtIso: { type: String, required: true },
  },
  { timestamps: true },
);

export type BaristaShiftDoc = InferSchemaType<typeof baristaShiftSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const BaristaShift = mongoose.model("BaristaShift", baristaShiftSchema);

export function toBaristaShiftDto(doc: BaristaShiftDoc) {
  return {
    id: doc.baristaId,
    baristaId: doc.baristaId,
    baristaName: doc.baristaName,
    status: doc.status as "clocked_in" | "clocked_out",
    clockedInAt: doc.clockedInAt || undefined,
    clockedOutAt: doc.clockedOutAt || undefined,
    updatedAt: doc.updatedAtIso,
  };
}
