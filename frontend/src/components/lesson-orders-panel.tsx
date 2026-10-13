"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BookOpen,
  CheckCheck,
  Clock,
  PackageCheck,
  Phone,
  Plus,
  RotateCcw,
  Send,
  Truck,
  User,
} from "lucide-react";
import { showAlert } from "@/lib/alerts";
import { WhatsAppIcon } from "@/components/whatsapp-icon";

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

export function LessonOrdersPanel() {
  const [orders, setOrders] = useState<LessonOrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [canDeliver, setCanDeliver] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [actionId, setActionId] = useState<number | null>(null);

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

      // Reset form
      setCustomLesson("");
      setQuantity(1);
      setNote("");
      setSelectedLessonKey("quarterly");
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
    () => sortedOrders.filter((o) => o.status !== "delivered" && o.status !== "served").length,
    [sortedOrders]
  );
  const deliveredCount = useMemo(
    () => sortedOrders.filter((o) => o.status === "delivered" || o.status === "served").length,
    [sortedOrders]
  );

  const visibleOrders = useMemo(() => {
    if (!canDeliver) return sortedOrders;
    if (filter === "pending") {
      return sortedOrders.filter((o) => o.status !== "delivered" && o.status !== "served");
    }
    if (filter === "delivered") {
      return sortedOrders.filter((o) => o.status === "delivered" || o.status === "served");
    }
    return sortedOrders;
  }, [canDeliver, filter, sortedOrders]);

  const selectedChoice = LESSON_CHOICES.find((c) => c.key === selectedLessonKey);

  return (
    <div className="space-y-6">
      {/* 1. Header & Context */}
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

      {/* 2. Order Form */}
      <section className="rounded-2xl border border-sand-line bg-sand-card/70 p-4 sm:p-5">
        <div className="mb-3">
          <h4 className="flex items-center gap-1.5 text-xs font-bold text-bark">
            <BookOpen className="h-4 w-4 text-ember" aria-hidden="true" />
            Place a New Lesson Order
          </h4>
          <p className="text-[11px] text-moss">
            Select the lesson quarterly, teacher guide, or age-group study guide you need.
          </p>
        </div>

        <form onSubmit={handleOrder} className="space-y-4">
          {/* Lesson Guide Selector */}
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

          {/* If Custom Lesson selected */}
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

          {/* Quantity and Delivery Notes Row */}
          <div className="grid gap-3 sm:grid-cols-3">
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

            <div className="sm:col-span-2">
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

          <div className="flex justify-end pt-1">
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center gap-2 rounded-xl bg-ember px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-ember-deep disabled:opacity-60"
            >
              <Send className="h-3.5 w-3.5" aria-hidden="true" />
              {submitting ? "Placing Order…" : "Order Lesson"}
            </button>
          </div>
        </form>
      </section>

      {/* 3. Superintendent Metrics & Filter Toggles */}
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
                filter === "pending"
                  ? "bg-ember text-white"
                  : "text-moss hover:text-bark"
              }`}
            >
              Pending ({pendingCount})
            </button>
            <button
              type="button"
              onClick={() => setFilter("delivered")}
              className={`rounded-md px-2.5 py-1 text-[11px] transition ${
                filter === "delivered"
                  ? "bg-ember text-white"
                  : "text-moss hover:text-bark"
              }`}
            >
              Delivered ({deliveredCount})
            </button>
            <button
              type="button"
              onClick={() => setFilter("all")}
              className={`rounded-md px-2.5 py-1 text-[11px] transition ${
                filter === "all"
                  ? "bg-ember text-white"
                  : "text-moss hover:text-bark"
              }`}
            >
              All ({orders.length})
            </button>
          </div>
        </div>
      )}

      {/* 4. Orders List */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <h4 className="text-xs font-bold uppercase tracking-wider text-moss">
            {canDeliver ? `Orders Queue (${visibleOrders.length})` : "Your Lesson Orders"}
          </h4>
        </div>

        {loading ? (
          <p className="py-6 text-center text-xs text-moss">Loading lesson orders…</p>
        ) : visibleOrders.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-sand-line p-8 text-center">
            <BookOpen className="mx-auto h-8 w-8 text-moss-faint" aria-hidden="true" />
            <p className="mt-2 text-xs font-medium text-moss">
              {canDeliver
                ? filter === "pending"
                  ? "All caught up! No lesson orders awaiting delivery."
                  : "No lesson orders found."
                : "You haven't placed any lesson orders yet. Use the form above to order."}
            </p>
          </div>
        ) : (
          <ul className="space-y-3">
            {visibleOrders.map((order) => {
              const isDelivered = order.status === "delivered" || order.status === "served";
              const deliveredBy = order.delivered_by_name || order.served_by_name;
              const deliveredAt = order.delivered_at || order.served_at;
              const isBusy = actionId === order.id;

              return (
                <li
                  key={order.id}
                  className="flex flex-col gap-3 rounded-2xl border border-sand-line bg-white p-4 shadow-sm transition hover:border-ember/40 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex min-w-0 items-start gap-3">
                    <span
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-xs font-bold ${
                        isDelivered
                          ? "bg-emerald-50 text-emerald-700"
                          : "bg-amber-50 text-amber-700"
                      }`}
                    >
                      {isDelivered ? (
                        <CheckCheck className="h-4 w-4" aria-hidden="true" />
                      ) : (
                        <Clock className="h-4 w-4" aria-hidden="true" />
                      )}
                    </span>

                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-bold text-bark">{order.lesson}</span>
                        {(order.quantity || 1) > 1 && (
                          <span className="rounded-full bg-sand px-2 py-0.5 text-[10px] font-bold text-bark">
                            Qty: {order.quantity}
                          </span>
                        )}
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                            isDelivered
                              ? "bg-emerald-50 text-emerald-700"
                              : "bg-amber-50 text-amber-800"
                          }`}
                        >
                          {isDelivered ? "Delivered" : "Awaiting Delivery"}
                        </span>
                      </div>

                      {order.note && (
                        <p className="mt-1 text-xs text-moss line-clamp-2">
                          <strong className="font-semibold text-bark/90">Note:</strong> {order.note}
                        </p>
                      )}

                      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-moss-faint">
                        {canDeliver && (
                          <span className="flex items-center gap-1 text-bark font-medium">
                            <User className="h-3 w-3 text-moss" aria-hidden="true" />
                            {order.member_name}
                          </span>
                        )}
                        <span>Ordered: {new Date(order.created_at).toLocaleDateString()}</span>
                        {isDelivered && deliveredBy && (
                          <span>
                            Delivered by {deliveredBy}{" "}
                            {deliveredAt ? `on ${new Date(deliveredAt).toLocaleDateString()}` : ""}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Right Side: Superintendent Action or Contact Buttons */}
                  <div className="flex shrink-0 items-center gap-2 pt-2 sm:pt-0">
                    {canDeliver && order.member_phone && (
                      <div className="flex items-center gap-1">
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
                      </div>
                    )}

                    {canDeliver && !isDelivered && (
                      <button
                        type="button"
                        onClick={() => handleDeliver(order.id, false)}
                        disabled={isBusy}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-60"
                      >
                        <Truck className="h-3.5 w-3.5" aria-hidden="true" />
                        {isBusy ? "Delivering…" : "Deliver Order"}
                      </button>
                    )}

                    {canDeliver && isDelivered && (
                      <button
                        type="button"
                        onClick={() => handleDeliver(order.id, true)}
                        disabled={isBusy}
                        title="Reopen order if marked by mistake"
                        className="inline-flex items-center gap-1 rounded-xl border border-sand-line bg-sand px-2.5 py-1.5 text-[11px] font-semibold text-moss hover:bg-sand-line hover:text-bark disabled:opacity-60"
                      >
                        <RotateCcw className="h-3 w-3" aria-hidden="true" />
                        Reopen
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
