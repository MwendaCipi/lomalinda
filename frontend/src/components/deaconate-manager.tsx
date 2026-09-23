"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowRightLeft,
  Boxes,
  CheckCircle2,
  Clock,
  Plus,
  Search,
  X,
} from "lucide-react";
import { RecordList } from "./record-list";
import { showAlert } from "@/lib/alerts";

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

/** Duty rota entries are session-only for now; the rota has no backend yet. */
interface RotaEntry {
  id: string;
  title: string;
  date: string;
  shift: string;
  dutyType: string;
  assignedTeam: string[];
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
            : "bg-[#ede8dc] text-[#617068]";
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-bold ${tone}`}>
      {item.state === "good" && <CheckCircle2 className="h-3 w-3" />}
      {item.state === "needs_repair" && <AlertTriangle className="h-3 w-3" />}
      {item.state === "in_use" && <Clock className="h-3 w-3" />}
      {item.state_display}
    </span>
  );
}

function custodyCell(item: InventoryItem) {
  if (!item.assigned_to) {
    return <span className="text-[#a1a1a1]">In Store</span>;
  }
  return (
    <div>
      <p className="font-semibold text-[#26352f]">{item.assigned_to}</p>
      {item.checked_out_at && (
        <p className="text-[10px]">Since {new Date(item.checked_out_at).toLocaleDateString()}</p>
      )}
    </div>
  );
}

interface DeaconateManagerProps {
  initialTab?: "inventory" | "rota" | "members" | "calendar";
}

export function DeaconateManager({ initialTab = "inventory" }: DeaconateManagerProps) {
  // The admin sidebar owns which deaconate panel is open, so the tab comes
  // straight from the URL instead of a second, in-page copy that can drift.
  const activeTab = initialTab;

  // Inventory state (server-backed: this is the real property register)
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [loadingInventory, setLoadingInventory] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [stateFilter, setStateFilter] = useState<string>("all");
  const [saving, setSaving] = useState(false);

  // Modals
  const [showAddModal, setShowAddModal] = useState(false);
  const [showMovementModal, setShowMovementModal] = useState(false);
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);

  const [newItem, setNewItem] = useState(emptyItemForm);
  const [movementForm, setMovementForm] = useState(emptyMovementForm);

  // Row actions menu
  const [openActionMenuId, setOpenActionMenuId] = useState<number | null>(null);
  const actionMenuRef = useRef<HTMLDivElement>(null);
  const [actionDropUp, setActionDropUp] = useState(false);

  // Duty rota (session-only until the rota gets a backend)
  const [rota, setRota] = useState<RotaEntry[]>([]);
  const [showAddRotaModal, setShowAddRotaModal] = useState(false);
  const [newRota, setNewRota] = useState(emptyRotaForm);

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

  // Close the row actions menu when the click lands anywhere else.
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (actionMenuRef.current && !actionMenuRef.current.contains(e.target as Node)) {
        setOpenActionMenuId(null);
      }
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

  const scheduleRota = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRota.title.trim() || !newRota.date) return;

    const teamList = newRota.assignedTeam
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);

    const entry: RotaEntry = {
      id: `ROT-${Date.now()}`,
      title: newRota.title.trim(),
      date: newRota.date,
      shift: newRota.shift,
      dutyType: newRota.dutyType,
      assignedTeam: teamList.length > 0 ? teamList : ["Deacon Board"],
    };

    setRota((prev) => [entry, ...prev]);
    setShowAddRotaModal(false);
    setNewRota(emptyRotaForm);
    showAlert("Duty Rota Added", `"${entry.title}" scheduled for ${entry.date}.`, "success");
  };

  const inventoryEmpty = inventory.length === 0
    ? "No property items registered yet. Use Add Church Property to record the first one."
    : "No property items match these filters.";

  return (
    <div className="flex h-full min-h-0 flex-col bg-white">
      {/* ── INVENTORY: fixed filters on top, scrolling rows, fixed actions below ── */}
      {activeTab === "inventory" && (
        <>
          <div className="shrink-0 border-b border-[#dfdbd1] bg-white px-5 py-3 sm:px-6">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2">
                <Boxes className="h-4 w-4 shrink-0 text-[#b36b3c]" />
                <h2 className="text-sm font-bold text-[#26352f]">Property Inventory</h2>
                <span className="text-[11px] text-[#617068]">
                  {inventory.length} {inventory.length === 1 ? "item" : "items"} registered
                </span>
              </div>
              <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
                <select
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                  className="min-w-0 rounded-xl border border-[#dfdbd1] bg-[#f7f4ee] px-3 py-2.5 text-xs font-semibold text-[#26352f] focus:border-[#b36b3c] focus:outline-none sm:flex-none"
                  aria-label="Property category filter"
                >
                  <option value="all">All categories</option>
                  {INVENTORY_CATEGORIES.map((category) => (
                    <option key={category.value} value={category.value}>{category.label}</option>
                  ))}
                </select>
                <select
                  value={stateFilter}
                  onChange={(e) => setStateFilter(e.target.value)}
                  className="min-w-0 rounded-xl border border-[#dfdbd1] bg-[#f7f4ee] px-3 py-2.5 text-xs font-semibold text-[#26352f] focus:border-[#b36b3c] focus:outline-none sm:flex-none"
                  aria-label="Property condition filter"
                >
                  <option value="all">All conditions</option>
                  {INVENTORY_STATES.map((state) => (
                    <option key={state.value} value={state.value}>{state.label}</option>
                  ))}
                </select>
                <div className="relative min-w-0 sm:w-64">
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-[#617068]" />
                  <input
                    type="text"
                    placeholder="Search item, tag number, room..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full rounded-xl border border-[#dfdbd1] bg-[#f7f4ee] py-2.5 pl-9 pr-3 text-xs focus:border-[#b36b3c] focus:outline-none"
                  />
                </div>
              </div>
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
                <tr key={item.id} className="hover:bg-[#f7f4ee]">
                  <td className="py-3 font-mono font-bold text-[#b36b3c]">{item.tag_number || "—"}</td>
                  <td className="py-3">
                    <p className="font-bold text-[#26352f]">{item.name}</p>
                    {item.notes && <p className="text-[11px] italic text-[#617068]">{item.notes}</p>}
                  </td>
                  <td className="py-3">
                    <span className="rounded-md bg-[#ede8dc] px-2 py-0.5 text-[10px] font-bold text-[#26352f]">
                      {item.category_display}
                    </span>
                  </td>
                  <td className="py-3 text-[#617068]">{item.location || "—"}</td>
                  <td className="py-3 text-center font-bold text-[#26352f]">{item.quantity}</td>
                  <td className="py-3">{inventoryStateBadge(item)}</td>
                  <td className="py-3 text-[#617068]">{custodyCell(item)}</td>
                  <td className="py-3 text-right">
                    <div className="relative inline-block" ref={openActionMenuId === item.id ? actionMenuRef : undefined}>
                      <button
                        onClick={(e) => toggleActionMenu(item.id, e.currentTarget)}
                        className="rounded-lg border border-[#c9c5bb] bg-white px-3 py-1.5 text-xs font-semibold text-[#26352f] transition hover:border-[#b36b3c] hover:bg-[#f7f4ee]"
                      >
                        ⋯ Actions
                      </button>
                      {openActionMenuId === item.id && (
                        <div className={`absolute right-0 z-50 w-48 rounded-xl border border-[#dfdbd1] bg-white py-1 shadow-lg ${actionDropUp ? "bottom-full mb-1" : "mt-1"}`}>
                          <button
                            onClick={() => {
                              setSelectedItem(item);
                              setMovementForm(emptyMovementForm);
                              setShowMovementModal(true);
                              setOpenActionMenuId(null);
                            }}
                            className="flex w-full items-center gap-2 px-4 py-2 text-xs text-[#26352f] hover:bg-[#f7f4ee]"
                          >
                            <ArrowRightLeft className="h-3.5 w-3.5 text-[#b36b3c]" />
                            Item Movement
                          </button>
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              )}
              renderCard={(item) => (
                <div key={item.id} className="rounded-2xl border border-[#dfdbd1] bg-white p-4 shadow-sm space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-mono text-[11px] font-bold text-[#b36b3c]">{item.tag_number || "No tag"}</p>
                      <h3 className="font-bold text-sm text-[#26352f]">{item.name}</h3>
                    </div>
                    <div className="shrink-0">{inventoryStateBadge(item)}</div>
                  </div>
                  <div className="grid grid-cols-2 gap-1 text-xs text-[#617068]">
                    <p><span className="font-semibold text-[#26352f]">Category:</span> {item.category_display}</p>
                    <p><span className="font-semibold text-[#26352f]">Qty:</span> {item.quantity}</p>
                    <p className="col-span-2"><span className="font-semibold text-[#26352f]">Location:</span> {item.location || "—"}</p>
                    <p className="col-span-2"><span className="font-semibold text-[#26352f]">Custody:</span> {custodyCell(item)}</p>
                  </div>
                  {item.notes && <p className="text-[11px] italic text-[#617068]">{item.notes}</p>}
                  <div className="flex flex-wrap gap-2 border-t border-[#dfdbd1]/60 pt-2">
                    <button
                      onClick={() => {
                        setSelectedItem(item);
                        setMovementForm(emptyMovementForm);
                        setShowMovementModal(true);
                      }}
                      className="inline-flex items-center gap-1 rounded-lg border border-[#c9c5bb] bg-white px-3 py-1.5 text-[11px] font-semibold text-[#26352f] hover:bg-[#f7f4ee]"
                    >
                      <ArrowRightLeft className="h-3 w-3 text-[#b36b3c]" />
                      Item Movement
                    </button>
                  </div>
                </div>
              )}
            />
          </div>

          {/* ── Bottom bar: count + primary action, like every other table page ── */}
          <div className="shrink-0 border-t border-[#dfdbd1] bg-white p-4 sm:px-6 sm:py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <p className="hidden text-[11px] text-[#617068] sm:block">
              {filteredInventory.length} of {inventory.length} {inventory.length === 1 ? "item" : "items"} shown
            </p>
            <div className="flex items-center justify-between gap-2 w-full sm:w-auto">
              <button
                onClick={() => { setNewItem(emptyItemForm); setShowAddModal(true); }}
                className="flex-1 sm:flex-none rounded-xl bg-[#26352f] px-3 py-2 text-xs font-semibold text-white transition hover:bg-[#b36b3c]"
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
            <div>
              <h2 className="text-base font-bold text-[#26352f]">Deacon &amp; Deaconess Duty Rota</h2>
              <p className="text-xs text-[#617068]">Sabbath &amp; midweek service duty rosters, communion preparation team assignments.</p>
            </div>
            <button
              onClick={() => setShowAddRotaModal(true)}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#26352f] px-4 py-2 text-xs font-bold text-white shadow transition hover:bg-[#1a2420]"
            >
              <Plus className="h-4 w-4" />
              Schedule Duty Rota
            </button>
          </div>

          {rota.length === 0 ? (
            <div className="rounded-2xl border border-[#dfdbd1] bg-white p-8 text-center text-xs text-[#617068] shadow-sm">
              No duty rota has been scheduled yet.
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {rota.map((item) => (
                <div key={item.id} className="rounded-2xl border border-[#dfdbd1] bg-white p-5 shadow-sm space-y-3">
                  <div className="flex items-center justify-between border-b border-[#dfdbd1] pb-3">
                    <span className="rounded-full bg-[#f4f1ea] px-2.5 py-0.5 text-[10px] font-bold text-[#b36b3c]">
                      {item.dutyType}
                    </span>
                    <span className="text-[11px] font-bold text-[#26352f]">{item.date}</span>
                  </div>
                  <h3 className="font-bold text-sm text-[#26352f]">{item.title}</h3>
                  <p className="text-xs text-[#617068] flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5 text-[#b36b3c]" />
                    {item.shift}
                  </p>

                  <div>
                    <p className="text-[11px] font-bold text-[#26352f] mb-1">Assigned Officers:</p>
                    <div className="flex flex-wrap gap-1">
                      {item.assignedTeam.map((member, idx) => (
                        <span key={idx} className="rounded-lg border border-[#dfdbd1] bg-[#faf9f5] px-2 py-0.5 text-[10px] font-semibold text-[#26352f]">
                          {member}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── TAB: DEACONATE ROSTER ── */}
      {activeTab === "members" && (
        <div className="flex-1 overflow-y-auto min-h-0 p-4 sm:p-6 space-y-6">
          <div>
            <h2 className="text-base font-bold text-[#26352f]">Deaconate Board Roster</h2>
            <p className="text-xs text-[#617068]">Active ordained deacons &amp; deaconesses responsible for church property, ushering, and sanctuary logistics.</p>
          </div>
          <div className="rounded-2xl border border-[#dfdbd1] bg-white p-8 text-center text-xs text-[#617068] shadow-sm">
            No deaconate members have been recorded yet.
          </div>
        </div>
      )}

      {/* ── TAB: CALENDAR & ORDINANCES ── */}
      {activeTab === "calendar" && (
        <div className="flex-1 overflow-y-auto min-h-0 p-4 sm:p-6 space-y-6">
          <div>
            <h2 className="text-base font-bold text-[#26352f]">Deaconate Ordinances &amp; Event Schedule</h2>
            <p className="text-xs text-[#617068]">Communion services, foot washing setup, baptism preparations, and sanctuary maintenance.</p>
          </div>
          <div className="rounded-2xl border border-[#dfdbd1] bg-white p-8 text-center text-xs text-[#617068] shadow-sm">
            No deaconate events have been recorded yet.
          </div>
        </div>
      )}

      {/* MODAL: ADD PROPERTY ITEM */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl border border-[#dfdbd1] bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between border-b border-[#dfdbd1] pb-3">
              <h3 className="font-bold text-base text-[#26352f]">Register Church Property</h3>
              <button onClick={() => setShowAddModal(false)} className="text-[#617068] hover:text-[#26352f]">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={registerItem} className="mt-4 space-y-4 text-xs">
              <div>
                <label className="font-bold text-[#26352f]">Property Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Sony Projector 4K"
                  value={newItem.name}
                  onChange={(e) => setNewItem({ ...newItem, name: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-[#dfdbd1] p-2.5 font-medium text-[#26352f]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-[#26352f]">Tag / Serial No.</label>
                  <input
                    type="text"
                    placeholder="AV-PRJ-01"
                    value={newItem.tagNo}
                    onChange={(e) => setNewItem({ ...newItem, tagNo: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-[#dfdbd1] p-2.5 font-medium text-[#26352f]"
                  />
                </div>
                <div>
                  <label className="font-bold text-[#26352f]">Category</label>
                  <select
                    value={newItem.category}
                    onChange={(e) => setNewItem({ ...newItem, category: e.target.value as InventoryCategory })}
                    className="mt-1 w-full rounded-xl border border-[#dfdbd1] p-2.5 font-semibold text-[#26352f]"
                  >
                    {INVENTORY_CATEGORIES.map((category) => (
                      <option key={category.value} value={category.value}>{category.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-[#26352f]">Room / Location</label>
                  <input
                    type="text"
                    placeholder="Sanctuary PA Booth"
                    value={newItem.location}
                    onChange={(e) => setNewItem({ ...newItem, location: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-[#dfdbd1] p-2.5 font-medium text-[#26352f]"
                  />
                </div>
                <div>
                  <label className="font-bold text-[#26352f]">Quantity</label>
                  <input
                    type="number"
                    min={1}
                    value={newItem.quantity}
                    onChange={(e) => setNewItem({ ...newItem, quantity: Number(e.target.value) })}
                    className="mt-1 w-full rounded-xl border border-[#dfdbd1] p-2.5 font-medium text-[#26352f]"
                  />
                </div>
              </div>

              <div>
                <label className="font-bold text-[#26352f]">Condition / Initial State</label>
                <select
                  value={newItem.state}
                  onChange={(e) => setNewItem({ ...newItem, state: e.target.value as InventoryState })}
                  className="mt-1 w-full rounded-xl border border-[#dfdbd1] p-2.5 font-semibold text-[#26352f]"
                >
                  {INVENTORY_STATES.map((state) => (
                    <option key={state.value} value={state.value}>{state.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="font-bold text-[#26352f]">Notes / Inspection Remarks</label>
                <textarea
                  rows={2}
                  placeholder="Additional details..."
                  value={newItem.notes}
                  onChange={(e) => setNewItem({ ...newItem, notes: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-[#dfdbd1] p-2.5 text-xs text-[#26352f]"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="rounded-xl border border-[#dfdbd1] px-4 py-2 text-xs font-bold text-[#26352f]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-xl bg-[#26352f] px-4 py-2 text-xs font-bold text-white shadow disabled:opacity-60"
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
          <div className="w-full max-w-md rounded-2xl border border-[#dfdbd1] bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between border-b border-[#dfdbd1] pb-3">
              <div>
                <h3 className="font-bold text-base text-[#26352f]">Log Item Movement &amp; State</h3>
                <p className="text-xs text-[#b36b3c] font-semibold">
                  {selectedItem.name}{selectedItem.tag_number ? ` (${selectedItem.tag_number})` : ""}
                </p>
              </div>
              <button onClick={() => setShowMovementModal(false)} className="text-[#617068] hover:text-[#26352f]">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={recordMovement} className="mt-4 space-y-4 text-xs">
              <div>
                <label className="font-bold text-[#26352f]">Action Type</label>
                <select
                  value={movementForm.action}
                  onChange={(e) => setMovementForm({ ...movementForm, action: e.target.value as MovementAction })}
                  className="mt-1 w-full rounded-xl border border-[#dfdbd1] p-2.5 font-semibold text-[#26352f]"
                >
                  <option value="check_out">Check Out for Event/Department</option>
                  <option value="check_in">Check In to Store</option>
                  <option value="state_change">Update Condition/State</option>
                </select>
              </div>

              <div>
                <label className="font-bold text-[#26352f]">Officer / Person Responsible *</label>
                <input
                  type="text"
                  required
                  placeholder="Deacon Name or Department"
                  value={movementForm.movedBy}
                  onChange={(e) => setMovementForm({ ...movementForm, movedBy: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-[#dfdbd1] p-2.5 text-xs text-[#26352f]"
                />
              </div>

              <div>
                <label className="font-bold text-[#26352f]">Destination / Location</label>
                <input
                  type="text"
                  placeholder="e.g. Youth Room / Fellowship Hall"
                  value={movementForm.destination}
                  onChange={(e) => setMovementForm({ ...movementForm, destination: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-[#dfdbd1] p-2.5 text-xs text-[#26352f]"
                />
              </div>

              {movementForm.action === "state_change" && (
                <div>
                  <label className="font-bold text-[#26352f]">New State</label>
                  <select
                    value={movementForm.stateChange}
                    onChange={(e) => setMovementForm({ ...movementForm, stateChange: e.target.value as InventoryState })}
                    className="mt-1 w-full rounded-xl border border-[#dfdbd1] p-2.5 font-semibold text-[#26352f]"
                  >
                    {INVENTORY_STATES.map((state) => (
                      <option key={state.value} value={state.value}>{state.label}</option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="font-bold text-[#26352f]">Movement Notes</label>
                <textarea
                  rows={2}
                  placeholder="Notes on movement or physical condition..."
                  value={movementForm.notes}
                  onChange={(e) => setMovementForm({ ...movementForm, notes: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-[#dfdbd1] p-2.5 text-xs text-[#26352f]"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowMovementModal(false)}
                  className="rounded-xl border border-[#dfdbd1] px-4 py-2 text-xs font-bold text-[#26352f]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-xl bg-[#26352f] px-4 py-2 text-xs font-bold text-white shadow disabled:opacity-60"
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
          <div className="w-full max-w-md rounded-2xl border border-[#dfdbd1] bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between border-b border-[#dfdbd1] pb-3">
              <h3 className="font-bold text-base text-[#26352f]">Schedule Duty Rota</h3>
              <button onClick={() => setShowAddRotaModal(false)} className="text-[#617068] hover:text-[#26352f]">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={scheduleRota} className="mt-4 space-y-4 text-xs">
              <div>
                <label className="font-bold text-[#26352f]">Duty Title *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Main Sanctuary Ushering Team A"
                  value={newRota.title}
                  onChange={(e) => setNewRota({ ...newRota, title: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-[#dfdbd1] p-2.5 text-xs text-[#26352f]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-[#26352f]">Date *</label>
                  <input
                    type="date"
                    required
                    value={newRota.date}
                    onChange={(e) => setNewRota({ ...newRota, date: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-[#dfdbd1] p-2.5 text-xs text-[#26352f]"
                  />
                </div>
                <div>
                  <label className="font-bold text-[#26352f]">Duty Type</label>
                  <select
                    value={newRota.dutyType}
                    onChange={(e) => setNewRota({ ...newRota, dutyType: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-[#dfdbd1] p-2.5 font-semibold text-[#26352f]"
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
                <label className="font-bold text-[#26352f]">Shift / Time</label>
                <input
                  type="text"
                  placeholder="08:30 AM - 01:00 PM"
                  value={newRota.shift}
                  onChange={(e) => setNewRota({ ...newRota, shift: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-[#dfdbd1] p-2.5 text-xs text-[#26352f]"
                />
              </div>

              <div>
                <label className="font-bold text-[#26352f]">Assigned Officers (Comma-separated)</label>
                <input
                  type="text"
                  placeholder="Deacon David, Deaconess Sarah"
                  value={newRota.assignedTeam}
                  onChange={(e) => setNewRota({ ...newRota, assignedTeam: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-[#dfdbd1] p-2.5 text-xs text-[#26352f]"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddRotaModal(false)}
                  className="rounded-xl border border-[#dfdbd1] px-4 py-2 text-xs font-bold text-[#26352f]"
                >
                  Cancel
                </button>
                <button type="submit" className="rounded-xl bg-[#26352f] px-4 py-2 text-xs font-bold text-white shadow">
                  Save Duty Rota
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
