"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BookOpen,
  CheckCheck,
  Clock,
  PackageCheck,
  Phone,
  Plus,
  Printer,
  RotateCcw,
  Send,
  Truck,
  User,
  X,
} from "lucide-react";
import { showAlert } from "@/lib/alerts";
import { WhatsAppIcon } from "@/components/whatsapp-icon";
import { RecordList } from "@/components/record-list";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

export const LESSON_CHOICES = [
  {
    key: "quarterly",
    name: "Lesson Quarterly",
    category: "Adult",
    description: "Standard adult Sabbath School quarterly for daily study and class discussion.",
  },
  {
    key: "teachers",
    name: "Teacher's guide",
    category: "Adult / Teachers",
    description: "Adult teacher's edition with lesson outlines, commentary, and discussion prompts.",
  },
  {
    key: "ya",
    name: "Young Adult (Inverse / YA)",
    category: "Young Adults (18–35)",
    description: "Conversation-driven inductive Bible study guide for university and young adults.",
  },
  {
    key: "teens",
    name: "Teens (Cornerstone Connections)",
    category: "Teens (15–18)",
    description: "Cornerstone Connections study guide applying scripture to real teen challenges.",
  },
  {
    key: "juniors",
    name: "Junior PowerPoints",
    category: "Juniors (10–14)",
    description: "Engaging lessons, daily stories, and activities for junior youth and early pre-teens.",
  },
  {
    key: "primary",
    name: "Primary",
    category: "Children (5–9)",
    description: "Bible story lessons, memory verses, and craft activities for primary grades.",
  },
  {
    key: "kindergarten",
    name: "Kindergarten",
    category: "Children (3–4)",
    description: "Illustrated Bible stories and interactive activities for preschool children.",
  },
  {
    key: "beginners",
    name: "Beginners",
    category: "Children (0–2)",
    description: "Cradle roll lessons introducing tiny toddlers and parents to Jesus through simple stories.",
  },
  {
    key: "adult-mission",
    name: "Adult Mission Reading",
    category: "Mission Emphasis",
    description: "Weekly worldwide Adventist mission stories and global outreach reports.",
  },
  {
    key: "children-mission",
    name: "Children Mission Reading",
    category: "Mission Emphasis",
    description: "Mission adventure stories written specially for children's Sabbath School.",
  },
  {
    key: "other",
    name: "Other Lesson / Study Guide",
    category: "Custom",
    description: "Specify any custom study guide, large-print edition, or language in your note.",
  },
] as const;

export type LessonOrderRow = {
  id: number;
  lesson: string;
  quantity?: number;
  note: string;
  status: string;
  created_at: string;
  delivered_at?: string | null;
  delivered_by_name?: string;
  member_name: string;
  member_phone?: string;
  mine?: boolean;
  served_at?: string | null;
  served_by_name?: string;
};

type QueueResponse = {
  requests?: LessonOrderRow[];
  orders?: LessonOrderRow[];
  can_serve?: boolean;
  can_deliver?: boolean;
};

function authHeaders(): Record<string, string> {
  const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

const isDeliveredRow = (order: LessonOrderRow) =>
  order.status === "delivered" || order.status === "served";

export function LessonOrdersPanel() {
  const [orders, setOrders] = useState<LessonOrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [canDeliver, setCanDeliver] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [actionId, setActionId] = useState<number | null>(null);

  // The order sheet — the desk's one write, opened over the records rather
  // than standing above them and pushing the queue off the screen.
  const [showOrderModal, setShowOrderModal] = useState(false);

  // Form states
  const [selectedLessonKey, setSelectedLessonKey] = useState<string>("quarterly");
  const [customLesson, setCustomLesson] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [note, setNote] = useState("");

  // Superintendent view filter
  const [filter, setFilter] = useState<"pending" | "delivered" | "all">("pending");

  const reload = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/members/lesson-orders/`, { headers: authHeaders() });
      if (!res.ok) {
        // Fallback to legacy endpoint if needed
        const fallbackRes = await fetch(`${API_URL}/api/members/lesson-requests/`, { headers: authHeaders() });
        const fallbackData = (await fallbackRes.json()) as QueueResponse;
        setOrders(fallbackData.orders || fallbackData.requests || []);
        setCanDeliver(Boolean(fallbackData.can_deliver || fallbackData.can_serve));
        return;
      }
      const data = (await res.json()) as QueueResponse;
      setOrders(data.orders || data.requests || []);
      setCanDeliver(Boolean(data.can_deliver || data.can_serve));
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let alive = true;
    void Promise.resolve().then(async () => {
      if (!alive) return;
      await reload();
    });
    return () => {
      alive = false;
    };
  }, [reload]);

  const resetForm = () => {
    setSelectedLessonKey("quarterly");
    setCustomLesson("");
    setQuantity(1);
    setNote("");
  };

  const openOrderModal = () => {
    resetForm();
    setShowOrderModal(true);
  };

  const handleOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    const isCustom = selectedLessonKey === "other";
    const lessonTitle = isCustom
      ? customLesson.trim()
      : LESSON_CHOICES.find((c) => c.key === selectedLessonKey)?.name || "";

    if (!lessonTitle) {
      showAlert("Missing lesson", "Please specify the lesson guide you wish to order.", "info");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`${API_URL}/api/members/lesson-orders/`, {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          lesson: lessonTitle,
          quantity: Math.max(1, quantity),
          note: note.trim(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || data.lesson || "Could not place lesson order.");

      showAlert(
        "Order Placed",
        `Your order for ${quantity} copy of "${lessonTitle}" has been sent to the Sabbath School superintendent.`,
        "success",
        { toast: true, timer: 4500, showConfirmButton: false }
      );

      resetForm();
      setShowOrderModal(false);
      void reload();
    } catch (err) {
      showAlert("Order failed", err instanceof Error ? err.message : "Please try again.", "error");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeliver = async (orderId: number, reopen = false) => {
    setActionId(orderId);
    try {
      const res = await fetch(`${API_URL}/api/members/lesson-orders/${orderId}/deliver/`, {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify(reopen ? { reopen: true } : { action: "deliver" }),
      });
      if (!res.ok) {
        // Fallback to legacy endpoint
        const fallbackRes = await fetch(`${API_URL}/api/members/lesson-requests/${orderId}/serve/`, {
          method: "POST",
          headers: { ...authHeaders(), "Content-Type": "application/json" },
          body: JSON.stringify(reopen ? { reopen: true } : {}),
        });
        if (!fallbackRes.ok) throw new Error("Could not update order status.");
      }

      showAlert(
        reopen ? "Order Reopened" : "Delivered",
        reopen ? "The order was returned to the pending queue." : "The order has been marked as delivered.",
        "success",
        { toast: true, timer: 3000, showConfirmButton: false }
      );
      void reload();
    } catch (err) {
      showAlert("Action failed", err instanceof Error ? err.message : "Please try again.", "error");
    } finally {
      setActionId(null);
    }
  };

  const sortedOrders = useMemo(
    () => orders.slice().sort((a, b) => (a.created_at < b.created_at ? 1 : -1)),
    [orders]
  );

  const pendingCount = useMemo(
    () => sortedOrders.filter((order) => !isDeliveredRow(order)).length,
    [sortedOrders]
  );
  const deliveredCount = useMemo(
    () => sortedOrders.filter(isDeliveredRow).length,
    [sortedOrders]
  );

  const visibleOrders = useMemo(() => {
    if (!canDeliver) return sortedOrders;
    if (filter === "pending") return sortedOrders.filter((order) => !isDeliveredRow(order));
    if (filter === "delivered") return sortedOrders.filter(isDeliveredRow);
    return sortedOrders;
  }, [canDeliver, filter, sortedOrders]);

  /** The sheet in the browser's print dialog: the orders on screen, with the
      active filter, so the superintendent prints the queue they are reading
      rather than the whole roll. */
  const printOrders = () => {
    const escape = (value: string) =>
      value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const rows = visibleOrders
      .map((order, index) => {
        const delivered = isDeliveredRow(order);
        const deliveredBy = order.delivered_by_name || order.served_by_name || "";
        const deliveredAt = order.delivered_at || order.served_at;
        return `<tr>
          <td>${index + 1}</td>
          <td>${escape(order.lesson)}</td>
          <td class="center">${order.quantity || 1}</td>
          ${canDeliver ? `<td>${escape(order.member_name)}</td>` : ""}
          <td>${new Date(order.created_at).toLocaleDateString()}</td>
          <td>${delivered ? "Delivered" : "Awaiting delivery"}</td>
          <td>${delivered && deliveredBy ? escape(deliveredBy) : "—"}${
            delivered && deliveredAt ? ` · ${new Date(deliveredAt).toLocaleDateString()}` : ""
          }</td>
        </tr>`;
      })
      .join("");
    const popup = window.open("", "_blank");
    if (!popup) return;
    popup.document.write(`<!doctype html><html><head><title>Sabbath School Lesson Orders</title><style>
      body{font-family:ui-sans-serif,system-ui,sans-serif;color:#28201c;margin:32px}
      h1{font-size:22px;margin:0 0 4px}
      p{color:#665a4f;font-size:11px;margin:0 0 18px}
      table{width:100%;border-collapse:collapse;font-size:11px}
      th{text-align:left;border-bottom:2px solid #8c4c2f;padding:8px 6px;text-transform:uppercase;font-size:9px;color:#665a4f}
      td{border-bottom:1px solid #e6ddd5;padding:8px 6px;vertical-align:top}
      .center{text-align:center}
      @media print{body{margin:16px}}
    </style></head><body>
      <h1>Sabbath School Lesson Orders</h1>
      <p>${visibleOrders.length} order${visibleOrders.length === 1 ? "" : "s"}${
        canDeliver ? ` · ${filter === "all" ? "All" : filter === "delivered" ? "Delivered" : "Pending"}` : ""
      } · Printed ${new Date().toLocaleDateString()}</p>
      <table><thead><tr>
        <th>#</th><th>Lesson</th><th class="center">Qty</th>
        ${canDeliver ? "<th>Member</th>" : ""}
        <th>Ordered</th><th>Status</th><th>Delivered by</th>
      </tr></thead><tbody>${rows || `<tr><td colspan="7">No orders to print.</td></tr>`}</tbody></table>
    </body></html>`);
    popup.document.close();
    popup.focus();
    popup.print();
  };

  const selectedChoice = LESSON_CHOICES.find((c) => c.key === selectedLessonKey);

  const headers = [
    { label: "Lesson", className: "px-4 py-3" },
    { label: "Qty", className: "px-4 py-3 text-center" },
    ...(canDeliver ? [{ label: "Member", className: "px-4 py-3" }] : []),
    { label: "Ordered", className: "px-4 py-3" },
    { label: "Status", className: "px-4 py-3" },
    ...(canDeliver
      ? [
          { label: "Delivery", className: "px-4 py-3" },
          { label: "Action", className: "px-4 py-3 text-center" },
        ]
      : []),
  ];

  return (
    <div className="space-y-4">
      {/* Header & Context */}
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-bold text-bark">
            <PackageCheck className="h-4 w-4 text-ember" aria-hidden="true" />
            {canDeliver ? "Sabbath School Lesson Orders & Delivery" : "Order Sabbath School Lessons"}
          </h3>
          <p className="mt-0.5 text-xs text-moss">
            {canDeliver
              ? "Members order study guides here. The Sabbath School superintendent reviews and delivers orders."
              : "Order your Sabbath School lesson guide or teacher's quarterly. The superintendent will deliver your copy."}
          </p>
        </div>
      </div>

      {/* Superintendent Metrics & Filter Toggles */}
      {canDeliver && (
        <div className="flex flex-col gap-3 rounded-xl border border-sand-line bg-sand/40 p-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 text-xs font-medium text-moss">
            <Truck className="h-4 w-4 text-ember" aria-hidden="true" />
            <span>
              Orders Queue: <strong className="text-bark">{pendingCount}</strong> pending delivery,{" "}
              <strong className="text-bark">{deliveredCount}</strong> delivered
            </span>
          </div>
          <div className="flex items-center gap-1 rounded-lg bg-white p-1 border border-sand-line text-xs font-semibold">
            <button
              type="button"
              onClick={() => setFilter("pending")}
              className={`rounded-md px-2.5 py-1 text-[11px] transition ${
                filter === "pending" ? "bg-ember text-white" : "text-moss hover:text-bark"
              }`}
            >
              Pending ({pendingCount})
            </button>
            <button
              type="button"
              onClick={() => setFilter("delivered")}
              className={`rounded-md px-2.5 py-1 text-[11px] transition ${
                filter === "delivered" ? "bg-ember text-white" : "text-moss hover:text-bark"
              }`}
            >
              Delivered ({deliveredCount})
            </button>
            <button
              type="button"
              onClick={() => setFilter("all")}
              className={`rounded-md px-2.5 py-1 text-[11px] transition ${
                filter === "all" ? "bg-ember text-white" : "text-moss hover:text-bark"
              }`}
            >
              All ({orders.length})
            </button>
          </div>
        </div>
      )}

      {/* Orders — an empty state until one is placed, then the register. */}
      {loading ? (
        <p className="rounded-2xl border border-sand-line bg-white py-10 text-center text-xs text-moss">
          Loading lesson orders…
        </p>
      ) : visibleOrders.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-sand-line bg-sand-linen/40 p-10 text-center">
          <BookOpen className="mx-auto h-8 w-8 text-moss-faint" aria-hidden="true" />
          <p className="mt-2 text-xs font-medium text-moss">
            {canDeliver
              ? filter === "pending"
                ? "All caught up! No lesson orders awaiting delivery."
                : "No lesson orders found."
              : "You haven't placed any lesson orders yet."}
          </p>
          <p className="mt-1 text-[11px] text-moss-faint">
            Use &ldquo;Create order&rdquo; below to place one.
          </p>
        </div>
      ) : (
        <RecordList
          rows={visibleOrders}
          loading={false}
          rowKey={(order) => order.id}
          loadingLabel="Loading lesson orders…"
          headers={headers}
          tableWrapperClassName="overflow-x-auto rounded-2xl border border-sand-line bg-white"
          tableClassName="w-full text-left text-xs"
          headClassName="border-b border-sand-line bg-sand/60"
          headRowClassName="text-[11px] font-bold uppercase tracking-wider text-ember"
          headCellClassName="font-bold"
          renderRow={(order) => {
            const delivered = isDeliveredRow(order);
            const deliveredBy = order.delivered_by_name || order.served_by_name;
            const deliveredAt = order.delivered_at || order.served_at;
            const isBusy = actionId === order.id;
            return (
              <tr key={order.id} className="align-top transition hover:bg-sand-linen/50">
                <td className="min-w-[200px] px-4 py-3">
                  <span className="block font-semibold text-bark">{order.lesson}</span>
                  {order.note && (
                    <span className="mt-0.5 block text-[11px] text-moss line-clamp-2">{order.note}</span>
                  )}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-center font-semibold text-bark">
                  {order.quantity || 1}
                </td>
                {canDeliver && (
                  <td className="whitespace-nowrap px-4 py-3">
                    <span className="flex items-center gap-1 text-bark">
                      <User className="h-3 w-3 text-moss" aria-hidden="true" />
                      {order.member_name}
                    </span>
                  </td>
                )}
                <td className="whitespace-nowrap px-4 py-3 text-moss">
                  {new Date(order.created_at).toLocaleDateString()}
                </td>
                <td className="whitespace-nowrap px-4 py-3">
                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                      delivered ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"
                    }`}
                  >
                    {delivered ? (
                      <CheckCheck className="h-3 w-3" aria-hidden="true" />
                    ) : (
                      <Clock className="h-3 w-3" aria-hidden="true" />
                    )}
                    {delivered ? "Delivered" : "Awaiting Delivery"}
                  </span>
                </td>
                {canDeliver && (
                  <td className="whitespace-nowrap px-4 py-3 text-[11px] text-moss">
                    {delivered && deliveredBy ? (
                      <>
                        {deliveredBy}
                        {deliveredAt && (
                          <span className="block text-moss-faint">
                            {new Date(deliveredAt).toLocaleDateString()}
                          </span>
                        )}
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                )}
                {canDeliver && (
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-center gap-1.5">
                      {order.member_phone && (
                        <>
                          <a
                            href={`tel:${order.member_phone}`}
                            title={`Call ${order.member_name}`}
                            className="flex h-8 w-8 items-center justify-center rounded-lg border border-sand-line bg-sand text-bark hover:bg-sand-line"
                          >
                            <Phone className="h-3.5 w-3.5" aria-hidden="true" />
                          </a>
                          <a
                            href={`https://wa.me/${order.member_phone.replace(/\D/g, "")}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            title={`WhatsApp ${order.member_name}`}
                            className="flex h-8 w-8 items-center justify-center rounded-lg border border-sand-line bg-sand text-emerald-700 hover:bg-sand-line"
                          >
                            <WhatsAppIcon className="h-3.5 w-3.5" aria-hidden="true" />
                          </a>
                        </>
                      )}
                      {!delivered ? (
                        <button
                          type="button"
                          onClick={() => handleDeliver(order.id, false)}
                          disabled={isBusy}
                          className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-xl bg-emerald-600 px-3 py-1.5 text-[11px] font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-60"
                        >
                          <Truck className="h-3.5 w-3.5" aria-hidden="true" />
                          {isBusy ? "Delivering…" : "Deliver"}
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleDeliver(order.id, true)}
                          disabled={isBusy}
                          title="Reopen order if marked by mistake"
                          className="inline-flex items-center gap-1 whitespace-nowrap rounded-xl border border-sand-line bg-sand px-2.5 py-1.5 text-[11px] font-semibold text-moss transition hover:bg-sand-line hover:text-bark disabled:opacity-60"
                        >
                          <RotateCcw className="h-3 w-3" aria-hidden="true" />
                          Reopen
                        </button>
                      )}
                    </div>
                  </td>
                )}
              </tr>
            );
          }}
          renderCard={(order) => {
            const delivered = isDeliveredRow(order);
            const deliveredBy = order.delivered_by_name || order.served_by_name;
            const deliveredAt = order.delivered_at || order.served_at;
            const isBusy = actionId === order.id;
            return (
              <div key={order.id} className="space-y-2 rounded-xl border border-sand-line bg-white p-3.5 text-xs">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h4 className="truncate text-sm font-bold text-bark">{order.lesson}</h4>
                    <p className="text-[11px] text-moss">
                      {canDeliver ? `${order.member_name} · ` : ""}
                      Ordered {new Date(order.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                      delivered ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"
                    }`}
                  >
                    {delivered ? "Delivered" : "Awaiting"}
                  </span>
                </div>
                <div className="flex items-center justify-between text-moss">
                  <span>Quantity</span>
                  <span className="font-semibold text-bark">{order.quantity || 1}</span>
                </div>
                {order.note && <p className="text-[11px] leading-relaxed text-moss">{order.note}</p>}
                {delivered && deliveredBy && (
                  <p className="text-[11px] text-moss-faint">
                    Delivered by {deliveredBy}
                    {deliveredAt ? ` on ${new Date(deliveredAt).toLocaleDateString()}` : ""}
                  </p>
                )}
                {canDeliver && (
                  <div className="flex flex-wrap items-center justify-end gap-1.5 border-t border-sand-line pt-2">
                    {order.member_phone && (
                      <>
                        <a
                          href={`tel:${order.member_phone}`}
                          title={`Call ${order.member_name}`}
                          className="flex h-8 w-8 items-center justify-center rounded-lg border border-sand-line bg-sand text-bark hover:bg-sand-line"
                        >
                          <Phone className="h-3.5 w-3.5" aria-hidden="true" />
                        </a>
                        <a
                          href={`https://wa.me/${order.member_phone.replace(/\D/g, "")}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          title={`WhatsApp ${order.member_name}`}
                          className="flex h-8 w-8 items-center justify-center rounded-lg border border-sand-line bg-sand text-emerald-700 hover:bg-sand-line"
                        >
                          <WhatsAppIcon className="h-3.5 w-3.5" aria-hidden="true" />
                        </a>
                      </>
                    )}
                    {!delivered ? (
                      <button
                        type="button"
                        onClick={() => handleDeliver(order.id, false)}
                        disabled={isBusy}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-1.5 text-[11px] font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-60"
                      >
                        <Truck className="h-3.5 w-3.5" aria-hidden="true" />
                        {isBusy ? "Delivering…" : "Deliver"}
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleDeliver(order.id, true)}
                        disabled={isBusy}
                        className="inline-flex items-center gap-1 rounded-xl border border-sand-line bg-sand px-2.5 py-1.5 text-[11px] font-semibold text-moss transition hover:bg-sand-line hover:text-bark disabled:opacity-60"
                      >
                        <RotateCcw className="h-3 w-3" aria-hidden="true" />
                        Reopen
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          }}
          cardsClassName="grid gap-3 md:hidden"
        />
      )}

      {/* The desk's actions across the bottom of the records: print what the
          filter shows, or place a new order. */}
      <div className="page-actions">
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-sand-line bg-white px-4 py-3 shadow-sm">
          <p className="text-xs text-moss">
            Showing <strong className="text-bark">{visibleOrders.length}</strong> of {orders.length} orders
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <button
              type="button"
              onClick={printOrders}
              disabled={visibleOrders.length === 0}
              className="inline-flex h-9 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl border border-sand-mute bg-white px-3.5 text-xs font-semibold text-bark transition hover:border-ember disabled:cursor-not-allowed disabled:opacity-45"
            >
              <Printer className="h-4 w-4" aria-hidden="true" />
              Print orders
            </button>
            <button
              type="button"
              onClick={openOrderModal}
              className="inline-flex h-9 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl bg-ember px-3.5 text-xs font-semibold text-white shadow-sm transition hover:bg-ember-dark"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              Create order
            </button>
          </div>
        </div>
      </div>

      {/* The order sheet */}
      {showOrderModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setShowOrderModal(false);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Place a new lesson order"
            className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-3xl bg-white shadow-2xl ring-1 ring-sand-line"
          >
            <div className="flex shrink-0 items-start justify-between gap-3 border-b border-sand-line px-5 pb-3 pt-5">
              <div>
                <h3 className="flex items-center gap-1.5 text-base font-bold text-bark">
                  <BookOpen className="h-4 w-4 text-ember" aria-hidden="true" />
                  New Lesson Order
                </h3>
                <p className="mt-0.5 text-[11px] text-moss">
                  Select the quarterly, teacher guide, or age-group study guide you need.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowOrderModal(false)}
                aria-label="Close"
                className="text-moss transition hover:text-bark"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>

            <form onSubmit={handleOrder} className="flex min-h-0 flex-1 flex-col">
              <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
                <div>
                  <label htmlFor="lesson-select" className="block text-xs font-semibold text-bark">
                    Lesson Choice
                  </label>
                  <select
                    id="lesson-select"
                    value={selectedLessonKey}
                    onChange={(e) => setSelectedLessonKey(e.target.value)}
                    className="mt-1 block w-full rounded-xl border border-sand-line bg-white px-3 py-2.5 text-xs font-medium text-bark outline-none transition focus:border-ember focus:ring-1 focus:ring-ember"
                  >
                    {LESSON_CHOICES.map((choice) => (
                      <option key={choice.key} value={choice.key}>
                        {choice.name} ({choice.category})
                      </option>
                    ))}
                  </select>
                  {selectedChoice && selectedLessonKey !== "other" && (
                    <p className="mt-1 text-[11px] text-moss">{selectedChoice.description}</p>
                  )}
                </div>

                {selectedLessonKey === "other" && (
                  <div>
                    <label htmlFor="custom-lesson-title" className="block text-xs font-semibold text-bark">
                      Specify Lesson Name / Publication
                    </label>
                    <input
                      id="custom-lesson-title"
                      type="text"
                      value={customLesson}
                      onChange={(e) => setCustomLesson(e.target.value)}
                      placeholder="e.g. Swahili Adult Lesson, Large Print Guide, etc."
                      className="mt-1 block w-full rounded-xl border border-sand-line bg-white px-3 py-2 text-xs text-bark outline-none focus:border-ember focus:ring-1 focus:ring-ember"
                      required
                    />
                  </div>
                )}

                <div>
                  <label htmlFor="order-quantity" className="block text-xs font-semibold text-bark">
                    Quantity (Copies)
                  </label>
                  <div className="mt-1 flex items-center rounded-xl border border-sand-line bg-white px-2 py-1">
                    <button
                      type="button"
                      onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                      className="flex h-7 w-7 items-center justify-center rounded-lg bg-sand text-xs font-bold text-bark hover:bg-sand-line"
                      aria-label="Decrease quantity"
                    >
                      -
                    </button>
                    <input
                      id="order-quantity"
                      type="number"
                      min="1"
                      max="50"
                      value={quantity}
                      onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value, 10) || 1))}
                      className="w-full text-center text-xs font-bold text-bark outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setQuantity((q) => q + 1)}
                      className="flex h-7 w-7 items-center justify-center rounded-lg bg-sand text-xs font-bold text-bark hover:bg-sand-line"
                      aria-label="Increase quantity"
                    >
                      +
                    </button>
                  </div>
                </div>

                <div>
                  <label htmlFor="order-note" className="block text-xs font-semibold text-bark">
                    Delivery Note / Instructions (Optional)
                  </label>
                  <input
                    id="order-note"
                    type="text"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="e.g. English edition, for Class 3, or pickup at SS desk"
                    className="mt-1 block w-full rounded-xl border border-sand-line bg-white px-3 py-2.5 text-xs text-bark outline-none focus:border-ember focus:ring-1 focus:ring-ember"
                  />
                </div>
              </div>

              <div className="flex shrink-0 items-center justify-end gap-2 border-t border-sand-line bg-sand-linen/40 px-5 py-3">
                <button
                  type="button"
                  onClick={() => setShowOrderModal(false)}
                  className="rounded-xl border border-sand-line bg-white px-3.5 py-2 text-xs font-semibold text-moss transition hover:text-bark"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex items-center gap-2 rounded-xl bg-ember px-4 py-2 text-xs font-semibold text-white transition hover:bg-ember-deep disabled:opacity-60"
                >
                  <Send className="h-3.5 w-3.5" aria-hidden="true" />
                  {submitting ? "Placing Order…" : "Order Lesson"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
