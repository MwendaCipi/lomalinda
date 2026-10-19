"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Boxes,
  CheckCircle2,
  Clock,
  Search,
} from "lucide-react";
import { RecordList } from "@/components/record-list";
import { densityCellPad } from "@/lib/table-density";
import { FilterPopover, FilterSet } from "@/components/filter-popover";
import { dayFirst } from "@/lib/dates";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

/** Mirrors InventoryItem.CATEGORY_CHOICES on the backend. */
const INVENTORY_CATEGORIES = [
  { value: "audio_visual", label: "Audio/Visual" },
  { value: "furniture", label: "Furniture" },
  { value: "sacramental", label: "Sacramental" },
  { value: "kitchen", label: "Kitchen" },
  { value: "electronics", label: "Electronics" },
  { value: "general", label: "General" },
] as const;

/** Mirrors InventoryItem.STATE_CHOICES on the backend. */
const INVENTORY_STATES = [
  { value: "good", label: "Good" },
  { value: "in_use", label: "In Use" },
  { value: "needs_repair", label: "Needs Repair" },
  { value: "damaged", label: "Damaged" },
  { value: "retired", label: "Retired" },
] as const;

type InventoryCategory = (typeof INVENTORY_CATEGORIES)[number]["value"];
type InventoryState = (typeof INVENTORY_STATES)[number]["value"];

interface InventoryItem {
  id: number;
  name: string;
  tag_number: string;
  category: InventoryCategory;
  category_display: string;
  location: string;
  quantity: number;
  state: InventoryState;
  state_display: string;
  assigned_to: string;
  checked_out_at: string | null;
  notes: string;
  movement_count: number;
  created_at: string;
}

async function apiFetch(path: string) {
  const token = typeof window === "undefined" ? null : localStorage.getItem("access_token");
  return fetch(`${API_URL}/api/members${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
}

/** Condition badge — same colours as the deaconate console. */
function inventoryStateBadge(item: InventoryItem) {
  const tone =
    item.state === "good"
      ? "bg-emerald-100 text-emerald-800"
      : item.state === "in_use"
        ? "bg-blue-100 text-blue-800"
        : item.state === "needs_repair"
          ? "bg-amber-100 text-amber-800"
          : item.state === "damaged"
            ? "bg-red-100 text-red-800"
            : "bg-sand-grain text-moss";
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-bold ${tone}`}>
      {item.state === "good" && <CheckCircle2 className="h-3 w-3" />}
      {item.state === "needs_repair" && <AlertTriangle className="h-3 w-3" />}
      {item.state === "in_use" && <Clock className="h-3 w-3" />}
      {item.state_display}
    </span>
  );
}

/** Who holds an item, and since when. */
function custodyCell(item: InventoryItem) {
  if (!item.assigned_to) {
    return <span className="text-graydim">In Store</span>;
  }
  return (
    <span className="block">
      <span className="block font-semibold text-bark">{item.assigned_to}</span>
      {item.checked_out_at && (
        <span className="block text-[10px]">Since {dayFirst(item.checked_out_at)}</span>
      )}
    </span>
  );
}

/**
 * Church Property — the read-only member-facing view of the property register
 * maintained by the deaconate. Officers can add and move items from the
 * Administration console; this page is a browse-only window for all members.
 */
function ChurchPropertyPanel() {
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [stateFilter, setStateFilter] = useState<string>("all");
  const rowPad = densityCellPad();

  useEffect(() => {
    let alive = true;
    apiFetch("/inventory/")
      .then((res) => (res.ok ? res.json() : []))
      .then((data: InventoryItem[]) => {
        if (alive) setInventory(data);
      })
      .catch(() => {
        if (alive) setInventory([]);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  const filteredInventory = useMemo(() => {
    const q = searchQuery.toLowerCase();
    return inventory.filter((item) => {
      if (categoryFilter !== "all" && item.category !== categoryFilter) return false;
      if (stateFilter !== "all" && item.state !== stateFilter) return false;
      if (
        q &&
        !item.name.toLowerCase().includes(q) &&
        !item.tag_number.toLowerCase().includes(q) &&
        !item.location.toLowerCase().includes(q)
      )
        return false;
      return true;
    });
  }, [inventory, searchQuery, categoryFilter, stateFilter]);

  const emptyMessage =
    inventory.length === 0
      ? "No property items registered yet."
      : "No property items match these filters.";

  const filterCls =
    "w-full rounded-full border border-sand-mute bg-white px-3 py-1.5 text-xs text-bark outline-none focus:border-ember";

  const categoryControl = (
    <select
      value={categoryFilter}
      onChange={(e) => setCategoryFilter(e.target.value)}
      className={filterCls}
      aria-label="Property category filter"
    >
      <option value="all">All categories</option>
      {INVENTORY_CATEGORIES.map((category) => (
        <option key={category.value} value={category.value}>
          {category.label}
        </option>
      ))}
    </select>
  );

  const stateControl = (
    <select
      value={stateFilter}
      onChange={(e) => setStateFilter(e.target.value)}
      className={filterCls}
      aria-label="Property condition filter"
    >
      <option value="all">All conditions</option>
      {INVENTORY_STATES.map((state) => (
        <option key={state.value} value={state.value}>
          {state.label}
        </option>
      ))}
    </select>
  );

  const categoryLabel = INVENTORY_CATEGORIES.find((c) => c.value === categoryFilter)?.label;
  const stateLabel = INVENTORY_STATES.find((s) => s.value === stateFilter)?.label;

  return (
    <div className="flex h-full min-h-0 flex-col bg-white">
      {/* Fixed header: count + search */}
      <div className="shrink-0 border-b border-sand-line bg-white px-5 py-3 sm:px-6">
        <div className="flex items-center gap-2">
          <Boxes className="h-4 w-4 shrink-0 text-ember" />
          <h2 className="text-sm font-bold text-bark md:hidden">Church Property</h2>
          <span className="text-[11px] text-moss">
            {inventory.length} {inventory.length === 1 ? "item" : "items"} registered
          </span>
        </div>
        <div className="mt-2 flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-moss" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by name, tag or location..."
              className="w-full rounded-full border border-sand-mute bg-white py-1.5 pl-9 pr-3 text-xs text-bark placeholder:text-moss outline-none focus:border-ember"
            />
          </div>
          {/* Mobile popover */}
          <div className="sm:hidden">
            <FilterPopover
              title="Property filters"
              summary={categoryLabel || stateLabel || "All items"}
              active={categoryFilter !== "all" || stateFilter !== "all"}
            >
              <FilterSet label="Category">{categoryControl}</FilterSet>
              <FilterSet label="Condition">{stateControl}</FilterSet>
            </FilterPopover>
          </div>
          {/* Desktop inline controls */}
          <div className="hidden shrink-0 items-center gap-2 sm:flex">
            <div className="w-40">{categoryControl}</div>
            <div className="w-40">{stateControl}</div>
          </div>
        </div>
      </div>

      {/* Scrolling item list */}
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-3 pb-2 custom-table-scrollbar sm:px-6">
        <RecordList
          rows={filteredInventory}
          loading={loading}
          rowKey={(item) => item.id}
          headers={[
            { label: "Tag / Serial", className: "w-28" },
            { label: "Property" },
            { label: "Category" },
            { label: "Location / Room" },
            { label: "Qty", className: "text-center" },
            { label: "Condition" },
            { label: "Custody" },
          ]}
          loadingLabel="Loading the property register..."
          tableEmpty={emptyMessage}
          cardsEmpty={
            inventory.length === 0
              ? "No property items registered yet."
              : "No property items match these filters."
          }
          renderRow={(item) => (
            <tr key={item.id} className="hover:bg-sand">
              <td className={rowPad + " font-mono font-bold text-ember"}>
                {item.tag_number || "—"}
              </td>
              <td className={rowPad}>
                <p className="font-bold text-bark">{item.name}</p>
                {item.notes && <p className="text-[11px] italic text-moss">{item.notes}</p>}
              </td>
              <td className={rowPad}>
                <span className="rounded-md bg-sand-grain px-2 py-0.5 text-[10px] font-bold text-bark">
                  {item.category_display}
                </span>
              </td>
              <td className={rowPad + " text-moss"}>{item.location || "—"}</td>
              <td className={rowPad + " text-center font-bold text-bark"}>{item.quantity}</td>
              <td className={rowPad}>{inventoryStateBadge(item)}</td>
              <td className={rowPad + " text-moss"}>{custodyCell(item)}</td>
            </tr>
          )}
          renderCard={(item) => (
            <div
              key={item.id}
              className="space-y-2 rounded-2xl border border-sand-line bg-white p-4 shadow-sm"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-mono text-[11px] font-bold text-ember">
                    {item.tag_number || "No tag"}
                  </p>
                  <h3 className="text-sm font-bold text-bark">{item.name}</h3>
                </div>
                <div className="shrink-0">{inventoryStateBadge(item)}</div>
              </div>
              <div className="grid grid-cols-2 gap-1 text-xs text-moss">
                <p>
                  <span className="font-semibold text-bark">Category:</span>{" "}
                  {item.category_display}
                </p>
                <p>
                  <span className="font-semibold text-bark">Qty:</span> {item.quantity}
                </p>
                <p className="col-span-2">
                  <span className="font-semibold text-bark">Location:</span>{" "}
                  {item.location || "—"}
                </p>
                <p className="col-span-2">
                  <span className="font-semibold text-bark">Custody:</span>{" "}
                  {custodyCell(item)}
                </p>
              </div>
              {item.notes && <p className="text-[11px] italic text-moss">{item.notes}</p>}
            </div>
          )}
        />
      </div>

      {/* Footer: filter summary */}
      {!loading && filteredInventory.length !== inventory.length && (
        <div className="shrink-0 border-t border-sand-line bg-white px-5 py-2 sm:px-6">
          <p className="text-[11px] text-moss">
            Showing {filteredInventory.length} of {inventory.length}{" "}
            {inventory.length === 1 ? "item" : "items"}
          </p>
        </div>
      )}
    </div>
  );
}

export default function ChurchPropertyPage() {
  return <ChurchPropertyPanel />;
}
