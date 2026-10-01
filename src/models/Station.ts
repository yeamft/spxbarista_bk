import mongoose, { Schema, type InferSchemaType } from "mongoose";

const stationSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, unique: true },
    active: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true },
);

export type StationDoc = InferSchemaType<typeof stationSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const Station = mongoose.model("Station", stationSchema);
