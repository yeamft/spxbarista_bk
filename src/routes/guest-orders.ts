import { Router } from "express";
import { z } from "zod";
import type { Server as SocketServer } from "socket.io";
import { BaristaShift } from "../models/BaristaShift.js";
import { GuestOrder, toGuestOrderDto } from "../models/GuestOrder.js";
import { Order } from "../models/Order.js";
import { requireAuth, type AuthedRequest } from "../middleware/auth.js";
import type { OrdersPatchEvent, OrdersSocketEvent } from "../socket.js";

const lineSchema = z.object({
  id: z.string().trim().min(1),
  name_en: z.string().optional(),
  name_am: z.string().optional(),
  qty: z.number().positive(),
  station: z.string().optional(),
  unitLabel: z.string().optional(),
  price: z.number().optional(),
  emoji: z.string().optional(),
  category: z.string().optional(),
});

const createSchema = z.object({
  id: z.string().trim().min(1).optional(),
  area: z.string().trim().min(1),
  tableNumber: z.string().trim().optional(),
  note: z.string().optional(),
  /** Staff who unlocked the guest QR with their PIN. */
  requestedBy: z.string().trim().optional(),
  items: z.array(lineSchema).min(1),
});

function clockLabel() {
  return new Date().toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

async function anyBaristaOnDuty() {
  const count = await BaristaShift.countDocuments({ status: "clocked_in" });
  return count > 0;
}

function emitOrderRealtime(
  io: SocketServer,
  opts: {
    type: string;
    order: Record<string, unknown>;
    orderId: string;
    orderNo: string;
    message: string;
  },
) {
  const at = new Date().toISOString();
  const event: OrdersSocketEvent = {
    type: opts.type,
    orderId: opts.orderId,
    orderNo: opts.orderNo,
    message: opts.message,
    actor: "Guest",
    at,
  };
  const patch: OrdersPatchEvent = {
    orderId: opts.orderId,
    order: opts.order,
    at,
  };
  io.emit("orders:event", event);
  io.emit("orders:patch", patch);
}

export function createGuestOrdersRouter(io: SocketServer) {
  const router = Router();

  router.get("/", async (_req, res) => {
    const docs = await GuestOrder.find().sort({ createdAtIso: -1 }).limit(100).lean();
    res.json({
      requests: docs.map((doc) =>
        toGuestOrderDto({
          ...doc,
          _id: doc._id,
        }),
      ),
    });
  });

  router.post("/", async (req, res) => {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid guest order payload" });
      return;
    }

    if (!(await anyBaristaOnDuty())) {
      res.status(409).json({
        error: "Cafe is closed until a barista clocks in.",
        code: "NO_BARISTA",
      });
      return;
    }

    const area = parsed.data.area.trim();
    const tableNumber = (parsed.data.tableNumber || area).trim();
    const requestedBy = parsed.data.requestedBy?.trim() || "Guest";
    const requestId = parsed.data.id?.trim() || `guest-${Date.now()}`;
    const createdAtIso = new Date().toISOString();
    const sentAt = clockLabel();

    const lines = parsed.data.items.map((item, index) => {
      const qty = Math.max(1, Math.round(item.qty));
      const unitPrice = Number(item.price) || 0;
      const station = item.station?.trim() || "Coffee Station Pickup";
      return {
        id: `${requestId}-line-${index + 1}`,
        menuItemId: item.id,
        name: item.name_en || item.name_am || item.id,
        name_en: item.name_en || "",
        name_am: item.name_am || "",
        qty,
        unitPrice,
        station,
        note: "",
        unitLabel: item.unitLabel || "Cup",
        emoji: item.emoji || "",
        category: item.category || "",
      };
    });

    const total = lines.reduce((sum, line) => sum + line.unitPrice * line.qty, 0);

    const byStation = new Map<string, typeof lines>();
    for (const line of lines) {
      const rows = byStation.get(line.station) ?? [];
      rows.push(line);
      byStation.set(line.station, rows);
    }

    const stationTickets = [...byStation.entries()].map(([station, stationLines], index) => ({
      id: `${requestId}-st-${index + 1}`,
      station,
      status: "NEW",
      sentAt,
      items: stationLines.map((line) => ({
        id: line.id,
        menuItemId: line.menuItemId,
        name: line.name,
        name_en: line.name_en,
        name_am: line.name_am,
        qty: line.qty,
        unitPrice: line.unitPrice,
        station: line.station || station,
        finalStation: line.station || station,
        note: line.note,
        unitLabel: line.unitLabel,
        done: false,
      })),
    }));

    const orderId = `ord-guest-${Date.now()}`;
    const orderNo = `G-${String(Date.now()).slice(-6)}`;

    const rawOrder = {
      id: orderId,
      orderNo,
      source: "Guest",
      ref: `${area} ${tableNumber}`.trim(),
      customerName: requestedBy,
      area,
      tableNumber,
      orderedByWaiter: requestedBy,
      waiter: "Guest",
      enteredByCashier: "Guest menu",
      server: "Guest",
      items: lines.map((line) => ({
        id: line.id,
        name: line.name,
        name_en: line.name_en,
        name_am: line.name_am,
        qty: line.qty,
        unitPrice: line.unitPrice,
        station: line.station,
        note: line.note,
        unitLabel: line.unitLabel,
        menuItemId: line.menuItemId,
      })),
      stationTickets,
      sentAt,
      stationSentAt: sentAt,
      createdAtIso,
      priority: area === "VIP" || area === "VVIP" ? "VIP" : "Normal",
      openedMin: 0,
      status: "NEW",
      paymentStatus: "Unpaid",
      total,
      notes: parsed.data.note?.trim() || "",
      guestRequestId: requestId,
    };

    const guestDoc = await GuestOrder.findOneAndUpdate(
      { requestId },
      {
        requestId,
        area,
        tableNumber,
        waiter: requestedBy,
        status: "SENT_TO_WAITER",
        note: parsed.data.note?.trim() || "",
        createdAtIso,
        total,
        items: parsed.data.items.map((item) => ({
          itemId: item.id,
          name_en: item.name_en || "",
          name_am: item.name_am || "",
          qty: Math.max(1, Math.round(item.qty)),
          station: item.station || "Coffee Station Pickup",
          unitLabel: item.unitLabel || "Cup",
          unitPrice: Number(item.price) || 0,
          emoji: item.emoji || "",
          category: item.category || "",
        })),
        orderId,
        orderNo,
        raw: rawOrder,
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );

    await Order.findOneAndUpdate(
      { $or: [{ "raw.id": orderId }, { orderNo }] },
      {
        orderNo,
        status: "NEW",
        paymentStatus: "Unpaid",
        area,
        tableNumber,
        barista: "Guest",
        cashier: "Guest menu",
        branch: "Main Office",
        items: rawOrder.items,
        subtotal: total,
        total,
        notes: rawOrder.notes,
        raw: rawOrder,
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );

    const request = toGuestOrderDto(guestDoc);
    emitOrderRealtime(io, {
      type: "order:created",
      order: rawOrder,
      orderId,
      orderNo,
      message: `Guest order ${orderNo} from ${area}`,
    });
    io.emit("guest-orders:created", { request, order: rawOrder, at: createdAtIso });

    res.status(201).json({ request, order: rawOrder });
  });

  router.patch("/:id", requireAuth, async (req: AuthedRequest, res) => {
    const parsed = z
      .object({
        status: z.enum(["QR_GENERATED", "SENT_TO_WAITER", "IMPORTED", "SENT_TO_CASHIER"]),
      })
      .safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid status" });
      return;
    }

    const doc = await GuestOrder.findOneAndUpdate(
      { requestId: req.params.id },
      { status: parsed.data.status },
      { new: true },
    );
    if (!doc) {
      res.status(404).json({ error: "Guest order not found" });
      return;
    }
    const request = toGuestOrderDto(doc);
    io.emit("guest-orders:updated", { request, at: new Date().toISOString() });
    res.json({ request });
  });

  return router;
}
