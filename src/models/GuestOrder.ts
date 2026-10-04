import mongoose, { Schema, type InferSchemaType } from "mongoose";

const guestLineSchema = new Schema(
  {
    itemId: { type: String, required: true },
    name_en: { type: String, default: "" },
    name_am: { type: String, default: "" },
    qty: { type: Number, required: true },
    station: { type: String, default: "Coffee Station Pickup" },
    unitLabel: { type: String, default: "Cup" },
    unitPrice: { type: Number, default: 0 },
    emoji: { type: String, default: "" },
    category: { type: String, default: "" },
  },
  { _id: false },
);

const guestOrderSchema = new Schema(
  {
    requestId: { type: String, required: true, unique: true, index: true },
    area: { type: String, default: "" },
    tableNumber: { type: String, default: "" },
    waiter: { type: String, default: "Guest" },
    status: {
      type: String,
      default: "SENT_TO_WAITER",
      index: true,
    },
    note: { type: String, default: "" },
    createdAtIso: { type: String, required: true, index: true },
    total: { type: Number, default: 0 },
    items: { type: [guestLineSchema], default: [] },
    orderId: { type: String, default: "" },
    orderNo: { type: String, default: "" },
    raw: { type: Schema.Types.Mixed },
  },
  { timestamps: true },
);

export type GuestOrderDoc = InferSchemaType<typeof guestOrderSchema> & {
  _id: mongoose.Types.ObjectId;
};

export function toGuestOrderDto(doc: {
  _id: { toString(): string };
  requestId: string;
  area?: string | null;
  tableNumber?: string | null;
  waiter?: string | null;
  status?: string | null;
  note?: string | null;
  createdAtIso: string;
  total?: number | null;
  items?: Array<{
    itemId: string;
    name_en?: string;
    name_am?: string;
    qty: number;
    station?: string;
    unitLabel?: string;
    unitPrice?: number;
    emoji?: string;
    category?: string;
  }>;
  orderId?: string | null;
  orderNo?: string | null;
  raw?: unknown;
}) {
  return {
    id: doc.requestId,
    tableNumber: doc.tableNumber || doc.area || "",
    area: doc.area || "",
    waiter: doc.waiter || "Guest",
    status: doc.status || "SENT_TO_WAITER",
    note: doc.note || "",
    createdAt: doc.createdAtIso,
    total: doc.total ?? 0,
    orderId: doc.orderId || "",
    orderNo: doc.orderNo || "",
    items: (doc.items || []).map((line) => ({
      item: {
        id: line.itemId,
        name_en: line.name_en || "",
        name_am: line.name_am || "",
        category: line.category || "",
        price: line.unitPrice ?? 0,
        cost: 0,
        station: line.station || "Coffee Station Pickup",
        emoji: line.emoji || "",
        unitLabel: line.unitLabel || "Cup",
        available: true,
      },
      qty: line.qty,
    })),
  };
}

export const GuestOrder = mongoose.model("GuestOrder", guestOrderSchema);
