"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { usePageHeader } from "@/components/app-frame";
import {
  AlertTriangle,
  ArrowRightLeft,
  Boxes,
  CheckCircle2,
  Clock,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { RecordList } from "./record-list";
import { densityCellPad } from "@/lib/table-density";
import { BackToOverviewArrow } from "@/components/back-to-overview-arrow";
import { FilterPopover, FilterSet } from "@/components/filter-popover";
import { DepartmentAccountsPanel, DepartmentHub } from "./department-hub";
import { showAlert } from "@/lib/alerts";
import { brand } from "@/lib/brand";
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
type MovementAction = "check_out" | "check_in" | "state_change";

/** One row of the property register, as the API hands it over. */
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
  last_inspected_on: string | null;
  movement_count: number;
  created_at: string;
}

/** One line of the duty rota, as the API keeps it. */
interface RotaEntry {
  id: number;
  title: string;
  date: string;
  shift: string;
  duty_type: string;
  assigned_team: string[];
}

const emptyItemForm = {
  name: "",
  tagNo: "",
  category: "general" as InventoryCategory,
  location: "Main Sanctuary",
  quantity: 1,
  state: "good" as InventoryState,
  notes: "",
};

const emptyMovementForm = {
  action: "check_out" as MovementAction,
  movedBy: "",
  destination: "",
  stateChange: "good" as InventoryState,
  notes: "",
};

const emptyRotaForm = {
  title: "",
  date: "",
  shift: "08:30 AM - 01:00 PM",
  dutyType: "Ushering",
  assignedTeam: "",
};

/** Authenticated JSON call against the members API. */
async function apiFetch(path: string, init?: RequestInit) {
  const token = typeof window === "undefined" ? null : localStorage.getItem("access_token");
  return fetch(`${API_URL}/api/members${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
  });
}

/** The first validation message in a DRF error body, so alerts say what broke. */
function firstErrorMessage(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "";
  for (const value of Object.values(payload as Record<string, unknown>)) {
    if (typeof value === "string") return value;
    if (Array.isArray(value) && value.length > 0) return String(value[0]);
  }
  return "";
}

/** Condition badge shared by the table row and the phone card. */
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

/**
 * Who holds an item, and since when.
 *
 * The custody reading is spans rather than paragraphs because the phone card
 * shows it inside a grid cell beside its label, and a paragraph inside a
 * paragraph is not markup the browser will keep — it split the card and
 * forfeited the island on the way in (the register's own hydration error).
 */
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

interface DeaconateManagerProps {
  initialTab?: "inventory" | "rota" | "members" | "calendar" | "funding" | "accounts";
  /**
   * The desk is read under a strip someone else draws — the area desk on the
   * Ministry map, whose toggles name these same five pages. Its panels then
   * carry no way back of their own (the shell's heading already has one) and
   * the Team view hands the roll the caller's own back handler, so "Back"
   * leads where the reader came from rather than to the console's overview.
   */
  embedded?: boolean;
  /** Where the Team view's way out leads; the console's overview by default. */
  onBack?: () => void;
}

export function DeaconateManager({ initialTab = "inventory", embedded = false, onBack }: DeaconateManagerProps) {
  // The shell's section strip owns which deaconate page is open, so the tab
  // comes straight from the URL instead of a second, in-page copy that can drift.
  const activeTab = initialTab;

  // Inventory state (server-backed: this is the real property register)
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [loadingInventory, setLoadingInventory] = useState(true);
  const rowPad = densityCellPad();
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [stateFilter, setStateFilter] = useState<string>("all");
  const [saving, setSaving] = useState(false);

  // Modals
  const [showAddModal, setShowAddModal] = useState(false);
  const [showMovementModal, setShowMovementModal] = useState(false);
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);
  // The desk's ask of the office: to buy an item, or to repair one. Raised
  // by the desk's leadership, answered at the requests desk.
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [requestKind, setRequestKind] = useState<"buy" | "repair">("buy");
  const [requestItem, setRequestItem] = useState("");
  const [requestNote, setRequestNote] = useState("");
  const [sendingRequest, setSendingRequest] = useState(false);

  const [newItem, setNewItem] = useState(emptyItemForm);
  const [movementForm, setMovementForm] = useState(emptyMovementForm);

  // Row actions menu
  const [openActionMenuId, setOpenActionMenuId] = useState<number | null>(null);
  const [actionDropUp, setActionDropUp] = useState(false);

  // Duty rota (server-backed: this is the church's record of who serves when)
  const [rota, setRota] = useState<RotaEntry[]>([]);
  const [loadingRota, setLoadingRota] = useState(true);
  const [showAddRotaModal, setShowAddRotaModal] = useState(false);
  const [newRota, setNewRota] = useState(emptyRotaForm);
  const [savingRota, setSavingRota] = useState(false);
  const [removingRotaId, setRemovingRotaId] = useState<number | null>(null);

  const loadInventory = async () => {
    setLoadingInventory(true);
    try {
      const res = await apiFetch("/inventory/");
      if (!res.ok) {
        setInventory([]);
        showAlert("Could not load the inventory", firstErrorMessage(await res.json().catch(() => null)) || "The property register could not be loaded.", "error");
        return;
      }
      setInventory(await res.json());
    } catch {
      setInventory([]);
      showAlert("Could not load the inventory", "Check your connection and try again.", "error");
    } finally {
      setLoadingInventory(false);
    }
  };

  useEffect(() => {
    loadInventory();
  }, []);

  /**
   * The rota the church keeps, earliest duty first — or null when the desk
   * could not be read (offline, a refused session).
   *
   * Reading and writing the desk's state are kept apart on purpose: the effect
   * below settles what it fetched from the promise's own callback, the way the
   * shell reads the day's word, rather than writing state while the effect runs.
   */
  const fetchRota = async (): Promise<RotaEntry[] | null> => {
    try {
      const res = await apiFetch("/duty-rota/");
      if (!res.ok) return null;
      return (await res.json()) as RotaEntry[];
    } catch {
      return null;
    }
  };

  /** A read the desk asked for — after scheduling a duty, or removing one. */
  const loadRota = async () => {
    setLoadingRota(true);
    const rows = await fetchRota();
    setRota(rows ?? []);
    setLoadingRota(false);
    if (rows === null) {
      showAlert("Could not load the duty rota", "Check your connection and try again.", "error");
    }
  };

  // The rota is read when its tab is opened, not with the whole desk: the
  // deaconate console mounts on every one of its pages, and the register is
  // what most visits are here for.
  useEffect(() => {
    if (activeTab !== "rota") return;
    let alive = true;
    void fetchRota().then((rows) => {
      if (!alive) return;
      setRota(rows ?? []);
      setLoadingRota(false);
      if (rows === null) {
        showAlert("Could not load the duty rota", "Check your connection and try again.", "error");
      }
    });
    return () => {
      alive = false;
    };
  }, [activeTab]);

  const { setHeaderRightAction } = usePageHeader();
  const router = useRouter();
  useEffect(() => {
    if (activeTab !== "inventory") return;
    // The two filters, written once and shown twice: inside the phone's
    // popover, and in the open beside the search on a wide screen.
    const filterCls = "w-full rounded-full border border-sand-mute bg-white px-3 py-1.5 text-xs font-semibold text-bark focus:border-ember focus:outline-none";
    const categoryControl = (
      <select
        value={categoryFilter}
        onChange={(e) => setCategoryFilter(e.target.value)}
        className={filterCls}
        aria-label="Property category filter"
      >
        <option value="all">All categories</option>
        {INVENTORY_CATEGORIES.map((category) => (
          <option key={category.value} value={category.value}>{category.label}</option>
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
          <option key={state.value} value={state.value}>{state.label}</option>
        ))}
      </select>
    );
    const categoryLabel = INVENTORY_CATEGORIES.find((c) => c.value === categoryFilter)?.label;
    const stateLabel = INVENTORY_STATES.find((s) => s.value === stateFilter)?.label;
    setHeaderRightAction(
      <div className="flex w-full items-center gap-2 sm:w-auto">
        <div className="relative min-w-0 flex-1 sm:w-56 sm:flex-none">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-moss" />
          <input
            type="text"
            placeholder="Search item, tag, room..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-full border border-sand-mute bg-white py-1.5 pl-9 pr-3 text-xs outline-none focus:border-ember"
          />
        </div>
        {/* The phone: both filters behind one button beside the search. */}
        <FilterPopover
          title="Property filters"
          summary={categoryLabel || stateLabel || "All items"}
          active={categoryFilter !== "all" || stateFilter !== "all"}
        >
          <FilterSet label="Category">{categoryControl}</FilterSet>
          <FilterSet label="Condition">{stateControl}</FilterSet>
        </FilterPopover>
        {/* The wider screens: both filters in the open. */}
        <div className="hidden shrink-0 items-center gap-2 sm:flex">
          <div className="w-40">{categoryControl}</div>
          <div className="w-40">{stateControl}</div>
        </div>
      </div>
    );
    return () => setHeaderRightAction(null);
  }, [activeTab, searchQuery, categoryFilter, stateFilter, setHeaderRightAction]);

  // Close the row actions menu when the press lands anywhere else. The open
  // menu is found by a marker on its own wrapper, not by a ref — the table row
  // and the phone card both render, and a single ref only attaches to whichever
  // mounted last, so a press on the other surface closed the menu before its
  // click could land (the roster and treasury had the same bug).
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Element | null;
      if (target?.closest?.("[data-action-menu]")) return;
      setOpenActionMenuId(null);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const toggleActionMenu = (id: number, el: HTMLElement | null) => {
    if (openActionMenuId === id) {
      setOpenActionMenuId(null);
      return;
    }
    // Open upward near the bottom of the viewport so the popup is not clipped
    // by the scrolling rows area or hidden behind the bottom bar.
    if (el) {
      setActionDropUp(window.innerHeight - el.getBoundingClientRect().bottom < 200);
    }
    setOpenActionMenuId(id);
  };

  const filteredInventory = useMemo(
    () =>
      inventory.filter((item) => {
        const query = searchQuery.trim().toLowerCase();
        const matchesSearch =
          !query ||
          item.name.toLowerCase().includes(query) ||
          item.tag_number.toLowerCase().includes(query) ||
          item.location.toLowerCase().includes(query);
        const matchesCategory = categoryFilter === "all" || item.category === categoryFilter;
        const matchesState = stateFilter === "all" || item.state === stateFilter;
        return matchesSearch && matchesCategory && matchesState;
      }),
    [inventory, searchQuery, categoryFilter, stateFilter]
  );

  const registerItem = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = newItem.name.trim();
    if (!name || saving) return;

    setSaving(true);
    try {
      const res = await apiFetch("/inventory/", {
        method: "POST",
        body: JSON.stringify({
          name,
          tag_number: newItem.tagNo.trim(),
          category: newItem.category,
          location: newItem.location.trim(),
          quantity: Math.max(1, Number(newItem.quantity) || 1),
          state: newItem.state,
          notes: newItem.notes.trim(),
        }),
      });
      if (!res.ok) {
        showAlert("Property not saved", firstErrorMessage(await res.json().catch(() => null)) || "The item could not be registered.", "error");
        return;
      }
      setShowAddModal(false);
      setNewItem(emptyItemForm);
      await loadInventory();
      showAlert("Property Added", `"${name}" has been registered in the inventory.`, "success");
    } catch {
      showAlert("Property not saved", "Check your connection and try again.", "error");
    } finally {
      setSaving(false);
    }
  };

  const recordMovement = async (e: React.FormEvent) => {
    e.preventDefault();
    const movedBy = movementForm.movedBy.trim();
    if (!selectedItem || !movedBy || saving) return;

    setSaving(true);
    try {
      const res = await apiFetch(`/inventory/${selectedItem.id}/movements/`, {
        method: "POST",
        body: JSON.stringify({
          action: movementForm.action,
          moved_by: movedBy,
          destination: movementForm.destination.trim(),
          state_after: movementForm.action === "state_change" ? movementForm.stateChange : "",
          notes: movementForm.notes.trim(),
        }),
      });
      if (!res.ok) {
        showAlert("Movement not recorded", firstErrorMessage(await res.json().catch(() => null)) || "The movement could not be recorded.", "error");
        return;
      }
      const itemName = selectedItem.name;
      setShowMovementModal(false);
      setSelectedItem(null);
      setMovementForm(emptyMovementForm);
      await loadInventory();
      showAlert("Movement Recorded", `Status updated for "${itemName}".`, "success");
    } catch {
      showAlert("Movement not recorded", "Check your connection and try again.", "error");
    } finally {
      setSaving(false);
    }
  };

  /** Raise a buy/repair ask of the office; the desk's leadership only —
      the endpoint refuses anyone else, so the button rides for managers. */
  const sendPropertyRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    const item = requestItem.trim();
    if (item.length < 2 || sendingRequest) return;
    setSendingRequest(true);
    try {
      const res = await apiFetch("/deaconate-requests/", {
        method: "POST",
        body: JSON.stringify({ kind: requestKind, item_name: item, note: requestNote.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showAlert("Request not sent", data.detail || firstErrorMessage(data) || "The request could not be sent.", "error");
        return;
      }
      setShowRequestModal(false);
      setRequestItem("");
      setRequestNote("");
      setRequestKind("buy");
      showAlert("Request sent", data.detail || "The office has your property request.", "success");
    } catch {
      showAlert("Request not sent", "Check your connection and try again.", "error");
    } finally {
      setSendingRequest(false);
    }
  };

  const scheduleRota = async (e: React.FormEvent) => {
    e.preventDefault();
    const title = newRota.title.trim();
    if (!title || !newRota.date || savingRota) return;

    const teamList = newRota.assignedTeam
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);

    setSavingRota(true);
    try {
      const res = await apiFetch("/duty-rota/", {
        method: "POST",
        body: JSON.stringify({
          title,
          date: newRota.date,
          shift: newRota.shift.trim(),
          duty_type: newRota.dutyType,
          // An unstaffed line stays unstaffed: the desk often writes the rota
          // before the team is settled, and "Deacon Board" invented here
          // would be the app rostering people the church never named.
          assigned_team: teamList,
        }),
      });
      if (!res.ok) {
        showAlert("Duty rota not saved", firstErrorMessage(await res.json().catch(() => null)) || "The duty could not be scheduled.", "error");
        return;
      }
      setShowAddRotaModal(false);
      setNewRota(emptyRotaForm);
      await loadRota();
      showAlert("Duty Rota Added", `"${title}" scheduled for ${dayFirst(newRota.date)}.`, "success");
    } catch {
      showAlert("Duty rota not saved", "Check your connection and try again.", "error");
    } finally {
      setSavingRota(false);
    }
  };

  /**
   * Take a duty off the rota: the Sabbath whose service was called off, or a
   * line the desk wrote twice. Only the rota line goes — the property register
   * and the ordinances are other records entirely.
   */
  const removeRota = async (entry: RotaEntry) => {
    const result = await showAlert(
      "Remove this duty?",
      `"${entry.title}" on ${dayFirst(entry.date)} leaves the rota for good.`,
      "warning",
      {
        showCancelButton: true,
        confirmButtonText: "Remove",
        cancelButtonText: "Keep",
        confirmButtonColor: brand.ember,
      },
    );
    if (!result.isConfirmed) return;
    setRemovingRotaId(entry.id);
    try {
      const res = await apiFetch(`/duty-rota/${entry.id}/`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showAlert("Could not remove it", data.detail || "Try again.", "error");
        return;
      }
      setRota((prev) => prev.filter((row) => row.id !== entry.id));
      showAlert("Duty removed", data.detail || "It is off the rota.", "success", {
        toast: true,
        timer: 3500,
        showConfirmButton: false,
      });
    } catch {
      showAlert("Network error", "Could not reach the server.", "error");
    } finally {
      setRemovingRotaId(null);
    }
  };

  // The way out of a panel, on a phone: the console's own arrow where these
  // are pages of the console, and the caller's destination where the desk was
  // opened somewhere else — the Ministry map, whose own heading carries no way
  // out once a panel sits under it.
  const backArrow = embedded ? (
    onBack ? <BackToOverviewArrow onClick={onBack} label="Back to the ministry map" /> : null
  ) : (
    <BackToOverviewArrow />
  );

  const inventoryEmpty = inventory.length === 0
    ? "No property items registered yet. Use Add Church Property to record the first one."
    : "No property items match these filters.";

  return (
    <div className="flex h-full min-h-0 flex-col bg-white">
      {/* ── INVENTORY: fixed filters on top, scrolling rows, fixed actions below ── */}
      {activeTab === "inventory" && (
        <>
          <div className="shrink-0 border-b border-sand-line bg-white px-5 py-3 sm:px-6">
            <div className="flex items-center gap-2">
              {backArrow}
              <Boxes className="h-4 w-4 shrink-0 text-ember" />
              {/* Named by the strip above on a wide screen. */}
              <h2 className="text-sm font-bold text-bark md:hidden">Property Inventory</h2>
              <span className="text-[11px] text-moss">
                {inventory.length} {inventory.length === 1 ? "item" : "items"} registered
              </span>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto min-h-0 px-5 py-3 pb-2 custom-table-scrollbar sm:px-6">
            {/* Table on desktop, cards on phones — RecordList owns the breakpoint pair. */}
            <RecordList
              rows={filteredInventory}
              loading={loadingInventory}
              rowKey={(item) => item.id}
              headers={[
                { label: "Tag / Serial", className: "w-28" },
                { label: "Property" },
                { label: "Category" },
                { label: "Location / Room" },
                { label: "Qty", className: "text-center" },
                { label: "Condition" },
                { label: "Custody" },
                { label: "Actions", className: "text-right" },
              ]}
              loadingLabel="Loading the property register..."
              tableEmpty={inventoryEmpty}
              cardsEmpty={inventory.length === 0 ? "No property items registered yet." : "No property items match these filters."}
              renderRow={(item) => (
                <tr key={item.id} className="hover:bg-sand">
                  <td className={rowPad + " font-mono font-bold text-ember"}>{item.tag_number || "—"}</td>
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
                  <td className={rowPad + " text-right"}>
                    <div className="relative inline-block" data-action-menu>
                      <button
                        onClick={(e) => toggleActionMenu(item.id, e.currentTarget)}
                        className="rounded-lg border border-sand-mute bg-white px-3 py-1.5 text-xs font-semibold text-bark transition hover:border-ember hover:bg-sand"
                      >
                        ⋯ Actions
                      </button>
                      {openActionMenuId === item.id && (
                        <div className={`absolute right-0 z-50 w-48 rounded-xl border border-sand-line bg-white py-1 shadow-lg ${actionDropUp ? "bottom-full mb-1" : "mt-1"}`}>
                          <button
                            onClick={() => {
                              setSelectedItem(item);
                              setMovementForm(emptyMovementForm);
                              setShowMovementModal(true);
                              setOpenActionMenuId(null);
                            }}
                            className="flex w-full items-center gap-2 px-4 py-2 text-xs text-bark hover:bg-sand"
                          >
                            <ArrowRightLeft className="h-3.5 w-3.5 text-ember" />
                            Item Movement
                          </button>
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              )}
              renderCard={(item) => (
                <div key={item.id} className={`rounded-2xl border border-sand-line bg-white shadow-sm space-y-2 ${"p-4"}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-mono text-[11px] font-bold text-ember">{item.tag_number || "No tag"}</p>
                      <h3 className="font-bold text-sm text-bark">{item.name}</h3>
                    </div>
                    <div className="shrink-0">{inventoryStateBadge(item)}</div>
                  </div>
                  <div className="grid grid-cols-2 gap-1 text-xs text-moss">
                    <p><span className="font-semibold text-bark">Category:</span> {item.category_display}</p>
                    <p><span className="font-semibold text-bark">Qty:</span> {item.quantity}</p>
                    <p className="col-span-2"><span className="font-semibold text-bark">Location:</span> {item.location || "—"}</p>
                    <p className="col-span-2"><span className="font-semibold text-bark">Custody:</span> {custodyCell(item)}</p>
                  </div>
                  {item.notes && <p className="text-[11px] italic text-moss">{item.notes}</p>}
                  <div className="flex flex-wrap gap-2 border-t border-sand-line/60 pt-2">
                    <button
                      onClick={() => {
                        setSelectedItem(item);
                        setMovementForm(emptyMovementForm);
                        setShowMovementModal(true);
                      }}
                      className="inline-flex items-center gap-1 rounded-lg border border-sand-mute bg-white px-3 py-1.5 text-[11px] font-semibold text-bark hover:bg-sand"
                    >
                      <ArrowRightLeft className="h-3 w-3 text-ember" />
                      Item Movement
                    </button>
                  </div>
                </div>
              )}
            />
          </div>

          {/* ── Bottom bar: count + primary action, like every other table page ── */}
          <div className="shrink-0 border-t border-sand-line bg-white p-4 sm:px-6 sm:py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <p className="hidden text-[11px] text-moss sm:block">
              {filteredInventory.length} of {inventory.length} {inventory.length === 1 ? "item" : "items"} shown
            </p>
            <div className="flex items-center justify-between gap-2 w-full sm:w-auto">
              <button
                onClick={() => setShowRequestModal(true)}
                className="rounded-xl border border-ember bg-white px-3 py-2 text-xs font-semibold text-ember transition hover:bg-sand"
              >
                Send request
              </button>
              <button
                onClick={() => { setNewItem(emptyItemForm); setShowAddModal(true); }}
                className="flex-1 sm:flex-none rounded-xl bg-bark px-3 py-2 text-xs font-semibold text-white transition hover:bg-ember"
              >
                + Add Church Property
              </button>
            </div>
          </div>
        </>
      )}

      {/* ── TAB: DUTY ROTA (session-only until the rota has a backend) ── */}
      {activeTab === "rota" && (
        <div className="flex-1 overflow-y-auto min-h-0 p-4 sm:p-6 space-y-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            {/* Named by the strip above on a wide screen. */}
            <div className="md:hidden">
              <h2 className="text-base font-bold text-bark">Deacon &amp; Deaconess Duty Rota</h2>
              <p className="text-xs text-moss">Sabbath &amp; midweek service duty rosters, communion preparation team assignments.</p>
            </div>
            <button
              onClick={() => setShowAddRotaModal(true)}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-bark px-4 py-2 text-xs font-bold text-white shadow transition hover:bg-bark-950"
            >
              <Plus className="h-4 w-4" />
              Schedule Duty Rota
            </button>
          </div>

          {loadingRota ? (
            <div className="rounded-2xl border border-sand-line bg-white p-8 text-center text-xs text-moss shadow-sm">
              Loading the duty rota…
            </div>
          ) : rota.length === 0 ? (
            <div className="rounded-2xl border border-sand-line bg-white p-8 text-center text-xs text-moss shadow-sm">
              No duty rota has been scheduled yet.
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {rota.map((item) => (
                <div key={item.id} className="rounded-2xl border border-sand-line bg-white p-5 shadow-sm space-y-3">
                  <div className="flex items-center justify-between border-b border-sand-line pb-3">
                    {item.duty_type ? (
                      <span className="rounded-full bg-sand-film px-2.5 py-0.5 text-[10px] font-bold text-ember">
                        {item.duty_type}
                      </span>
                    ) : (
                      <span />
                    )}
                    <span className="text-[11px] font-bold text-bark">{dayFirst(item.date)}</span>
                  </div>
                  <h3 className="font-bold text-sm text-bark">{item.title}</h3>
                  <p className="text-xs text-moss flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5 text-ember" />
                    {item.shift || "Time not set"}
                  </p>

                  <div>
                    <p className="text-[11px] font-bold text-bark mb-1">Assigned Officers:</p>
                    {item.assigned_team.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {item.assigned_team.map((member, idx) => (
                          <span key={idx} className="rounded-lg border border-sand-line bg-sand-card px-2 py-0.5 text-[10px] font-semibold text-bark">
                            {member}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p className="text-[11px] text-moss">Nobody rostered yet.</p>
                    )}
                  </div>

                  <div className="flex justify-end border-t border-sand-line/60 pt-2">
                    <button
                      type="button"
                      onClick={() => removeRota(item)}
                      disabled={removingRotaId === item.id}
                      aria-label={`Remove the duty "${item.title}"`}
                      title="Remove this duty from the rota"
                      className="inline-flex items-center gap-1 rounded-lg border border-sand-line bg-white px-2.5 py-1.5 text-[11px] font-semibold text-moss transition hover:border-red-300 hover:text-red-600 disabled:opacity-50"
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                      {removingRotaId === item.id ? "Removing…" : "Remove"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── TAB: DEACONATE TEAM ── */}
      {/* The whole department machinery, pointed at the deaconate: the Head
          Deacon and Head Deaconess lead the page as the department's board,
          the roll reads the same endpoint every other desk reads, and Add
          member — batch picking included — works exactly as the other
          departments' rolls do. The way out of the opened area leads back to
          the administration overview, the same place every other tab's back
          arrow goes — the desk's own directory has no place here. */}
      {activeTab === "members" && (
        <DepartmentHub
          initialDept="deaconate"
          embedded={embedded}
          onBack={
            onBack ?? (() => router.replace("/administration?tab=overview", { scroll: false }))
          }
        />
      )}

      {/* ── TAB: CALENDAR & ORDINANCES ── */}
      {activeTab === "calendar" && (
        <div className="flex-1 overflow-y-auto min-h-0 p-4 sm:p-6 space-y-6">
          <div className="flex items-center gap-1">
            {backArrow}
            {/* Named by the strip above on a wide screen. */}
            <div className="md:hidden">
              <h2 className="text-base font-bold text-bark">Deaconate Ordinances &amp; Event Schedule</h2>
              <p className="text-xs text-moss">Communion services, foot washing setup, baptism preparations, and sanctuary maintenance.</p>
            </div>
          </div>
          <div className="rounded-2xl border border-sand-line bg-white p-8 text-center text-xs text-moss shadow-sm">
            No deaconate events have been recorded yet.
          </div>
        </div>
      )}

      {/* ── TAB: FUNDING & ACCOUNTS ── */}
      {(activeTab === "funding" || activeTab === "accounts") && (
        <div className="flex-1 overflow-y-auto min-h-0 p-4 sm:p-6 space-y-6 custom-hover-scrollbar">
          <div className="flex items-center gap-1">
            {backArrow}
            <div className="md:hidden">
              <h2 className="text-base font-bold text-bark">Deaconate Funding &amp; Accounts</h2>
              <p className="text-xs text-moss">Local Church Budget allocations, transactions ledger, and funding requests.</p>
            </div>
          </div>
          <DepartmentAccountsPanel
            department={{ code: "deaconate", label: "Deaconate" }}
            onChanged={() => {}}
            search=""
          />
        </div>
      )}

      {/* MODAL: SEND PROPERTY REQUEST (buy / repair) */}
      {showRequestModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl border border-sand-line bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between border-b border-sand-line pb-3">
              <h3 className="font-bold text-base text-bark">Send a Property Request</h3>
              <button onClick={() => setShowRequestModal(false)} className="text-moss hover:text-bark">
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="mt-2 text-[11px] text-moss">
              Ask the offices to buy an item or to repair one. The answer comes back to the desk.
            </p>
            <form onSubmit={sendPropertyRequest} className="mt-4 space-y-4 text-xs">
              <div>
                <label className="font-bold text-bark">Request type</label>
                <div className="mt-1 grid grid-cols-2 gap-2">
                  {([
                    { value: "buy", label: "Buy an item" },
                    { value: "repair", label: "Repair an item" },
                  ] as const).map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setRequestKind(option.value)}
                      aria-pressed={requestKind === option.value}
                      className={`rounded-xl px-3 py-2 text-xs font-semibold transition ${
                        requestKind === option.value
                          ? "bg-bark text-white shadow-sm"
                          : "border border-sand-line bg-white text-moss hover:border-ember hover:text-bark"
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="font-bold text-bark">Item *</label>
                <input
                  type="text"
                  required
                  minLength={2}
                  placeholder={requestKind === "repair" ? "e.g. Sony Projector 4K, the sanctuary one" : "e.g. Two cordless microphones"}
                  value={requestItem}
                  onChange={(e) => setRequestItem(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-sand-line p-2.5 font-medium text-bark"
                />
              </div>
              <div>
                <label className="font-bold text-bark">Details</label>
                <textarea
                  rows={3}
                  placeholder="What is needed and why: quantity, quote, room…"
                  value={requestNote}
                  onChange={(e) => setRequestNote(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-sand-line p-2.5 text-xs text-bark"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowRequestModal(false)}
                  className="rounded-xl border border-sand-line px-4 py-2 font-semibold text-moss transition hover:bg-sand"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={sendingRequest || requestItem.trim().length < 2}
                  className="rounded-xl bg-ember px-4 py-2 font-semibold text-white transition hover:bg-ember-dark disabled:opacity-50"
                >
                  {sendingRequest ? "Sending..." : "Send request"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: ADD PROPERTY ITEM */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl border border-sand-line bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between border-b border-sand-line pb-3">
              <h3 className="font-bold text-base text-bark">Register Church Property</h3>
              <button onClick={() => setShowAddModal(false)} className="text-moss hover:text-bark">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={registerItem} className="mt-4 space-y-4 text-xs">
              <div>
                <label className="font-bold text-bark">Property Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Sony Projector 4K"
                  value={newItem.name}
                  onChange={(e) => setNewItem({ ...newItem, name: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-sand-line p-2.5 font-medium text-bark"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-bark">Tag / Serial No.</label>
                  <input
                    type="text"
                    placeholder="AV-PRJ-01"
                    value={newItem.tagNo}
                    onChange={(e) => setNewItem({ ...newItem, tagNo: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-sand-line p-2.5 font-medium text-bark"
                  />
                </div>
                <div>
                  <label className="font-bold text-bark">Category</label>
                  <select
                    value={newItem.category}
                    onChange={(e) => setNewItem({ ...newItem, category: e.target.value as InventoryCategory })}
                    className="mt-1 w-full rounded-xl border border-sand-line p-2.5 font-semibold text-bark"
                  >
                    {INVENTORY_CATEGORIES.map((category) => (
                      <option key={category.value} value={category.value}>{category.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-bark">Room / Location</label>
                  <input
                    type="text"
                    placeholder="Sanctuary PA Booth"
                    value={newItem.location}
                    onChange={(e) => setNewItem({ ...newItem, location: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-sand-line p-2.5 font-medium text-bark"
                  />
                </div>
                <div>
                  <label className="font-bold text-bark">Quantity</label>
                  <input
                    type="number"
                    min={1}
                    value={newItem.quantity}
                    onChange={(e) => setNewItem({ ...newItem, quantity: Number(e.target.value) })}
                    className="mt-1 w-full rounded-xl border border-sand-line p-2.5 font-medium text-bark"
                  />
                </div>
              </div>

              <div>
                <label className="font-bold text-bark">Condition / Initial State</label>
                <select
                  value={newItem.state}
                  onChange={(e) => setNewItem({ ...newItem, state: e.target.value as InventoryState })}
                  className="mt-1 w-full rounded-xl border border-sand-line p-2.5 font-semibold text-bark"
                >
                  {INVENTORY_STATES.map((state) => (
                    <option key={state.value} value={state.value}>{state.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="font-bold text-bark">Notes / Inspection Remarks</label>
                <textarea
                  rows={2}
                  placeholder="Additional details..."
                  value={newItem.notes}
                  onChange={(e) => setNewItem({ ...newItem, notes: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-sand-line p-2.5 text-xs text-bark"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="rounded-xl border border-sand-line px-4 py-2 text-xs font-bold text-bark"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-xl bg-bark px-4 py-2 text-xs font-bold text-white shadow disabled:opacity-60"
                >
                  {saving ? "Saving..." : "Save Property Item"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: ITEM MOVEMENT */}
      {showMovementModal && selectedItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl border border-sand-line bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between border-b border-sand-line pb-3">
              <div>
                <h3 className="font-bold text-base text-bark">Log Item Movement &amp; State</h3>
                <p className="text-xs text-ember font-semibold">
                  {selectedItem.name}{selectedItem.tag_number ? ` (${selectedItem.tag_number})` : ""}
                </p>
              </div>
              <button onClick={() => setShowMovementModal(false)} className="text-moss hover:text-bark">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={recordMovement} className="mt-4 space-y-4 text-xs">
              <div>
                <label className="font-bold text-bark">Action Type</label>
                <select
                  value={movementForm.action}
                  onChange={(e) => setMovementForm({ ...movementForm, action: e.target.value as MovementAction })}
                  className="mt-1 w-full rounded-xl border border-sand-line p-2.5 font-semibold text-bark"
                >
                  <option value="check_out">Check Out for Event/Department</option>
                  <option value="check_in">Check In to Store</option>
                  <option value="state_change">Update Condition/State</option>
                </select>
              </div>

              <div>
                <label className="font-bold text-bark">Officer / Person Responsible *</label>
                <input
                  type="text"
                  required
                  placeholder="Deacon Name or Department"
                  value={movementForm.movedBy}
                  onChange={(e) => setMovementForm({ ...movementForm, movedBy: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-sand-line p-2.5 text-xs text-bark"
                />
              </div>

              <div>
                <label className="font-bold text-bark">Destination / Location</label>
                <input
                  type="text"
                  placeholder="e.g. Youth Room / Fellowship Hall"
                  value={movementForm.destination}
                  onChange={(e) => setMovementForm({ ...movementForm, destination: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-sand-line p-2.5 text-xs text-bark"
                />
              </div>

              {movementForm.action === "state_change" && (
                <div>
                  <label className="font-bold text-bark">New State</label>
                  <select
                    value={movementForm.stateChange}
                    onChange={(e) => setMovementForm({ ...movementForm, stateChange: e.target.value as InventoryState })}
                    className="mt-1 w-full rounded-xl border border-sand-line p-2.5 font-semibold text-bark"
                  >
                    {INVENTORY_STATES.map((state) => (
                      <option key={state.value} value={state.value}>{state.label}</option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="font-bold text-bark">Movement Notes</label>
                <textarea
                  rows={2}
                  placeholder="Notes on movement or physical condition..."
                  value={movementForm.notes}
                  onChange={(e) => setMovementForm({ ...movementForm, notes: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-sand-line p-2.5 text-xs text-bark"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowMovementModal(false)}
                  className="rounded-xl border border-sand-line px-4 py-2 text-xs font-bold text-bark"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-xl bg-bark px-4 py-2 text-xs font-bold text-white shadow disabled:opacity-60"
                >
                  {saving ? "Recording..." : "Record Log"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: ADD DUTY ROTA */}
      {showAddRotaModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl border border-sand-line bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between border-b border-sand-line pb-3">
              <h3 className="font-bold text-base text-bark">Schedule Duty Rota</h3>
              <button onClick={() => setShowAddRotaModal(false)} className="text-moss hover:text-bark">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={scheduleRota} className="mt-4 space-y-4 text-xs">
              <div>
                <label className="font-bold text-bark">Duty Title *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Main Sanctuary Ushering Team A"
                  value={newRota.title}
                  onChange={(e) => setNewRota({ ...newRota, title: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-sand-line p-2.5 text-xs text-bark"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-bark">Date *</label>
                  <input
                    type="date"
                    required
                    value={newRota.date}
                    onChange={(e) => setNewRota({ ...newRota, date: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-sand-line p-2.5 text-xs text-bark"
                  />
                </div>
                <div>
                  <label className="font-bold text-bark">Duty Type</label>
                  <select
                    value={newRota.dutyType}
                    onChange={(e) => setNewRota({ ...newRota, dutyType: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-sand-line p-2.5 font-semibold text-bark"
                  >
                    <option value="Ushering">Ushering</option>
                    <option value="Communion Setup">Communion Setup</option>
                    <option value="Audio/PA">Audio/PA</option>
                    <option value="Security & Parking">Security &amp; Parking</option>
                    <option value="Sanctuary Care">Sanctuary Care</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="font-bold text-bark">Shift / Time</label>
                <input
                  type="text"
                  placeholder="08:30 AM - 01:00 PM"
                  value={newRota.shift}
                  onChange={(e) => setNewRota({ ...newRota, shift: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-sand-line p-2.5 text-xs text-bark"
                />
              </div>

              <div>
                <label className="font-bold text-bark">Assigned Officers (Comma-separated)</label>
                <input
                  type="text"
                  placeholder="Deacon David, Deaconess Sarah"
                  value={newRota.assignedTeam}
                  onChange={(e) => setNewRota({ ...newRota, assignedTeam: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-sand-line p-2.5 text-xs text-bark"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddRotaModal(false)}
                  className="rounded-xl border border-sand-line px-4 py-2 text-xs font-bold text-bark"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingRota}
                  className="rounded-xl bg-bark px-4 py-2 text-xs font-bold text-white shadow disabled:opacity-60"
                >
                  {savingRota ? "Saving…" : "Save Duty Rota"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
