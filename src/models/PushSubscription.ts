import mongoose, { Schema, type InferSchemaType } from "mongoose";

const pushSubscriptionSchema = new Schema(
  {
    endpoint: { type: String, required: true, unique: true, index: true },
    p256dh: { type: String, required: true },
    auth: { type: String, required: true },
    userId: { type: String, required: true, index: true },
    userName: { type: String, required: true, trim: true, index: true },
    userNameKey: { type: String, required: true, trim: true, lowercase: true, index: true },
    role: { type: String, required: true, index: true },
    userAgent: { type: String, default: "" },
  },
  { timestamps: true },
);

export type PushSubscriptionDoc = InferSchemaType<typeof pushSubscriptionSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const PushSubscription = mongoose.model("PushSubscription", pushSubscriptionSchema);
