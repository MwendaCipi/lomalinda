"use client";

import { useState } from "react";
import {
  Boxes,
  ClipboardList,
  UserCheck,
  Calendar as CalendarIcon,
  Plus,
  Search,
  CheckCircle2,
  AlertTriangle,
  Clock,
  ArrowRightLeft,
  X,
  Building2,
  FileText,
} from "lucide-react";
import { showAlert } from "@/lib/alerts";

type InventoryState = "Good" | "Needs Repair" | "In Use" | "Damaged" | "Retired";
type PropertyCategory = "Audio/Visual" | "Furniture" | "Sacramental" | "Kitchen" | "Electronics" | "General";

interface InventoryItem {
  id: string;
  name: string;
  tagNo: string;
  category: PropertyCategory;
  location: string;
  quantity: number;
  state: InventoryState;
  assignedTo?: string;
  checkedOutAt?: string;
  notes?: string;
  lastInspection?: string;
}

interface MovementLog {
  id: string;
  itemId: string;
  itemName: string;
  movedBy: string;
  destination: string;
  action: "Check Out" | "Check In" | "State Change";
  timestamp: string;
  notes?: string;
}

interface RotaEntry {
  id: string;
  title: string;
  date: string;
  shift: string;
  dutyType: "Ushering" | "Communion Setup" | "Audio/PA" | "Security & Parking" | "Sanctuary Care";
  assignedTeam: string[];
  status: "Scheduled" | "In Progress" | "Completed";
}

interface DeaconMember {
  id: string;
  name: string;
  role: "Head Deacon" | "Head Deaconess" | "Deacon" | "Deaconess";
  phone: string;
  email: string;
  assignedDutiesCount: number;
}

interface DeaconateEvent {
  id: string;
  title: string;
  date: string;
  type: "Communion Sabbath" | "Baptismal Service" | "Foot Washing Setup" | "Sanctuary Deep Clean" | "Meeting";
  lead: string;
  notes: string;
}

const INITIAL_INVENTORY: InventoryItem[] = [
  {
    id: "INV-101",
    name: "Wireless Handheld Microphones (Set of 4)",
    tagNo: "AV-MIC-01",
    category: "Audio/Visual",
    location: "Main Sanctuary PA Booth",
    quantity: 4,
    state: "Good",
    lastInspection: "2026-09-15",
    notes: "Requires AA batteries before each service.",
  },
  {
    id: "INV-102",
    name: "Communion Brass Trays & Cups",
    tagNo: "SAC-TR-02",
    category: "Sacramental",
    location: "Deacon Treasury Room",
    quantity: 12,
    state: "Good",
    lastInspection: "2026-09-10",
    notes: "Polished and sanitized for quarterly Communion.",
  },
  {
    id: "INV-103",
    name: "Yamaha Digital Piano P-125",
    tagNo: "AV-PNO-01",
    category: "Electronics",
    location: "Main Sanctuary Stage",
    quantity: 1,
    state: "In Use",
    assignedTo: "Music Department",
    checkedOutAt: "2026-09-01",
    lastInspection: "2026-09-01",
  },
  {
    id: "INV-104",
    name: "Foldable Banquet Tables",
    tagNo: "FUR-TBL-08",
    category: "Furniture",
    location: "Fellowship Hall Storage",
    quantity: 25,
    state: "Needs Repair",
    notes: "2 tables have loose leg brackets.",
    lastInspection: "2026-09-05",
  },
  {
    id: "INV-105",
    name: "Foot Washing Basins & Towels",
    tagNo: "SAC-FW-01",
    category: "Sacramental",
    location: "Deaconess Store",
    quantity: 30,
    state: "Good",
    lastInspection: "2026-09-01",
  },
];

const INITIAL_LOGS: MovementLog[] = [
  {
    id: "LOG-1",
    itemId: "INV-103",
    itemName: "Yamaha Digital Piano P-125",
    movedBy: "Head Deacon Elder John",
    destination: "Fellowship Hall for Youth Rally",
    action: "Check Out",
    timestamp: "2026-09-18 16:30",
    notes: "Returned to Stage on Sabbath morning.",
  },
];

const INITIAL_ROTA: RotaEntry[] = [
  {
    id: "ROT-1",
    title: "Sabbath Service Ushering & Welcome",
    date: "2026-09-26",
    shift: "08:30 AM - 01:00 PM",
    dutyType: "Ushering",
    assignedTeam: ["Deacon David Miller", "Deaconess Sarah Jenkins", "Deacon Samuel Ochieng"],
    status: "Scheduled",
  },
  {
    id: "ROT-2",
    title: "Sanctuary & Audio/PA Preparation",
    date: "2026-09-26",
    shift: "07:30 AM - 09:00 AM",
    dutyType: "Audio/PA",
    assignedTeam: ["Deacon Mark Vance", "Head Deacon James K."],
    status: "Scheduled",
  },
  {
    id: "ROT-3",
    title: "Quarterly Communion Setup & Ordinance",
    date: "2026-10-03",
    shift: "07:00 AM - 02:00 PM",
    dutyType: "Communion Setup",
    assignedTeam: ["Head Deaconess Mary W.", "Deaconess Grace N.", "Deacon David Miller"],
    status: "Scheduled",
  },
];

const INITIAL_MEMBERS: DeaconMember[] = [
  { id: "DEAC-1", name: "James Kiprono", role: "Head Deacon", phone: "+254 712 345 678", email: "james.k@lomalindachurch.org", assignedDutiesCount: 5 },
  { id: "DEAC-2", name: "Mary Wambui", role: "Head Deaconess", phone: "+254 723 456 789", email: "mary.w@lomalindachurch.org", assignedDutiesCount: 4 },
  { id: "DEAC-3", name: "David Miller", role: "Deacon", phone: "+254 734 567 890", email: "david.m@lomalindachurch.org", assignedDutiesCount: 3 },
  { id: "DEAC-4", name: "Sarah Jenkins", role: "Deaconess", phone: "+254 745 678 901", email: "sarah.j@lomalindachurch.org", assignedDutiesCount: 3 },
  { id: "DEAC-5", name: "Samuel Ochieng", role: "Deacon", phone: "+254 756 789 012", email: "samuel.o@lomalindachurch.org", assignedDutiesCount: 2 },
];

const INITIAL_EVENTS: DeaconateEvent[] = [
  {
    id: "EV-1",
    title: "3rd Quarter Communion Sabbath & Ordinance",
    date: "2026-10-03",
    type: "Communion Sabbath",
    lead: "Head Deacon & Head Deaconess",
    notes: "Bread baking on Friday 2 PM; Table setup 7 AM Sabbath.",
  },
  {
    id: "EV-2",
    title: "Deaconate Sanctuary Deep Cleaning",
    date: "2026-10-10",
    type: "Sanctuary Deep Clean",
    lead: "Deacon Board",
    notes: "Carpet shampooing and bench polishing.",
  },
];

interface DeaconateManagerProps {
  initialTab?: "inventory" | "rota" | "members" | "calendar";
}

export function DeaconateManager({ initialTab = "inventory" }: DeaconateManagerProps) {
  const [activeTab, setActiveTab] = useState<"inventory" | "rota" | "members" | "calendar">(initialTab);

  // Inventory State
  const [inventory, setInventory] = useState<InventoryItem[]>(INITIAL_INVENTORY);
  const [logs, setLogs] = useState<MovementLog[]>(INITIAL_LOGS);
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("All");
  const [stateFilter, setStateFilter] = useState<string>("All");

  // Modals State
  const [showAddModal, setShowAddModal] = useState(false);
  const [showMovementModal, setShowMovementModal] = useState(false);
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);

  // New Item Form
  const [newItem, setNewItem] = useState({
    name: "",
    tagNo: "",
    category: "General" as PropertyCategory,
    location: "Main Sanctuary",
    quantity: 1,
    state: "Good" as InventoryState,
    notes: "",
  });

  // Movement Form
  const [movementForm, setMovementForm] = useState({
    action: "Check Out" as "Check Out" | "Check In" | "State Change",
    movedBy: "",
    destination: "",
    newState: "Good" as InventoryState,
    notes: "",
  });

  // Rota State
  const [rota, setRota] = useState<RotaEntry[]>(INITIAL_ROTA);
  const [showAddRotaModal, setShowAddRotaModal] = useState(false);
  const [newRota, setNewRota] = useState({
    title: "",
    date: "",
    shift: "08:30 AM - 01:00 PM",
    dutyType: "Ushering" as RotaEntry["dutyType"],
    assignedTeam: "",
  });

  // Filter Inventory
  const filteredInventory = inventory.filter((item) => {
    const matchesSearch =
      item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.tagNo.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.location.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = categoryFilter === "All" || item.category === categoryFilter;
    const matchesState = stateFilter === "All" || item.state === stateFilter;
    return matchesSearch && matchesCategory && matchesState;
  });

  // Add Item Handler
  const handleAddItem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItem.name.trim()) return;

    const item: InventoryItem = {
      id: `INV-${Math.floor(100 + Math.random() * 900)}`,
      name: newItem.name.trim(),
      tagNo: newItem.tagNo.trim() || `TAG-${Math.floor(1000 + Math.random() * 9000)}`,
      category: newItem.category,
      location: newItem.location.trim() || "Main Store",
      quantity: Math.max(1, Number(newItem.quantity) || 1),
      state: newItem.state,
      notes: newItem.notes.trim(),
      lastInspection: new Date().toISOString().split("T")[0],
    };

    setInventory((prev) => [item, ...prev]);
    setShowAddModal(false);
    setNewItem({
      name: "",
      tagNo: "",
      category: "General",
      location: "Main Sanctuary",
      quantity: 1,
      state: "Good",
      notes: "",
    });
    showAlert("Property Added", `"${item.name}" has been registered in the inventory.`, "success");
  };

  // Movement / State Update Handler
  const handleLogMovement = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedItem || !movementForm.movedBy.trim()) return;

    const newLog: MovementLog = {
      id: `LOG-${Date.now()}`,
      itemId: selectedItem.id,
      itemName: selectedItem.name,
      movedBy: movementForm.movedBy.trim(),
      destination: movementForm.destination.trim() || selectedItem.location,
      action: movementForm.action,
      timestamp: new Date().toLocaleString(),
      notes: movementForm.notes.trim(),
    };

    setLogs((prev) => [newLog, ...prev]);

    // Update item status
    setInventory((prev) =>
      prev.map((item) => {
        if (item.id === selectedItem.id) {
          return {
            ...item,
            state: movementForm.action === "State Change" ? movementForm.newState : movementForm.action === "Check Out" ? "In Use" : "Good",
            assignedTo: movementForm.action === "Check Out" ? movementForm.movedBy : undefined,
            checkedOutAt: movementForm.action === "Check Out" ? new Date().toISOString().split("T")[0] : undefined,
            location: movementForm.destination || item.location,
            lastInspection: new Date().toISOString().split("T")[0],
          };
        }
        return item;
      })
    );

    setShowMovementModal(false);
    setSelectedItem(null);
    setMovementForm({ action: "Check Out", movedBy: "", destination: "", newState: "Good", notes: "" });
    showAlert("Movement Recorded", `Status updated for "${selectedItem.name}".`, "success");
  };

  // Add Duty Rota Handler
  const handleAddRota = (e: React.FormEvent) => {
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
      status: "Scheduled",
    };

    setRota((prev) => [entry, ...prev]);
    setShowAddRotaModal(false);
    setNewRota({ title: "", date: "", shift: "08:30 AM - 01:00 PM", dutyType: "Ushering", assignedTeam: "" });
    showAlert("Duty Rota Added", `"${entry.title}" scheduled for ${entry.date}.`, "success");
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="rounded-2xl border border-[#dfdbd1] bg-[#26352f] p-6 text-white shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Building2 className="h-6 w-6 text-[#b36b3c]" />
              <h1 className="text-xl font-bold tracking-tight">Deaconate Ministry</h1>
            </div>
            <p className="mt-1 text-xs text-[#dfd9cb] leading-relaxed">
              Church property inventory tracking, sanctuary care, duty rota assignments, and deaconate calendar.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span className="rounded-full bg-[#3d4f47] px-3 py-1 text-xs font-semibold text-[#f0eade]">
              Head Deacon &amp; Deaconess Desk
            </span>
          </div>
        </div>

        {/* Inner Nav Tabs */}
        <div className="mt-6 flex flex-wrap gap-2 border-t border-[#3d4f47] pt-4">
          <button
            onClick={() => setActiveTab("inventory")}
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition ${
              activeTab === "inventory" ? "bg-[#b36b3c] text-white shadow" : "bg-[#3d4f47] text-[#dfd9cb] hover:bg-[#4b5f56]"
            }`}
          >
            <Boxes className="h-4 w-4" />
            Property Inventory ({inventory.length})
          </button>

          <button
            onClick={() => setActiveTab("rota")}
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition ${
              activeTab === "rota" ? "bg-[#b36b3c] text-white shadow" : "bg-[#3d4f47] text-[#dfd9cb] hover:bg-[#4b5f56]"
            }`}
          >
            <ClipboardList className="h-4 w-4" />
            Duty Rota ({rota.length})
          </button>

          <button
            onClick={() => setActiveTab("members")}
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition ${
              activeTab === "members" ? "bg-[#b36b3c] text-white shadow" : "bg-[#3d4f47] text-[#dfd9cb] hover:bg-[#4b5f56]"
            }`}
          >
            <UserCheck className="h-4 w-4" />
            Deaconate Roster ({INITIAL_MEMBERS.length})
          </button>

          <button
            onClick={() => setActiveTab("calendar")}
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition ${
              activeTab === "calendar" ? "bg-[#b36b3c] text-white shadow" : "bg-[#3d4f47] text-[#dfd9cb] hover:bg-[#4b5f56]"
            }`}
          >
            <CalendarIcon className="h-4 w-4" />
            Calendar &amp; Ordinances
          </button>
        </div>
      </div>

      {/* TAB 1: PROPERTY INVENTORY */}
      {activeTab === "inventory" && (
        <div className="space-y-6">
          {/* Controls Bar */}
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between rounded-2xl border border-[#dfdbd1] bg-white p-4 shadow-sm">
            <div className="flex flex-1 flex-wrap items-center gap-3">
              <div className="relative min-w-[200px] flex-1">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-[#617068]" />
                <input
                  type="text"
                  placeholder="Search item, tag number, room..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full rounded-xl border border-[#dfdbd1] bg-[#faf9f5] pl-9 pr-3 py-2 text-xs font-medium text-[#26352f] focus:border-[#b36b3c] focus:outline-none"
                />
              </div>

              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="rounded-xl border border-[#dfdbd1] bg-[#faf9f5] px-3 py-2 text-xs font-semibold text-[#26352f] focus:border-[#b36b3c] focus:outline-none"
              >
                <option value="All">All Categories</option>
                <option value="Audio/Visual">Audio/Visual</option>
                <option value="Furniture">Furniture</option>
                <option value="Sacramental">Sacramental</option>
                <option value="Kitchen">Kitchen</option>
                <option value="Electronics">Electronics</option>
                <option value="General">General</option>
              </select>

              <select
                value={stateFilter}
                onChange={(e) => setStateFilter(e.target.value)}
                className="rounded-xl border border-[#dfdbd1] bg-[#faf9f5] px-3 py-2 text-xs font-semibold text-[#26352f] focus:border-[#b36b3c] focus:outline-none"
              >
                <option value="All">All Conditions</option>
                <option value="Good">Good</option>
                <option value="In Use">In Use</option>
                <option value="Needs Repair">Needs Repair</option>
                <option value="Damaged">Damaged</option>
                <option value="Retired">Retired</option>
              </select>
            </div>

            <button
              onClick={() => setShowAddModal(true)}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#26352f] px-4 py-2 text-xs font-bold text-white shadow transition hover:bg-[#1a2420]"
            >
              <Plus className="h-4 w-4" />
              Add Church Property
            </button>
          </div>

          {/* Inventory Table */}
          <div className="overflow-hidden rounded-2xl border border-[#dfdbd1] bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-[#dfdbd1] bg-[#f4f1ea] font-bold text-[#26352f]">
                  <tr>
                    <th className="px-4 py-3">Tag / Serial</th>
                    <th className="px-4 py-3">Property Name</th>
                    <th className="px-4 py-3">Category</th>
                    <th className="px-4 py-3">Location / Room</th>
                    <th className="px-4 py-3 text-center">Qty</th>
                    <th className="px-4 py-3">Condition / State</th>
                    <th className="px-4 py-3">Assigned / Custody</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#dfdbd1]">
                  {filteredInventory.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-8 text-center text-[#617068]">
                        No property items found matching your filters.
                      </td>
                    </tr>
                  ) : (
                    filteredInventory.map((item) => (
                      <tr key={item.id} className="transition hover:bg-[#faf8f3]">
                        <td className="px-4 py-3 font-mono font-bold text-[#b36b3c]">{item.tagNo}</td>
                        <td className="px-4 py-3">
                          <p className="font-bold text-[#26352f]">{item.name}</p>
                          {item.notes && <p className="text-[11px] text-[#617068] italic">{item.notes}</p>}
                        </td>
                        <td className="px-4 py-3">
                          <span className="rounded-md bg-[#ede8dc] px-2 py-0.5 text-[10px] font-bold text-[#26352f]">
                            {item.category}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-[#617068]">{item.location}</td>
                        <td className="px-4 py-3 text-center font-bold text-[#26352f]">{item.quantity}</td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                              item.state === "Good"
                                ? "bg-emerald-100 text-emerald-800"
                                : item.state === "In Use"
                                ? "bg-blue-100 text-blue-800"
                                : item.state === "Needs Repair"
                                ? "bg-amber-100 text-amber-800"
                                : "bg-red-100 text-red-800"
                            }`}
                          >
                            {item.state === "Good" && <CheckCircle2 className="h-3 w-3" />}
                            {item.state === "Needs Repair" && <AlertTriangle className="h-3 w-3" />}
                            {item.state === "In Use" && <Clock className="h-3 w-3" />}
                            {item.state}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-[#617068]">
                          {item.assignedTo ? (
                            <div>
                              <p className="font-semibold text-[#26352f]">{item.assignedTo}</p>
                              {item.checkedOutAt && <p className="text-[10px]">Since {item.checkedOutAt}</p>}
                            </div>
                          ) : (
                            <span className="text-[#a1a1a1]">In Store</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            onClick={() => {
                              setSelectedItem(item);
                              setShowMovementModal(true);
                            }}
                            className="inline-flex items-center gap-1 rounded-lg border border-[#dfdbd1] bg-[#faf9f5] px-2.5 py-1 text-[11px] font-bold text-[#26352f] transition hover:bg-[#ede8dc]"
                          >
                            <ArrowRightLeft className="h-3 w-3 text-[#b36b3c]" />
                            Log Movement
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Movement Log History */}
          <div className="rounded-2xl border border-[#dfdbd1] bg-white p-5 shadow-sm">
            <h3 className="text-sm font-bold text-[#26352f] flex items-center gap-2">
              <FileText className="h-4 w-4 text-[#b36b3c]" />
              Property Movement &amp; State Audit Trail
            </h3>
            <div className="mt-3 divide-y divide-[#dfdbd1] rounded-xl border border-[#dfdbd1] bg-[#faf9f5]">
              {logs.length === 0 ? (
                <p className="p-4 text-center text-xs text-[#617068]">No movement events logged yet.</p>
              ) : (
                logs.map((log) => (
                  <div key={log.id} className="flex items-center justify-between p-3 text-xs">
                    <div>
                      <span className="font-bold text-[#26352f]">{log.itemName}</span>
                      <span className="mx-2 text-[#a1a1a1]">•</span>
                      <span className="font-semibold text-[#b36b3c]">{log.action}</span>
                      <p className="text-[11px] text-[#617068]">
                        Handled by <span className="font-semibold text-[#26352f]">{log.movedBy}</span> ({log.destination})
                      </p>
                    </div>
                    <span className="text-[10px] font-mono text-[#617068]">{log.timestamp}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: DUTY ROTA */}
      {activeTab === "rota" && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-[#26352f]">Deacon &amp; Deaconess Duty Rota</h2>
              <p className="text-xs text-[#617068]">Sabbath &amp; midweek service duty rosters, communion preparation team assignments.</p>
            </div>
            <button
              onClick={() => setShowAddRotaModal(true)}
              className="inline-flex items-center gap-2 rounded-xl bg-[#26352f] px-4 py-2 text-xs font-bold text-white shadow transition hover:bg-[#1a2420]"
            >
              <Plus className="h-4 w-4" />
              Schedule Duty Rota
            </button>
          </div>

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
        </div>
      )}

      {/* TAB 3: DEACONATE ROSTER */}
      {activeTab === "members" && (
        <div className="space-y-6">
          <div>
            <h2 className="text-base font-bold text-[#26352f]">Deaconate Board Roster</h2>
            <p className="text-xs text-[#617068]">Active ordained deacons &amp; deaconesses responsible for church property, ushering, and sanctuary logistics.</p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {INITIAL_MEMBERS.map((m) => (
              <div key={m.id} className="rounded-2xl border border-[#dfdbd1] bg-white p-5 shadow-sm space-y-2">
                <div className="flex items-center justify-between">
                  <span className="rounded-md bg-[#26352f] px-2 py-0.5 text-[10px] font-bold text-white">
                    {m.role}
                  </span>
                  <span className="text-[11px] font-semibold text-[#617068]">{m.assignedDutiesCount} Duties Active</span>
                </div>
                <h3 className="font-bold text-base text-[#26352f]">{m.name}</h3>
                <p className="text-xs text-[#617068]">{m.phone}</p>
                <p className="text-xs text-[#617068]">{m.email}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 4: CALENDAR & ORDINANCES */}
      {activeTab === "calendar" && (
        <div className="space-y-6">
          <div>
            <h2 className="text-base font-bold text-[#26352f]">Deaconate Ordinances &amp; Event Schedule</h2>
            <p className="text-xs text-[#617068]">Communion services, foot washing setup, baptism preparations, and sanctuary maintenance.</p>
          </div>

          <div className="space-y-4">
            {INITIAL_EVENTS.map((ev) => (
              <div key={ev.id} className="rounded-2xl border border-[#dfdbd1] bg-white p-5 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="rounded-full bg-[#b36b3c] px-2.5 py-0.5 text-[10px] font-bold text-white">
                      {ev.type}
                    </span>
                    <span className="text-xs font-bold text-[#26352f]">{ev.date}</span>
                  </div>
                  <h3 className="mt-2 font-bold text-sm text-[#26352f]">{ev.title}</h3>
                  <p className="mt-1 text-xs text-[#617068]">{ev.notes}</p>
                </div>
                <div className="text-right shrink-0">
                  <span className="text-xs font-semibold text-[#26352f]">Lead: {ev.lead}</span>
                </div>
              </div>
            ))}
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
            <form onSubmit={handleAddItem} className="mt-4 space-y-4 text-xs">
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
                    onChange={(e) => setNewItem({ ...newItem, category: e.target.value as PropertyCategory })}
                    className="mt-1 w-full rounded-xl border border-[#dfdbd1] p-2.5 font-semibold text-[#26352f]"
                  >
                    <option value="Audio/Visual">Audio/Visual</option>
                    <option value="Furniture">Furniture</option>
                    <option value="Sacramental">Sacramental</option>
                    <option value="Kitchen">Kitchen</option>
                    <option value="Electronics">Electronics</option>
                    <option value="General">General</option>
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
                  <option value="Good">Good</option>
                  <option value="In Use">In Use</option>
                  <option value="Needs Repair">Needs Repair</option>
                  <option value="Damaged">Damaged</option>
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
                <button type="submit" className="rounded-xl bg-[#26352f] px-4 py-2 text-xs font-bold text-white shadow">
                  Save Property Item
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: LOG MOVEMENT */}
      {showMovementModal && selectedItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl border border-[#dfdbd1] bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between border-b border-[#dfdbd1] pb-3">
              <div>
                <h3 className="font-bold text-base text-[#26352f]">Log Item Movement &amp; State</h3>
                <p className="text-xs text-[#b36b3c] font-semibold">{selectedItem.name} ({selectedItem.tagNo})</p>
              </div>
              <button onClick={() => setShowMovementModal(false)} className="text-[#617068] hover:text-[#26352f]">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleLogMovement} className="mt-4 space-y-4 text-xs">
              <div>
                <label className="font-bold text-[#26352f]">Action Type</label>
                <select
                  value={movementForm.action}
                  onChange={(e) => setMovementForm({ ...movementForm, action: e.target.value as any })}
                  className="mt-1 w-full rounded-xl border border-[#dfdbd1] p-2.5 font-semibold text-[#26352f]"
                >
                  <option value="Check Out">Check Out for Event/Department</option>
                  <option value="Check In">Check In to Store</option>
                  <option value="State Change">Update Condition/State</option>
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

              {movementForm.action === "State Change" && (
                <div>
                  <label className="font-bold text-[#26352f]">New State</label>
                  <select
                    value={movementForm.newState}
                    onChange={(e) => setMovementForm({ ...movementForm, newState: e.target.value as InventoryState })}
                    className="mt-1 w-full rounded-xl border border-[#dfdbd1] p-2.5 font-semibold text-[#26352f]"
                  >
                    <option value="Good">Good</option>
                    <option value="In Use">In Use</option>
                    <option value="Needs Repair">Needs Repair</option>
                    <option value="Damaged">Damaged</option>
                    <option value="Retired">Retired</option>
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
                <button type="submit" className="rounded-xl bg-[#26352f] px-4 py-2 text-xs font-bold text-white shadow">
                  Record Log
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
            <form onSubmit={handleAddRota} className="mt-4 space-y-4 text-xs">
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
                    onChange={(e) => setNewRota({ ...newRota, dutyType: e.target.value as any })}
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
