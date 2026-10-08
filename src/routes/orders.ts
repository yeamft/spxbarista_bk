import { Router } from "express";
import { z } from "zod";
import { Order } from "../models/Order.js";
import { requireAuth, type AuthedRequest } from "../middleware/auth.js";
import type { Server as SocketServer } from "socket.io";
import type { OrdersPatchEvent, OrdersSocketEvent } from "../socket.js";
import { asyncHandler, isDuplicateKeyError } from "../lib/async-handler.js";
import { notifyOrderChange } from "../lib/web-push.js";

function orderFromDoc(order: {
  _id: { toString(): string };
  orderNo: string;
  status?: string | null;
  paymentStatus?: string | null;
  area?: string | null;
  tableNumber?: string | null;
  barista?: string | null;
  cashier?: string | null;
  branch?: string | null;
  items?: unknown[];
  subtotal?: number | null;
  total?: number | null;
  notes?: string | null;
  raw?: unknown;
  updatedAt?: Date;
  createdAt?: Date;
}) {
  const raw =
    order.raw && typeof order.raw === "object"
      ? (order.raw as Record<string, unknown>)
      : null;
  if (raw && typeof raw.id === "string") {
    return {
      ...raw,
      id: String(raw.id),
      orderNo: String(raw.orderNo || order.orderNo),
      _mongoId: String(order._id),
      updatedAt: order.updatedAt?.toISOString(),
    };
  }
  return {
    id: String(order._id),
    orderNo: order.orderNo,
    status: order.status,
    paymentStatus: order.paymentStatus,
    area: order.area,
    tableNumber: order.tableNumber,
    barista: order.barista,
    cashier: order.cashier,
    branch: order.branch,
    items: order.items || [],
    subtotal: order.subtotal ?? 0,
    total: order.total ?? 0,
    notes: order.notes || "",
    _mongoId: String(order._id),
    updatedAt: order.updatedAt?.toISOString(),
  };
}

function emitOrderRealtime(
  io: SocketServer,
  opts: {
    type: string;
    order: Record<string, unknown>;
    orderId: string;
    orderNo: string;
    message: string;
    actor?: string;
  },
) {
  const at = new Date().toISOString();
  const event: OrdersSocketEvent = {
    type: opts.type,
    orderId: opts.orderId,
    orderNo: opts.orderNo,
    message: opts.message,
    actor: opts.actor,
    at,
  };
  const patch: OrdersPatchEvent = {
    orderId: opts.orderId,
    order: opts.order,
    at,
    actor: opts.actor,
  };
  io.emit("orders:event", event);
  io.emit("orders:patch", patch);
}

export function createOrdersRouter(io: SocketServer) {
  const router = Router();

  router.get("/", requireAuth, asyncHandler(async (req, res) => {
    const pageRaw = req.query.page;
    const pageSizeRaw = req.query.pageSize ?? req.query.limit;
    const paginate = pageRaw != null || pageSizeRaw != null;
    const page = Math.max(1, Number(pageRaw) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(pageSizeRaw) || 50));
    const status =
      typeof req.query.status === "string" && req.query.status.trim() && req.query.status !== "All"
        ? req.query.status.trim()
        : "";

    const filter: Record<string, unknown> = {};
    if (status) filter.status = status;

    const total = await Order.countDocuments(filter);

    if (!paginate) {
      // Hydrate / sync path: recent window (not a UI page).
      const orders = await Order.find(filter).sort({ updatedAt: -1 }).limit(300).lean();
      res.json({
        orders: orders.map((order) => orderFromDoc(order)),
        total,
        page: 1,
        pageSize: orders.length,
      });
      return;
    }

    const skip = (page - 1) * pageSize;
    const orders = await Order.find(filter)
      .sort({ updatedAt: -1 })
      .skip(skip)
      .limit(pageSize)
      .lean();

    res.json({
      orders: orders.map((order) => orderFromDoc(order)),
      total,
      page,
      pageSize,
    });
  }));

  router.get("/:id", requireAuth, asyncHandler(async (req, res) => {
    const byMongo = await Order.findById(req.params.id).lean();
    if (byMongo) {
      res.json(orderFromDoc(byMongo));
      return;
    }
    const byClient = await Order.findOne({ "raw.id": req.params.id }).lean();
    if (!byClient) {
      res.status(404).json({ error: "Order not found" });
      return;
    }
    res.json(orderFromDoc(byClient));
  }));

  const upsertSchema = z.object({
    id: z.string().optional(),
    orderNo: z.string().min(1),
    status: z.string().optional(),
    paymentStatus: z.string().optional(),
    area: z.string().optional(),
    tableNumber: z.string().optional(),
    barista: z.string().optional(),
    cashier: z.string().optional(),
    branch: z.string().optional(),
    items: z.array(z.record(z.unknown())).optional(),
    subtotal: z.number().optional(),
    total: z.number().optional(),
    notes: z.string().optional(),
    raw: z.unknown().optional(),
    eventType: z.string().optional(),
    message: z.string().optional(),
  });

  async function upsertOrder(data: z.infer<typeof upsertSchema>, actor?: string) {
    const raw =
      data.raw && typeof data.raw === "object"
        ? (data.raw as Record<string, unknown>)
        : data;
    const clientId =
      (typeof data.id === "string" && data.id) ||
      (typeof raw.id === "string" && raw.id) ||
      undefined;

    const fields = {
      orderNo: data.orderNo,
      status: data.status,
      paymentStatus: data.paymentStatus,
      area: data.area,
      tableNumber: data.tableNumber,
      barista: data.barista || actor || "",
      cashier: data.cashier || "",
      branch: data.branch || "Main Office",
      items: data.items,
      subtotal: data.subtotal,
      total: data.total,
      notes: data.notes,
      raw,
    };

    // Identity is the client order id only — never match by orderNo, or two
    // people ordering at the same moment can overwrite each other.
    if (!clientId) {
      const created = await Order.create(fields);
      void notifyOrderChange({
        previousRaw: null,
        previousStatus: undefined,
        nextRaw: created.raw ?? created,
        nextStatus: created.status,
        orderNo: created.orderNo,
        actor,
      });
      return created;
    }

    const filter = { "raw.id": clientId };
    const previous = await Order.findOne(filter).lean();

    let order;
    try {
      order = await Order.findOneAndUpdate(filter, { $set: fields }, {
        new: true,
        upsert: true,
        setDefaultsOnInsert: true,
      });
    } catch (error) {
      if (!isDuplicateKeyError(error)) throw error;
      order = await Order.findOneAndUpdate(filter, { $set: fields }, { new: true });
    }

    if (!order) {
      throw new Error("Could not save order");
    }

    void notifyOrderChange({
      previousRaw: previous?.raw ?? previous,
      previousStatus: previous?.status,
      nextRaw: order.raw ?? order,
      nextStatus: order.status,
      orderNo: order.orderNo,
      actor,
    });

    return order;
  }

  router.post("/", requireAuth, asyncHandler(async (req: AuthedRequest, res) => {
    const parsed = upsertSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid order payload" });
      return;
    }

    const order = await upsertOrder(parsed.data, req.user?.name);
    const shaped = orderFromDoc(order);
    const clientId = String(shaped.id);

    emitOrderRealtime(io, {
      type: parsed.data.eventType || "order:created",
      order: shaped,
      orderId: clientId,
      orderNo: order.orderNo,
      message: parsed.data.message || `Order ${order.orderNo} created`,
      actor: req.user?.name,
    });

    res.status(201).json({ id: clientId, order: shaped });
  }));

  router.post("/bulk", requireAuth, asyncHandler(async (req: AuthedRequest, res) => {
    const parsed = z.object({ orders: z.array(upsertSchema) }).safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid bulk order payload" });
      return;
    }

    const results = await Promise.all(
      parsed.data.orders.map(async (row) => {
        const order = await upsertOrder(row, req.user?.name);
        const shaped = orderFromDoc(order);
        const clientId = String(shaped.id);
        emitOrderRealtime(io, {
          type: row.eventType || "order:updated",
          order: shaped,
          orderId: clientId,
          orderNo: order.orderNo,
          message: row.message || `Order ${order.orderNo} synced`,
          actor: req.user?.name,
        });
        return shaped;
      }),
    );

    res.json({ orders: results });
  }));

  router.patch("/:id", requireAuth, asyncHandler(async (req: AuthedRequest, res) => {
    const parsed = upsertSchema.partial().extend({ orderNo: z.string().min(1).optional() }).safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid order payload" });
      return;
    }

    const existing =
      (await Order.findById(req.params.id)) ||
      (await Order.findOne({ "raw.id": req.params.id }));

    if (!existing) {
      res.status(404).json({ error: "Order not found" });
      return;
    }

    const existingRaw =
      existing.raw && typeof existing.raw === "object"
        ? (existing.raw as Record<string, unknown>)
        : {};
    const existingClientId = typeof existingRaw.id === "string" ? existingRaw.id : "";

    const data = {
      ...parsed.data,
      orderNo: parsed.data.orderNo || existing.orderNo,
      id: existingClientId || req.params.id,
      raw: parsed.data.raw ?? existing.raw,
    };
    const order = await upsertOrder(data as z.infer<typeof upsertSchema>, req.user?.name);
    const shaped = orderFromDoc(order);
    const clientId = String(shaped.id);

    emitOrderRealtime(io, {
      type: parsed.data.eventType || "order:updated",
      order: shaped,
      orderId: clientId,
      orderNo: order.orderNo,
      message: parsed.data.message || `Order ${order.orderNo} updated`,
      actor: req.user?.name,
    });

    res.json({ id: clientId, order: shaped });
  }));

  return router;
}
