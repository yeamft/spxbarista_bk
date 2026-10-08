import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "../config.js";
import { PushSubscription } from "../models/PushSubscription.js";

const require = createRequire(import.meta.url);
const webpush = require("web-push") as {
  generateVAPIDKeys: () => { publicKey: string; privateKey: string };
  setVapidDetails: (subject: string, publicKey: string, privateKey: string) => void;
  sendNotification: (
    subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
    payload: string,
    options?: { TTL?: number; urgency?: string; topic?: string },
  ) => Promise<unknown>;
};

export type PushPayload = {
  title: string;
  body: string;
  url?: string;
  tag?: string;
  kind?: "call" | "order" | "info";
  callId?: string;
};

type VapidKeys = { publicKey: string; privateKey: string };

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOCAL_KEY_FILE = path.resolve(__dirname, "../../.vapid.keys.local");

let cachedKeys: VapidKeys | null | undefined;
let configured = false;

function loadVapidKeys(): VapidKeys | null {
  if (cachedKeys !== undefined) return cachedKeys;
  const fromEnvPublic = process.env.VAPID_PUBLIC_KEY?.trim();
  const fromEnvPrivate = process.env.VAPID_PRIVATE_KEY?.trim();
  if (fromEnvPublic && fromEnvPrivate) {
    cachedKeys = { publicKey: fromEnvPublic, privateKey: fromEnvPrivate };
    return cachedKeys;
  }
  try {
    if (fs.existsSync(LOCAL_KEY_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(LOCAL_KEY_FILE, "utf8")) as VapidKeys;
      if (parsed?.publicKey && parsed?.privateKey) {
        cachedKeys = parsed;
        return cachedKeys;
      }
    }
  } catch {
    // ignore unreadable local file
  }
  if (config.isProd) {
    console.warn("[push] VAPID keys missing. Set VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY.");
    cachedKeys = null;
    return null;
  }
  const generated = webpush.generateVAPIDKeys();
  try {
    fs.writeFileSync(LOCAL_KEY_FILE, JSON.stringify(generated, null, 2));
    console.log("[push] wrote local VAPID keys");
  } catch (error) {
    console.warn("[push] could not persist VAPID keys", error);
  }
  cachedKeys = generated;
  return cachedKeys;
}

function ensureConfigured() {
  if (configured) return Boolean(cachedKeys);
  const keys = loadVapidKeys();
  if (!keys) return false;
  const subject = process.env.VAPID_SUBJECT?.trim() || "mailto:cafe@localhost";
  webpush.setVapidDetails(subject, keys.publicKey, keys.privateKey);
  configured = true;
  return true;
}

export function getVapidPublicKey() {
  return loadVapidKeys()?.publicKey ?? "";
}

function nameKey(value: string) {
  return value.trim().toLowerCase();
}

export async function sendWebPush(
  payload: PushPayload,
  options: {
    userIds?: string[];
    names?: string[];
    roles?: string[];
    excludeNames?: string[];
  } = {},
) {
  if (!ensureConfigured()) return;
  const filter: Record<string, unknown> = {};
  const or: Record<string, unknown>[] = [];
  if (options.userIds?.length) or.push({ userId: { $in: options.userIds } });
  if (options.names?.length) or.push({ userNameKey: { $in: options.names.map(nameKey) } });
  if (options.roles?.length) or.push({ role: { $in: options.roles } });
  if (or.length === 1) Object.assign(filter, or[0]);
  else if (or.length > 1) filter.$or = or;
  else return;

  const excluded = new Set((options.excludeNames ?? []).map(nameKey).filter(Boolean));
  const rows = await PushSubscription.find(filter).lean();
  const isCall = payload.kind === "call";
  const body = JSON.stringify({
    title: payload.title,
    body: payload.body,
    url: payload.url || "/app",
    tag: payload.tag || (isCall ? "barista-incoming-call" : "spx-cafe"),
    kind: payload.kind || "info",
    callId: payload.callId,
  });

  await Promise.all(
    rows.map(async (row) => {
      if (excluded.has(row.userNameKey)) return;
      try {
        await webpush.sendNotification(
          {
            endpoint: row.endpoint,
            keys: { p256dh: row.p256dh, auth: row.auth },
          },
          body,
          isCall
            ? { TTL: 120, urgency: "high", topic: "barista-call" }
            : { TTL: 60 * 30, urgency: "high" },
        );
      } catch (error) {
        const status = (error as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          await PushSubscription.deleteOne({ endpoint: row.endpoint }).catch(() => undefined);
          return;
        }
        console.warn("[push] send failed", status || (error as Error).message);
      }
    }),
  );
}

type OrderLike = {
  status?: unknown;
  customerName?: unknown;
  orderedByWaiter?: unknown;
  waiter?: unknown;
  area?: unknown;
  tableNumber?: unknown;
  orderNo?: unknown;
  items?: unknown;
  stationTickets?: unknown;
  cafeUsual?: unknown;
};

function asRecord(value: unknown): OrderLike {
  return value && typeof value === "object" ? (value as OrderLike) : {};
}

function orderPhase(raw: OrderLike, status?: string): "new" | "preparing" | "ready" | "done" | "other" {
  const current = String(status || raw.status || "");
  if (current === "CANCELLED" || current === "RETURNED") return "other";
  if (current === "CLOSED") return "done";
  if (current === "READY TO SERVE" || current === "RECEIPT_GENERATED") return "ready";
  const tickets = Array.isArray(raw.stationTickets) ? raw.stationTickets : [];
  if (
    tickets.some((ticket) => ticket && typeof ticket === "object" && (ticket as { status?: string }).status === "PREPARING") ||
    current === "PARTIALLY READY"
  ) {
    return "preparing";
  }
  if (
    tickets.length > 0 &&
    tickets.every((ticket) => ticket && typeof ticket === "object" && (ticket as { status?: string }).status === "READY")
  ) {
    return "ready";
  }
  if (
    tickets.length > 0 &&
    tickets.every((ticket) => ticket && typeof ticket === "object" && (ticket as { status?: string }).status === "NEW")
  ) {
    return "new";
  }
  if (current === "NEW" || current === "PENDING_CASHIER") return "new";
  return "other";
}

function orderGuestName(raw: OrderLike) {
  return String(raw.customerName || raw.orderedByWaiter || raw.waiter || "").trim();
}

function itemsLabel(raw: OrderLike) {
  if (raw.cafeUsual) {
    const who = String(raw.customerName || raw.orderedByWaiter || raw.waiter || "Guest").trim() || "Guest";
    return `${who}'s orders`;
  }
  const items = Array.isArray(raw.items) ? raw.items : [];
  return items
    .slice(0, 3)
    .map((item) => {
      if (!item || typeof item !== "object") return "";
      const row = item as { qty?: number; name?: string };
      return `${row.qty ?? 1}× ${row.name || "Drink"}`;
    })
    .filter(Boolean)
    .join(", ");
}

function serveAt(raw: OrderLike) {
  return String(raw.area || raw.tableNumber || "Cafe").trim() || "Cafe";
}

export async function notifyOrderChange(opts: {
  previousRaw: unknown;
  previousStatus?: string;
  nextRaw: unknown;
  nextStatus?: string;
  orderNo: string;
  actor?: string;
}) {
  const previous = asRecord(opts.previousRaw);
  const next = asRecord(opts.nextRaw);
  const from = opts.previousRaw ? orderPhase(previous, opts.previousStatus) : null;
  const to = orderPhase(next, opts.nextStatus);
  const guest = orderGuestName(next);
  const drinks = itemsLabel(next);
  const where = serveAt(next);
  const actor = opts.actor?.trim();

  if (!from && (to === "new" || to === "preparing" || to === "other")) {
    await sendWebPush(
      {
        title: "New order",
        body: [drinks, where].filter(Boolean).join(" · ") || opts.orderNo,
        url: "/app/kds",
        tag: `order-new-${opts.orderNo}`,
      },
      { roles: ["Barista"], excludeNames: actor ? [actor] : [] },
    );
    return;
  }

  if (from === to) return;

  if (to === "preparing" && guest) {
    await sendWebPush(
      {
        title: "Your drink is being made",
        body: [opts.orderNo, drinks].filter(Boolean).join(" · "),
        url: "/app/orders",
        tag: `order-making-${opts.orderNo}`,
      },
      { names: [guest], excludeNames: actor ? [actor] : [] },
    );
  }

  if (to === "ready" && guest) {
    await sendWebPush(
      {
        title: "Your coffee is ready",
        body: [opts.orderNo, where].filter(Boolean).join(" · "),
        url: "/app/orders",
        tag: `order-ready-${opts.orderNo}`,
      },
      { names: [guest], excludeNames: actor ? [actor] : [] },
    );
  }
}
