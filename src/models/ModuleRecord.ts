import mongoose, { Schema } from "mongoose";

const moduleRecordSchema = new Schema(
  {
    moduleKey: { type: String, required: true, trim: true, index: true },
    recordId: { type: String, required: true, trim: true },
    data: { type: Schema.Types.Mixed, required: true },
    position: { type: Number, default: 0 },
    active: { type: Boolean, default: true },
  },
  { timestamps: true },
);

moduleRecordSchema.index({ moduleKey: 1, recordId: 1 }, { unique: true });
moduleRecordSchema.index({ moduleKey: 1, active: 1, position: 1 });

export const ModuleRecord = mongoose.model("ModuleRecord", moduleRecordSchema);
