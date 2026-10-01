import mongoose, { Schema, type InferSchemaType } from "mongoose";

const orderLineSchema = new Schema(
  {
    id: String,
    name: String,
    qty: Number,
    unitPrice: Number,
    station: String,
    note: String,
  },
  { _id: false },
);

const orderSchema = new Schema(
  {
    orderNo: { type: String, required: true, index: true },
    status: { type: String, default: "OPEN", index: true },
    paymentStatus: { type: String, default: "UNPAID", index: true },
    area: { type: String, default: "" },
    tableNumber: { type: String, default: "" },
    barista: { type: String, default: "" },
    cashier: { type: String, default: "" },
    branch: { type: String, default: "Main" },
    items: { type: [orderLineSchema], default: [] },
    subtotal: { type: Number, default: 0 },
    total: { type: Number, default: 0 },
    notes: { type: String, default: "" },
    raw: { type: Schema.Types.Mixed },
  },
  { timestamps: true },
);

export type OrderDoc = InferSchemaType<typeof orderSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const Order = mongoose.model("Order", orderSchema);
