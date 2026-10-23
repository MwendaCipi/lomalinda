"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { usePageHeader } from "@/components/app-frame";
import {
  AlertTriangle,
  ArrowRightLeft,
  Bell,
  Boxes,
  CheckCircle2,
  Clock,
  ExternalLink,
  Images,
  Pencil,
  Plus,
  Printer,
  Search,
  Share2,
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

/**
 * The rota's own filters — the date range and the search — handed to whichever
 * surface is hosting the rota. The deaconate's own rota draws them inside the
 * shell's heading band; the pulpit team rides the Personal Ministries desk,
 * whose heading the desk keeps, so that desk reads this context and renders the
 * same filters at the right of the heading the way every other view there does.
 * A surface that renders the filters itself (the pulpit panel, while the desk
 * does not host them) reads `false` and draws its own inline band.
 */
export type RotaFilters = {
  fromDate: string;
  toDate: string;
  searchQuery: string;
  setFromDate: (value: string) => void;
  setToDate: (value: string) => void;
  setSearchQuery: (value: string) => void;
};

const RotaFiltersContext = createContext<{ filters: RotaFilters; hosted: boolean } | null>(null);

/** The rota filters as the surface hosting them sees them; null when none. */
export function useRotaFilters() {
  return useContext(RotaFiltersContext);
}

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

/**
 * One officer on a duty line: the name the rota has always carried, with who
 * to call beside it. The Add Officer modal takes all four; a name typed by
 * hand (a deacon who keeps no account in the church's app) fills only the
 * first, and the empty fields are simply left off the line.
 */
interface RotaOfficer {
  name: string;
  phone: string;
  email: string;
  /** The part they play on the day: ushering, food service, … */
  role: string;
  /** What this officer is doing on this duty, in the desk's own words. */
  duty: string;
  /**
   * The church account behind the name, when the desk picked the officer off
   * the roll. The rota prints the name either way; the daily cron reminds the
   * account, so a name typed by hand carries none and is reminded by nobody.
   */
  member_id?: number | null;
}

/** One line of the duty rota, as the API keeps it. */
interface RotaEntry {
  id: number;
  title: string;
  date: string;
  shift: string;
  duty_type: string;
  /**
   * Officers as they come back: an object where their contacts were taken
   * down, a bare name where they weren't — every line scheduled before the
   * modal still reads back exactly as it was written.
   */
  assigned_team: Array<string | RotaOfficer>;
}

/** A suggestion from the rota's own roll search, carrying all four fields. */
interface OfficerMatch extends RotaOfficer {
  id: number;
}

/** One picture inside a moment's album, as the wall serves it. */
interface MomentMedia {
  id: number;
  url: string;
  file_name: string | null;
  is_video: boolean;
}

/** One documented moment on the Moments wall: the day, its words, its album. */
interface MomentAlbum {
  id: number;
  title: string;
  description: string;
  happened_on: string | null;
  posted_by_name: string | null;
  media_count: number;
  media: MomentMedia[];
  video_links: string[];
}

/** Either shape of a saved officer, as the modal and the card read it. */
const normalizeOfficer = (entry: string | RotaOfficer): RotaOfficer =>
  typeof entry === "string"
    ? { name: entry, phone: "", email: "", role: "", duty: "", member_id: null }
    : {
        // Whatever else the line carries rides along: the API's officer may
        // grow a field, and an edit must not be the thing that drops it.
        ...entry,
        name: String(entry?.name ?? ""),
        phone: String(entry?.phone ?? ""),
        email: String(entry?.email ?? ""),
        role: String(entry?.role ?? ""),
        duty: String(entry?.duty ?? ""),
        member_id: typeof entry?.member_id === "number" ? entry.member_id : null,
      };



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

const emptyOfficerForm: RotaOfficer = { name: "", phone: "", email: "", role: "", duty: "", member_id: null };

const emptyRotaForm = {
  // What almost every line the desk writes is called; the field is editable
  // so a communion or a special Sabbath can be named as itself.
  title: "Sabbath Duty Rota",
  date: "",
  shift: "08:30 AM - 01:00 PM",
  officers: [] as RotaOfficer[],
};

/** What a pulpit line is called when the desk names none: who preaches,
 *  plays and reads, rather than a duty served. */
const PULPIT_DEFAULT_TITLE = "Sabbath Pulpit Team";

/** What a music line is called when the desk names none: who sings and
 *  plays on the day, rather than a duty served. */
const MUSIC_DEFAULT_TITLE = "Sabbath Music Duties";

/**
 * The title a line reads by.
 *
 * The desk saves its default as the field's real value, but a line written
 * before the title came back — or through the API, where the field is
 * optional — can still arrive blank. Every place that names a line falls
 * back to the desk's own default rather than to a bare "Duty", which says
 * nothing about which rota the line is on.
 */
function rotaTitleOf(entry: { title?: string | null }, fallback: string): string {
  return (entry.title ?? "").trim() || fallback;
}

/** Authenticated JSON call against the members API. */
async function apiFetch(path: string, init?: RequestInit) {
  const token = typeof window === "undefined" ? null : localStorage.getItem("access_token");
  // A FormData body brings its own boundary; a content type laid over it
  // would misdescribe the encoding and the upload would arrive unreadable.
  const isFormData = typeof FormData !== "undefined" && init?.body instanceof FormData;
  return fetch(`${API_URL}/api/members${path}`, {
    ...init,
    headers: {
      ...(isFormData ? {} : { "Content-Type": "application/json" }),
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
  initialTab?: "inventory" | "rota" | "moments" | "members" | "calendar" | "funding" | "accounts";
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
  /**
   * Which desk's rota is on screen. The pulpit team rosters the Sabbath's
   * preachers, players and readers the same way the deaconate rosters who
   * serves the service, and music rosters who sings and plays on a day, so
   * these are this same panel with their own lines — the server keeps them
   * apart by desk, and this prop is what asks for one.
   *
   * The pulpit view is a page of the Personal Ministries desk, and the music
   * view a page of the music desk's Duties; each draws its own heading and
   * search, so these variants keep their filters inline rather than taking
   * the shell's header band over.
   */
  desk?: "deaconate" | "pulpit" | "music";
  /**
   * Whether a surface above — the Personal Ministries desk, which keeps its
   * own heading — is hosting this rota's date and search filters at the right
   * of that heading. When set, the panel draws no filter band of its own; when
   * unset (the panel opened on the Ministry map, with no desk above), it keeps
   * carrying them itself so the filters are never unreachable.
   */
  filtersHosted?: boolean;
}

export function DeaconateManager({ initialTab = "inventory", embedded = false, desk = "deaconate", onBack, filtersHosted = false }: DeaconateManagerProps) {
  // The shell's section strip owns which deaconate page is open, so the tab
  // comes straight from the URL instead of a second, in-page copy that can drift.
  const isPulpit = desk === "pulpit";
  // What this desk's rota is called wherever the reader is told about it.
  const rotaName = desk === "music" ? "Music Duties" : isPulpit ? "Pulpit Team" : "Duty Rota";
  // What a line of it is called when the desk names none.
  const defaultRotaTitle =
    desk === "music" ? MUSIC_DEFAULT_TITLE : isPulpit ? PULPIT_DEFAULT_TITLE : emptyRotaForm.title;
  // The save form as the desk opens it. The default title is written into
  // the field as its value, not left as a hint in an empty box, so what the
  // desk sees is what is saved when it changes nothing else.
  const blankRota = () => ({ ...emptyRotaForm, title: defaultRotaTitle });
  // What a line of this desk's rota is called wherever it is named.
  const titleOf = (entry: { title?: string | null }) => rotaTitleOf(entry, defaultRotaTitle);
  // The query that asks the server for this desk's lines only.
  const deskParam = desk === "music" ? "music" : isPulpit ? "pulpit" : "deaconate";
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
  // The form starts on the desk's own default, so the pulpit and music
  // desks never open holding the deaconate's title.
  const [newRota, setNewRota] = useState(blankRota);
  const [savingRota, setSavingRota] = useState(false);
  const [removingRotaId, setRemovingRotaId] = useState<number | null>(null);
  // Non-null while the schedule modal is rewriting a line that already exists.
  const [editingRotaId, setEditingRotaId] = useState<number | null>(null);
  // The Add Officer modal, stacked over the schedule modal: one officer at a
  // time, as many as the duty needs, all folded into the line when it is saved.
  const [showOfficerModal, setShowOfficerModal] = useState(false);
  const [officerForm, setOfficerForm] = useState<RotaOfficer>(emptyOfficerForm);
  const [officerMatches, setOfficerMatches] = useState<OfficerMatch[]>([]);
  const [showOfficerMatches, setShowOfficerMatches] = useState(false);
  // The name last picked from the roll: it is already answered, so the
  // search neither asks again nor reports that nobody matched.
  const [pickedOfficerName, setPickedOfficerName] = useState<string | null>(null);

  // Rota filtering, PDF download and sharing
  const [rotaFromDate, setRotaFromDate] = useState("");
  const [rotaToDate, setRotaToDate] = useState("");
  const [rotaSearchQuery, setRotaSearchQuery] = useState("");
  // Whether a surface above is hosting this rota's filters — the Personal
  // Ministries desk, for the pulpit team, which keeps its own heading. When it
  // is, the filters belong at the right of that heading rather than in a band
  // of the panel's own, and this panel draws none.
  const rotaFilters = useMemo<RotaFilters>(
    () => ({
      fromDate: rotaFromDate,
      toDate: rotaToDate,
      searchQuery: rotaSearchQuery,
      setFromDate: setRotaFromDate,
      setToDate: setRotaToDate,
      setSearchQuery: setRotaSearchQuery,
    }),
    [rotaFromDate, rotaToDate, rotaSearchQuery],
  );
  const rotaFiltersHosted = filtersHosted;
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareTarget, setShareTarget] = useState<RotaEntry | null>(null);
  const [shareChannels, setShareChannels] = useState({ whatsapp: true, sms: true, email: true });

  // Moments: the desk documents a day, and it goes out on the wall the
  // Fellowship strip opens. Pictures are files; video is a link to where the
  // footage already lives, because the church's storage holds stills.
  const [moments, setMoments] = useState<MomentAlbum[]>([]);
  const [loadingMoments, setLoadingMoments] = useState(true);
  const [showMomentModal, setShowMomentModal] = useState(false);
  const [momentTitle, setMomentTitle] = useState("");
  const [momentDay, setMomentDay] = useState("");
  const [momentNote, setMomentNote] = useState("");
  const [momentFiles, setMomentFiles] = useState<File[]>([]);
  const [momentLinks, setMomentLinks] = useState("");
  const [postingMoment, setPostingMoment] = useState(false);
  const momentFileInputRef = useRef<HTMLInputElement | null>(null);

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
    // The pulpit and music views are the rota and nothing else: the property
    // register is the deaconate's own desk, and it is not these panels' to
    // read.
    if (desk !== "deaconate") return;
    loadInventory();
  }, [desk]);

  /**
   * The rota the church keeps, earliest duty first — or null when the desk
   * could not be read (offline, a refused session).
   *
   * Reading and writing the desk's state are kept apart on purpose: the effect
   * below settles what it fetched from the promise's own callback, the way the
   * shell reads the day's word, rather than writing state while the effect runs.
   */
  const fetchRota = async (from = rotaFromDate, to = rotaToDate, q = rotaSearchQuery): Promise<RotaEntry[] | null> => {
    try {
      const params = new URLSearchParams();
      params.set("desk", deskParam);
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      if (q.trim()) params.set("q", q.trim());
      const queryStr = `?${params.toString()}`;
      const res = await apiFetch(`/duty-rota/${queryStr}`);
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

  // The rota is read when its tab is opened or when date range/search filters change.
  useEffect(() => {
    if (activeTab !== "rota") return;
    let alive = true;
    const timer = setTimeout(() => {
      fetchRota(rotaFromDate, rotaToDate, rotaSearchQuery).then((rows) => {
        if (!alive) return;
        setRota(rows ?? []);
        setLoadingRota(false);
        if (rows === null) {
          showAlert("Could not load the duty rota", "Check your connection and try again.", "error");
        }
      });
    }, 200);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [activeTab, rotaFromDate, rotaToDate, rotaSearchQuery]);

  const filteredRota = useMemo(() => {
    if (!rotaSearchQuery.trim()) return rota;
    const q = rotaSearchQuery.toLowerCase().trim();
    return rota.filter((item) => {
      const matchTitle = (item.title || "").toLowerCase().includes(q);
      const matchType = (item.duty_type || "").toLowerCase().includes(q);
      const matchShift = (item.shift || "").toLowerCase().includes(q);
      const matchTeam = item.assigned_team.some((entry) => {
        const officer = normalizeOfficer(entry);
        return (
          officer.name.toLowerCase().includes(q) ||
          officer.duty.toLowerCase().includes(q) ||
          officer.role.toLowerCase().includes(q) ||
          officer.phone.toLowerCase().includes(q)
        );
      });
      return matchTitle || matchType || matchShift || matchTeam;
    });
  }, [rota, rotaSearchQuery]);

  const printRotaPdf = async (item?: RotaEntry) => {
    try {
      const params = new URLSearchParams();
      params.set("desk", deskParam);
      if (item) {
        params.set("from", item.date);
        params.set("to", item.date);
        params.set("q", item.title || "");
      } else {
        if (rotaFromDate) params.set("from", rotaFromDate);
        if (rotaToDate) params.set("to", rotaToDate);
        if (rotaSearchQuery.trim()) params.set("q", rotaSearchQuery.trim());
      }
      const queryStr = params.toString() ? `?${params.toString()}` : "";
      const res = await apiFetch(`/duty-rota/pdf/${queryStr}`);
      if (!res.ok) throw new Error("Could not fetch PDF for printing");
      const blob = await res.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const win = window.open(blobUrl, "_blank");
      if (win) {
        win.focus();
      } else {
        window.location.href = blobUrl;
      }
    } catch {
      showAlert("Print Failed", "Could not prepare the duty rota for printing.", "error");
    }
  };

  const openShareModal = (target: RotaEntry | null) => {
    setShareTarget(target);
    setShowShareModal(true);
  };

  const shareContent = useMemo(() => {
    if (shareTarget) {
      const lines = [
        `📋 *SDA Church - ${rotaName}*`,
        `*Duty:* ${titleOf(shareTarget)}`,
        `*Date:* ${dayFirst(shareTarget.date)}`,
        shareTarget.shift ? `*Shift/Time:* ${shareTarget.shift}` : "",
        shareTarget.duty_type ? `*Type:* ${shareTarget.duty_type}` : "",
        "",
        `*Assigned Team:*`,
        ...shareTarget.assigned_team.map((entry) => {
          const off = normalizeOfficer(entry);
          const details = [off.duty, off.role, off.phone].filter(Boolean).join(" · ");
          return `• ${off.name}${details ? ` (${details})` : ""}`;
        }),
      ].filter(Boolean);
      return {
        subject: `${rotaName}: ${titleOf(shareTarget)} (${dayFirst(shareTarget.date)})`,
        text: lines.join("\n"),
      };
    } else {
      const periodLabel = rotaFromDate && rotaToDate ? ` (${dayFirst(rotaFromDate)} to ${dayFirst(rotaToDate)})` : "";
      const lines = [
        `📋 *SDA Church - ${rotaName} Schedule${periodLabel}*`,
        `Total Duties: ${filteredRota.length}`,
        "",
        ...filteredRota.slice(0, 15).map((item) => {
          const teamNames = item.assigned_team.map((e) => normalizeOfficer(e).name).join(", ");
          return `• ${dayFirst(item.date)} - ${titleOf(item)}${item.shift ? ` (${item.shift})` : ""}: ${teamNames || "Unassigned"}`;
        }),
        filteredRota.length > 15 ? `...and ${filteredRota.length - 15} more duties.` : "",
      ].filter(Boolean);
      return {
        subject: `${rotaName} Schedule${periodLabel}`,
        text: lines.join("\n"),
      };
    }
  }, [rotaName, shareTarget, filteredRota, rotaFromDate, rotaToDate]);

  const executeShare = () => {
    const { subject, text } = shareContent;
    if (shareChannels.whatsapp) {
      window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`, "_blank");
    }
    if (shareChannels.sms) {
      window.open(`sms:?body=${encodeURIComponent(text)}`);
    }
    if (shareChannels.email) {
      window.open(`mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`);
    }
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      void navigator.clipboard.writeText(text);
    }
    setShowShareModal(false);
    showAlert("Duty Rota Shared", "The message has been copied to your clipboard and your chosen channels opened.", "success");
  };

  // The Add Officer modal's name field searches the roll as the desk types,
  // debounced, and asks for nothing until there are two characters to ask
  // with. The answer belongs to a modal that is still open: when it closes,
  // the callback that would have written the suggestions finds the request
  // cancelled instead. Every state write below sits inside a timer or a
  // promise callback, never in the body of the effect itself.
  useEffect(() => {
    if (!showOfficerModal) return;
    const query = officerForm.name.trim();
    let alive = true;
    const timer = setTimeout(() => {
      if (query.length < 2 || query === pickedOfficerName) {
        setOfficerMatches([]);
        return;
      }
      apiFetch(`/duty-rota/people/?q=${encodeURIComponent(query)}`)
        .then((res) => (res.ok ? res.json() : { matches: [] }))
        .then((data) => {
          if (alive) setOfficerMatches(Array.isArray(data.matches) ? data.matches : []);
        })
        .catch(() => {
          if (alive) setOfficerMatches([]);
        });
    }, 200);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [officerForm.name, showOfficerModal, pickedOfficerName]);

  // The wall is read when its tab is opened, the same way the rota is: this
  // page is the desk's own album shelf, so the list is what most visits are
  // here for. State is settled inside the promise's callbacks.
  useEffect(() => {
    if (activeTab !== "moments") return;
    let alive = true;
    const load = async () => {
      try {
        const res = await apiFetch("/church-events/");
        const data = res.ok ? await res.json() : null;
        if (!alive) return;
        setMoments(Array.isArray(data) ? (data as MomentAlbum[]) : []);
        if (!res.ok) {
          showAlert("Could not load Moments", "Check your connection and try again.", "error");
        }
      } catch {
        if (alive) showAlert("Could not load Moments", "Check your connection and try again.", "error");
      } finally {
        if (alive) setLoadingMoments(false);
      }
    };
    void load();
    return () => {
      alive = false;
    };
  }, [activeTab]);

  const { setHeaderRightAction, setCustomHeader, setHeadingFirst } = usePageHeader();
  const router = useRouter();

  useEffect(() => {
    if (activeTab !== "rota") return;
    // The pulpit and music views are pages of desks that draw their own
    // heading and their own search in the band above — so these variants
    // take neither over, and carry their filters inside the panel instead.
    if (desk !== "deaconate") return;
    setHeadingFirst(true);
    setCustomHeader({
      label: rotaName,
      description: "Sabbath & midweek service duty rosters, communion preparation team assignments.",
    });
    setHeaderRightAction(
      <div className="flex w-full items-center gap-1.5 sm:w-auto">
        <div className="relative min-w-0 flex-1 sm:flex-none sm:w-48">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-moss" />
          <input
            type="text"
            placeholder="Search rota…"
            value={rotaSearchQuery}
            onChange={(e) => setRotaSearchQuery(e.target.value)}
            className="w-full rounded-xl border border-sand-mute bg-white py-1.5 pl-9 pr-3 text-xs outline-none focus:border-ember"
          />
        </div>
        <input
          type="date"
          value={rotaFromDate}
          onChange={(e) => setRotaFromDate(e.target.value)}
          aria-label="From date"
          title="From date"
          className="h-[30px] rounded-xl border border-sand-mute bg-white px-2.5 text-xs text-bark focus:border-ember focus:outline-none hidden sm:block"
        />
        <input
          type="date"
          value={rotaToDate}
          onChange={(e) => setRotaToDate(e.target.value)}
          aria-label="To date"
          title="To date"
          className="h-[30px] rounded-xl border border-sand-mute bg-white px-2.5 text-xs text-bark focus:border-ember focus:outline-none hidden sm:block"
        />
      </div>
    );
    return () => {
      setCustomHeader(null);
      setHeadingFirst(false);
      setHeaderRightAction(null);
    };
  }, [activeTab, desk, rotaName, rotaFromDate, rotaToDate, rotaSearchQuery, setHeaderRightAction, setCustomHeader, setHeadingFirst]);

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
    // The form asks for the day, the time and the officers on it — the title
    // and the duty kind it used to invent are gone, so a line reads by its
    // date and the part each officer is playing.
    if (!newRota.date || savingRota) return;

    const editing = editingRotaId !== null;
    setSavingRota(true);
    try {
      const res = await apiFetch(editing ? `/duty-rota/${editingRotaId}/` : "/duty-rota/", {
        method: editing ? "PUT" : "POST",
        body: JSON.stringify({
          desk: deskParam,
          title: newRota.title.trim(),
          date: newRota.date,
          shift: newRota.shift.trim(),
          // An unstaffed line stays unstaffed: the desk often writes the rota
          // before the team is settled, and "Deacon Board" invented here
          // would be the app rostering people the church never named. The
          // officers ride up whole — name, phone, email, role — so the line
          // reads who to call, and on what part, when the Sabbath comes.
          assigned_team: newRota.officers,
        }),
      });
      if (!res.ok) {
        showAlert(
          "Duty rota not saved",
          firstErrorMessage(await res.json().catch(() => null)) || (editing ? "The duty could not be saved." : "The duty could not be scheduled."),
          "error",
        );
        return;
      }
      setShowAddRotaModal(false);
      setNewRota(blankRota());
      setEditingRotaId(null);
      setShowOfficerModal(false);
      setOfficerMatches([]);
      await loadRota();
      showAlert(
        editing ? "Duty Rota Updated" : "Duty Rota Added",
        editing
          ? `The rota for ${dayFirst(newRota.date)} is saved.`
          : `The rota for ${dayFirst(newRota.date)} is on the board.`,
        "success",
      );
    } catch {
      showAlert("Duty rota not saved", "Check your connection and try again.", "error");
    } finally {
      setSavingRota(false);
    }
  };

  /** A line already on the rota opens back up in the same save form. */
  const openRota = (entry: RotaEntry) => {
    setNewRota({
      // A line saved before the title came back reads as itself, but the
      // field is required on the way out — so it opens with the default
      // rather than with an empty box the desk must notice.
      title: titleOf(entry),
      date: entry.date,
      shift: entry.shift,
      officers: entry.assigned_team.map(normalizeOfficer),
    });
    setEditingRotaId(entry.id);
    setShowAddRotaModal(true);
  };

  /** Leaving the save form forgets the line being written and anyone staged. */
  const closeRotaModal = () => {
    setShowAddRotaModal(false);
    setNewRota(blankRota());
    setEditingRotaId(null);
    setShowOfficerModal(false);
    setOfficerMatches([]);
  };

  const openOfficerModal = () => {
    setOfficerForm(emptyOfficerForm);
    setOfficerMatches([]);
    setPickedOfficerName(null);
    setShowOfficerMatches(true);
    setShowOfficerModal(true);
  };

  const closeOfficerModal = () => {
    setShowOfficerModal(false);
    setOfficerMatches([]);
  };

  /**
   * A suggestion fills in who the person is — name, phone, email — from the
   * member behind it. What they do on the day stays the desk's choice: the
   * office a member holds is not the part they are rostered for this Sabbath,
   * so the duty role is left to be picked below.
   */
  const pickOfficer = (match: OfficerMatch) => {
    // The account rides with the officer from here on: the line keeps their
    // name and contacts, and the daily reminder keeps a way to reach them.
    // The duty stays the desk's — it belongs to the person being rostered,
    // so a new name starts the field empty rather than carrying the last
    // one's over.
    setOfficerForm({ name: match.name, phone: match.phone, email: match.email, role: "", duty: "", member_id: match.id });
    setOfficerMatches([]);
    setPickedOfficerName(match.name);
    setShowOfficerMatches(false);
  };

  /** One officer onto the line — and the modal stays open for the next. */
  const addOfficer = (e: React.FormEvent) => {
    e.preventDefault();
    // A name typed over the pick is somebody else: the account goes with the
    // person who was picked, never with whatever is typed next, or the desk
    // would remind the wrong officer.
    const name = officerForm.name.trim();
    const officer = {
      ...officerForm,
      name,
      member_id: pickedOfficerName === name ? officerForm.member_id ?? null : null,
    };
    if (!officer.name) {
      showAlert("Name the officer", "Type a name, or pick one from the roll.", "error");
      return;
    }
    const alreadyOn = newRota.officers.some(
      (row) => row.name === officer.name && (row.phone || "") === (officer.phone || ""),
    );
    if (alreadyOn) {
      showAlert("Already on this line", `${officer.name} is already rostered here.`, "info");
      return;
    }
    setNewRota((prev) => ({ ...prev, officers: [...prev.officers, officer] }));
    setOfficerForm(emptyOfficerForm);
    setOfficerMatches([]);
    setPickedOfficerName(null);
  };

  const removeOfficer = (index: number) =>
    setNewRota((prev) => ({ ...prev, officers: prev.officers.filter((_, i) => i !== index) }));

  /** Leave the moment form with nothing staged. */
  const closeMomentModal = () => {
    setShowMomentModal(false);
    setMomentTitle("");
    setMomentDay("");
    setMomentNote("");
    setMomentFiles([]);
    setMomentLinks("");
  };

  /**
   * Document a moment: the day, a few words, the pictures, and the address
   * of any video of it. It goes straight out — the desk documents, the
   * Fellowship wall shows — because a moment is the church's own news.
   */
  const documentMoment = async (e: React.FormEvent) => {
    e.preventDefault();
    const title = momentTitle.trim();
    const links = momentLinks
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    if (!title || postingMoment) return;

    setPostingMoment(true);
    try {
      const body = new FormData();
      body.append("title", title);
      if (momentNote.trim()) body.append("description", momentNote.trim());
      if (momentDay) body.append("happened_on", momentDay);
      momentFiles.forEach((file) => body.append("media_files", file));
      links.forEach((link) => body.append("video_links", link));

      const res = await apiFetch("/church-events/", { method: "POST", body });
      if (!res.ok) {
        showAlert(
          "The moment was not documented",
          firstErrorMessage(await res.json().catch(() => null)) || "Nothing was posted. Try again.",
          "error",
        );
        return;
      }
      const album = (await res.json()) as MomentAlbum;
      setMoments((prev) => [album, ...prev]);
      closeMomentModal();
      showAlert("Moment documented", `"${title}" is on the Moments wall.`, "success");
    } catch {
      showAlert("The moment was not documented", "Check your connection and try again.", "error");
    } finally {
      setPostingMoment(false);
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
      `"${titleOf(entry)}" on ${dayFirst(entry.date)} leaves the rota for good.`,
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

  /**
   * Take an item off the property register: entered twice, sold, or written
   * off. The item and its movement lines go together — the audit trail
   * belongs to the item — and the same officers' gate that registers property
   * is the one the server asks for here.
   */
  const removeInventoryItem = async (item: InventoryItem) => {
    const result = await showAlert(
      "Remove this item?",
      `"${item.name}" leaves the property register for good, with its movement history.`,
      "warning",
      {
        showCancelButton: true,
        confirmButtonText: "Remove",
        cancelButtonText: "Keep",
        confirmButtonColor: brand.ember,
      },
    );
    if (!result.isConfirmed) return;
    try {
      const res = await apiFetch(`/inventory/${item.id}/`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showAlert("Could not remove it", data.detail || "Try again.", "error");
        return;
      }
      setInventory((prev) => prev.filter((row) => row.id !== item.id));
      showAlert("Item removed", data.detail || "It is off the property register.", "success", {
        toast: true,
        timer: 3500,
        showConfirmButton: false,
      });
    } catch {
      showAlert("Network error", "Could not reach the server.", "error");
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

  // Same for a duty role already on an edited officer — a part the desk
  // rostered once and the four below have since replaced.


  return (
    <RotaFiltersContext.Provider value={{ filters: rotaFilters, hosted: rotaFiltersHosted }}>
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
                          <button
                            onClick={() => {
                              setOpenActionMenuId(null);
                              void removeInventoryItem(item);
                            }}
                            className="flex w-full items-center gap-2 px-4 py-2 text-xs text-bark hover:bg-sand"
                          >
                            <Trash2 className="h-3.5 w-3.5 text-ember" />
                            Remove item
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
                    <button
                      onClick={() => { void removeInventoryItem(item); }}
                      className="inline-flex items-center gap-1 rounded-lg border border-sand-mute bg-white px-3 py-1.5 text-[11px] font-semibold text-bark hover:bg-sand"
                    >
                      <Trash2 className="h-3 w-3 text-ember" />
                      Remove
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

      {/* ── TAB: DUTY ROTA — scheduled, edited and rostered here ── */}
      {activeTab === "rota" && (
        <>
          <div className="flex-1 overflow-y-auto min-h-0 p-4 sm:p-6 space-y-4">
            {(isPulpit || desk === "music") && !rotaFiltersHosted && (
              /* The rota views' filters, when no surface above hosts them.
                 The Personal Ministries desk keeps its own heading, so while it
                 renders this panel it also reads the filters from context and
                 draws them at the right of that heading — this inline band then
                 steps aside. Where the panel is opened without such a desk (the
                 Ministry map), it carries the filters itself. */
              <div className="flex flex-wrap items-center gap-1.5 rounded-2xl border border-sand-line bg-white p-3 shadow-sm">
                <div className="relative min-w-0 flex-1 sm:flex-none sm:w-56">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-moss" />
                  <input
                    type="text"
                    placeholder={desk === "music" ? "Search music duties…" : "Search the pulpit team…"}
                    value={rotaSearchQuery}
                    onChange={(e) => setRotaSearchQuery(e.target.value)}
                    className="w-full rounded-xl border border-sand-mute bg-white py-1.5 pl-9 pr-3 text-xs outline-none focus:border-ember"
                  />
                </div>
                <input
                  type="date"
                  value={rotaFromDate}
                  onChange={(e) => setRotaFromDate(e.target.value)}
                  aria-label="From date"
                  title="From date"
                  className="h-[30px] rounded-xl border border-sand-mute bg-white px-2.5 text-xs text-bark focus:border-ember focus:outline-none"
                />
                <span className="text-xs text-moss">to</span>
                <input
                  type="date"
                  value={rotaToDate}
                  onChange={(e) => setRotaToDate(e.target.value)}
                  aria-label="To date"
                  title="To date"
                  className="h-[30px] rounded-xl border border-sand-mute bg-white px-2.5 text-xs text-bark focus:border-ember focus:outline-none"
                />
              </div>
            )}
            {loadingRota ? (
              <div className="rounded-2xl border border-sand-line bg-white p-8 text-center text-xs text-moss shadow-sm">
                Loading the {rotaName.toLowerCase()}…
              </div>
            ) : filteredRota.length === 0 ? (
              <div className="rounded-2xl border border-sand-line bg-white p-8 text-center text-xs text-moss shadow-sm">
                {rota.length === 0
                  ? desk === "music"
                    ? "No one is on the music rota yet. Schedule who sings and plays on the Sabbath."
                    : isPulpit
                      ? "No one is on the pulpit team yet. Schedule the Sabbath's preachers, players and readers."
                      : "No duty rota has been scheduled yet."
                  : "No entries match your filters."}
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {filteredRota.map((item) => (
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
                    <h3 className="font-bold text-sm text-bark">{titleOf(item)}</h3>
                    <p className="text-xs text-moss flex items-center gap-1">
                      <Clock className="h-3.5 w-3.5 text-ember" />
                      {item.shift || "Time not set"}
                    </p>

                    <div>
                      <p className="text-[11px] font-bold text-bark mb-1">Assigned Officers:</p>
                      {item.assigned_team.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {item.assigned_team.map((entry, idx) => {
                            const officer = normalizeOfficer(entry);
                            const details = [officer.duty, officer.role, officer.phone].filter(Boolean).join(" · ");
                            return (
                              <span
                                key={`${officer.name}-${idx}`}
                                title={
                                  officer.member_id
                                    ? `${details || officer.name} · reminded on their account`
                                    : details || officer.name
                                }
                                className="inline-flex items-center gap-1 rounded-lg border border-sand-line bg-sand-card px-2 py-0.5 text-[10px] font-semibold text-bark"
                              >
                                {officer.member_id && (
                                  <Bell
                                    className="h-3 w-3 shrink-0 text-ember"
                                    aria-label="Reminders go to this officer's account"
                                  />
                                )}
                                {officer.name}
                                {officer.phone && (
                                  <span className="ml-1 font-normal text-moss">{officer.phone}</span>
                                )}
                              </span>
                            );
                          })}
                        </div>
                      ) : (
                        <p className="text-[11px] text-moss">Nobody rostered yet.</p>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center justify-end gap-1.5 border-t border-sand-line/60 pt-2">
                      <button
                        type="button"
                        onClick={() => openShareModal(item)}
                        aria-label={`Share ${titleOf(item)}`}
                        title="Share this duty via WhatsApp, SMS, or Email"
                        className="inline-flex items-center gap-1 rounded-lg border border-sand-line bg-white px-2 py-1.5 text-[11px] font-semibold text-moss transition hover:border-ember hover:text-ember"
                      >
                        <Share2 className="h-3.5 w-3.5" aria-hidden="true" />
                        Share
                      </button>
                      <button
                        type="button"
                        onClick={() => void printRotaPdf(item)}
                        aria-label={`Print ${titleOf(item)}`}
                        title="Print this duty entry"
                        className="inline-flex items-center gap-1 rounded-lg border border-sand-line bg-white px-2 py-1.5 text-[11px] font-semibold text-moss transition hover:border-ember hover:text-ember"
                      >
                        <Printer className="h-3.5 w-3.5" aria-hidden="true" />
                        Print
                      </button>
                      <button
                        type="button"
                        onClick={() => openRota(item)}
                        aria-label={`Edit the duty \"${titleOf(item)}\"`}
                        title="Edit this duty and its officers"
                        className="inline-flex items-center gap-1 rounded-lg border border-sand-line bg-white px-2 py-1.5 text-[11px] font-semibold text-moss transition hover:border-ember hover:text-ember"
                      >
                        <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => removeRota(item)}
                        disabled={removingRotaId === item.id}
                        aria-label={`Remove the duty "${titleOf(item)}"`}
                        title="Remove this duty from the rota"
                        className="inline-flex items-center gap-1 rounded-lg border border-sand-line bg-white px-2 py-1.5 text-[11px] font-semibold text-moss transition hover:border-red-300 hover:text-red-600 disabled:opacity-50"
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

          {/* ── Fixed Bottom Bar for Duty Rota ── */}
          <div className="shrink-0 border-t border-sand-line bg-white p-3 sm:px-6 sm:py-3 shadow-[0_-4px_16px_rgba(0,0,0,0.08)] pb-[max(0.75rem,env(safe-area-inset-bottom))] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 z-20">
            <p className="hidden text-[11px] text-moss sm:block">
              {filteredRota.length} of {rota.length} {rota.length === 1 ? "duty" : "duties"} scheduled
            </p>
            <div className="flex w-full items-center gap-2 sm:w-auto">
              <button
                type="button"
                onClick={() => openShareModal(null)}
                className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl border border-sand-mute bg-white px-3 py-2 text-xs font-semibold text-bark transition hover:border-ember hover:bg-sand"
              >
                <Share2 className="h-3.5 w-3.5 text-ember" />
                Share
              </button>
              <button
                type="button"
                onClick={() => void printRotaPdf()}
                className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl border border-sand-mute bg-white px-3 py-2 text-xs font-semibold text-bark transition hover:border-ember hover:bg-sand"
              >
                <Printer className="h-3.5 w-3.5 text-ember" />
                Print
              </button>
              <button
                type="button"
                onClick={() => {
                  setEditingRotaId(null);
                  setNewRota(blankRota());
                  setShowAddRotaModal(true);
                }}
                className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl bg-bark px-3.5 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-bark-950"
              >
                <Plus className="h-4 w-4" />
                Schedule
              </button>
            </div>
          </div>
        </>
      )}

      {/* ── TAB: MOMENTS — the day, its pictures, and the way to add one ── */}
      {activeTab === "moments" && (
        <div className="flex-1 overflow-y-auto min-h-0 p-4 sm:p-6 space-y-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            {/* Named by the strip above on a wide screen. */}
            <div className="md:hidden">
              <h2 className="text-base font-bold text-bark">Moments</h2>
              <p className="text-xs text-moss">
                Document a day of the church: its pictures, and a link to any video of it.
              </p>
            </div>
            <button
              onClick={() => setShowMomentModal(true)}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-bark px-4 py-2 text-xs font-bold text-white shadow transition hover:bg-bark-950"
            >
              <Plus className="h-4 w-4" />
              Document a moment
            </button>
          </div>

          {loadingMoments ? (
            <div className="rounded-2xl border border-sand-line bg-white p-8 text-center text-xs text-moss shadow-sm">
              Loading moments…
            </div>
          ) : moments.length === 0 ? (
            <div className="rounded-2xl border border-sand-line bg-white p-8 text-center text-xs text-moss shadow-sm">
              No moment has been documented yet. The Sabbath that just was — its pictures belong on the wall.
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {moments.map((album) => {
                const cover = album.media.find((picture) => !picture.is_video);
                const links = album.video_links ?? [];
                return (
                  <article
                    key={album.id}
                    className="overflow-hidden rounded-2xl border border-sand-line bg-white shadow-sm"
                  >
                    {cover ? (
                      // The wall's own tiles are plain images: the pictures are
                      // the point, and a next/image proxy adds nothing here.
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={cover.url} alt={album.title} className="h-40 w-full object-cover" />
                    ) : (
                      <div className="flex h-40 w-full items-center justify-center bg-sand-card text-moss">
                        <Images className="h-6 w-6" aria-hidden="true" />
                      </div>
                    )}
                    <div className="space-y-2 p-4">
                      <div className="flex items-center justify-between gap-2">
                        <h3 className="text-sm font-bold text-bark">{album.title}</h3>
                        {album.happened_on && (
                          <span className="shrink-0 text-[11px] font-bold text-bark">
                            {dayFirst(album.happened_on)}
                          </span>
                        )}
                      </div>
                      {album.description && <p className="text-xs text-moss">{album.description}</p>}
                      <p className="text-[11px] text-moss">
                        {album.media_count} {album.media_count === 1 ? "picture" : "pictures"}
                        {links.length > 0 &&
                          ` · ${links.length} ${links.length === 1 ? "video" : "videos"}`}
                        {album.posted_by_name && ` · by ${album.posted_by_name}`}
                      </p>
                      {links.length > 0 && (
                        <ul className="space-y-1">
                          {links.map((link, idx) => (
                            <li key={`${album.id}-link-${idx}`}>
                              <a
                                href={link}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 text-[11px] font-semibold text-ember hover:underline"
                              >
                                <ExternalLink className="h-3 w-3" aria-hidden="true" />
                                {link.replace(/^https?:\/\//, "").slice(0, 42)}
                              </a>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </article>
                );
              })}
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
          <div className="flex items-center gap-1 md:hidden">
            {backArrow}
            <div>
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
          <div className="flex max-h-[90vh] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-sand-line bg-white shadow-xl">
            <div className="flex shrink-0 items-center justify-between border-b border-sand-line px-6 pb-3 pt-6">
              <h3 className="font-bold text-base text-bark">Send a Property Request</h3>
              <button onClick={() => setShowRequestModal(false)} className="text-moss hover:text-bark">
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="mt-2 text-[11px] text-moss">
              Ask the offices to buy an item or to repair one. The answer comes back to the desk.
            </p>
            <form onSubmit={sendPropertyRequest} className="flex min-h-0 flex-1 flex-col">
              <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 pb-4 pt-4 text-xs">
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
              </div>

              {/* The always-visible answer row at the foot — the requests modals' pattern. */}
              <div className="flex shrink-0 justify-end gap-2 border-t border-sand-line px-6 pb-5 pt-3">
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
          <div className="flex max-h-[90vh] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-sand-line bg-white shadow-xl">
            <div className="flex shrink-0 items-center justify-between border-b border-sand-line px-6 pb-3 pt-6">
              <h3 className="font-bold text-base text-bark">Register Church Property</h3>
              <button onClick={() => setShowAddModal(false)} className="text-moss hover:text-bark">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={registerItem} className="flex min-h-0 flex-1 flex-col">
              <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 pb-4 pt-4 text-xs">
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

              </div>

              {/* The always-visible save row at the foot — the requests modals' pattern. */}
              <div className="flex shrink-0 justify-end gap-2 border-t border-sand-line px-6 pb-5 pt-3">
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
          <div className="flex max-h-[90vh] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-sand-line bg-white shadow-xl">
            <div className="flex shrink-0 items-center justify-between border-b border-sand-line px-6 pb-3 pt-6">
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

            <form onSubmit={recordMovement} className="flex min-h-0 flex-1 flex-col">
              <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 pb-4 pt-4 text-xs">
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

              </div>

              {/* The always-visible record row at the foot — the requests modals' pattern. */}
              <div className="flex shrink-0 justify-end gap-2 border-t border-sand-line px-6 pb-5 pt-3">
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
          <div className="flex max-h-[90vh] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-sand-line bg-white shadow-xl">
            <div className="flex shrink-0 items-center justify-between border-b border-sand-line px-6 pb-3 pt-6">
              <h3 className="font-bold text-base text-bark">
                {editingRotaId !== null ? `Edit ${rotaName}` : `Schedule ${rotaName}`}
              </h3>
              <button onClick={closeRotaModal} aria-label="Close" className="text-moss hover:text-bark">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={scheduleRota} className="flex min-h-0 flex-1 flex-col">
              <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 pb-4 pt-4 text-xs">
              <div>
                <label className="font-bold text-bark">Title *</label>
                <input
                  type="text"
                  required
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
                  <label className="font-bold text-bark">Shift / Time</label>
                  <input
                    type="text"
                    placeholder="08:30 AM - 01:00 PM"
                    value={newRota.shift}
                    onChange={(e) => setNewRota({ ...newRota, shift: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-sand-line p-2.5 text-xs text-bark"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between gap-2">
                  <label className="font-bold text-bark">Assigned Officers</label>
                  <button
                    type="button"
                    onClick={openOfficerModal}
                    className="inline-flex items-center gap-1 rounded-lg border border-ember bg-white px-2.5 py-1 text-[11px] font-bold text-ember transition hover:bg-sand"
                  >
                    <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                    Add Officer
                  </button>
                </div>
                {newRota.officers.length === 0 ? (
                  <p className="mt-2 rounded-xl border border-dashed border-sand-line bg-sand-card px-3 py-2.5 text-[11px] text-moss">
                    Nobody rostered yet. Add an officer — search the roll or type the name — and
                    keep adding until the team is down.
                  </p>
                ) : (
                  <ul className="mt-2 max-h-56 space-y-1.5 overflow-y-auto">
                    {newRota.officers.map((officer, idx) => (
                      <li
                        key={`${officer.name}-${idx}`}
                        className="flex items-start justify-between gap-2 rounded-xl border border-sand-line bg-sand-card px-3 py-2"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-xs font-bold text-bark">{officer.name}</p>
                          <p className="truncate text-[10px] text-moss">
                            {[officer.duty, officer.role, officer.phone, officer.email].filter(Boolean).join(" · ") ||
                              "No contact taken down"}
                            {officer.member_id ? " · Reminders on" : ""}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeOfficer(idx)}
                          aria-label={`Remove ${officer.name} from this line`}
                          title="Take this officer off the line"
                          className="shrink-0 text-moss transition hover:text-red-600"
                        >
                          <X className="h-4 w-4" aria-hidden="true" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              </div>

              {/* The always-visible save row at the foot — the requests modals' pattern. */}
              <div className="flex shrink-0 justify-end gap-2 border-t border-sand-line px-6 pb-5 pt-3">
                <button
                  type="button"
                  onClick={closeRotaModal}
                  className="rounded-xl border border-sand-line px-4 py-2 text-xs font-bold text-bark"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingRota}
                  className="rounded-xl bg-bark px-4 py-2 text-xs font-bold text-white shadow disabled:opacity-60"
                >
                  {savingRota ? "Saving…" : editingRotaId !== null ? "Save Changes" : `Save ${rotaName}`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: SHARE DUTY ROTA */}
      {showShareModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="flex max-h-[90vh] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-sand-line bg-white shadow-xl">
            <div className="flex shrink-0 items-center justify-between border-b border-sand-line px-6 pb-3 pt-6">
              <h3 className="font-bold text-base text-bark">
                {shareTarget ? "Share Duty Details" : `Share ${rotaName}`}
              </h3>
              <button
                onClick={() => setShowShareModal(false)}
                aria-label="Close"
                className="text-moss hover:text-bark"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-4 pt-4">
            <p className="text-xs text-moss">
              Select the channels you wish to share to. You can choose any combination or select all.
            </p>

            {/* Checkboxes */}
            <div className="space-y-2.5 rounded-xl border border-sand-line bg-sand-card p-3.5 text-xs">
              <div className="flex items-center justify-between pb-2 border-b border-sand-line">
                <span className="font-bold text-bark">Channels</span>
                <button
                  type="button"
                  onClick={() => {
                    const allSelected = shareChannels.whatsapp && shareChannels.sms && shareChannels.email;
                    setShareChannels({
                      whatsapp: !allSelected,
                      sms: !allSelected,
                      email: !allSelected,
                    });
                  }}
                  className="text-xs font-semibold text-ember hover:underline"
                >
                  {shareChannels.whatsapp && shareChannels.sms && shareChannels.email ? "Deselect All" : "Select All"}
                </button>
              </div>

              <label className="flex items-center gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={shareChannels.whatsapp}
                  onChange={(e) => setShareChannels((prev) => ({ ...prev, whatsapp: e.target.checked }))}
                  className="h-4 w-4 rounded accent-bark"
                />
                <span className="font-medium text-bark">WhatsApp</span>
              </label>

              <label className="flex items-center gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={shareChannels.sms}
                  onChange={(e) => setShareChannels((prev) => ({ ...prev, sms: e.target.checked }))}
                  className="h-4 w-4 rounded accent-bark"
                />
                <span className="font-medium text-bark">SMS</span>
              </label>

              <label className="flex items-center gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={shareChannels.email}
                  onChange={(e) => setShareChannels((prev) => ({ ...prev, email: e.target.checked }))}
                  className="h-4 w-4 rounded accent-bark"
                />
                <span className="font-medium text-bark">Email</span>
              </label>
            </div>

            {/* Preview */}
            <div>
              <p className="font-bold text-[11px] text-bark mb-1">Message Preview:</p>
              <div className="max-h-36 overflow-y-auto rounded-xl border border-sand-line bg-sand p-3 font-mono text-[11px] text-bark whitespace-pre-wrap">
                {shareContent.text}
              </div>
            </div>

            </div>

            {/* The always-visible share row at the foot — the requests modals' pattern. */}
            <div className="flex shrink-0 items-center justify-end gap-2 border-t border-sand-line px-6 pb-5 pt-3">
              <button
                type="button"
                onClick={() => setShowShareModal(false)}
                className="rounded-xl border border-sand-line px-4 py-2 text-xs font-semibold text-bark hover:bg-sand"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={executeShare}
                disabled={!shareChannels.whatsapp && !shareChannels.sms && !shareChannels.email}
                className="rounded-xl bg-bark px-5 py-2 text-xs font-bold text-white transition hover:bg-bark-950 disabled:opacity-50"
              >
                Share Rota
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: ADD OFFICER — stacked over the save form so the desk can roster
          a whole team in one sitting: every Add Officer folds these four fields
          into the line being written and clears them for the next, and the save
          form behind keeps whatever has been added so far. The name searches the
          roll as it is typed; any of the four can also be typed by hand. */}
      {showOfficerModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4">
          <div className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-sand-line bg-white shadow-xl">
            <div className="flex shrink-0 items-start justify-between gap-3 border-b border-sand-line px-6 pb-3 pt-6">
              <div>
                <h3 className="font-bold text-base text-bark">Add Officer</h3>
                <p className="mt-0.5 text-[11px] text-moss">
                  {newRota.officers.length === 0
                    ? "The first officer on this line."
                    : `${newRota.officers.length} rostered so far — keep adding, then save the rota.`}
                </p>
              </div>
              <button onClick={closeOfficerModal} aria-label="Close" className="text-moss hover:text-bark">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={addOfficer} className="flex min-h-0 flex-1 flex-col">
              <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-4 pt-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div className="relative">
                  <label className="font-bold text-bark">Name *</label>
                  <input
                    type="text"
                    required
                    autoFocus
                    placeholder="Deacon David"
                    value={officerForm.name}
                    onChange={(e) => {
                      setOfficerForm({ ...officerForm, name: e.target.value });
                      setShowOfficerMatches(true);
                    }}
                    onFocus={() => setShowOfficerMatches(true)}
                    className="mt-1 w-full rounded-xl border border-sand-line p-2.5 text-xs text-bark"
                  />
                  {showOfficerMatches && officerForm.name.trim().length >= 2 && (
                    officerMatches.length > 0 ? (
                      <ul className="absolute z-10 mt-1 max-h-44 w-full overflow-y-auto rounded-xl border border-sand-line bg-white shadow-lg">
                        {officerMatches.map((match) => (
                          <li key={match.id}>
                            <button
                              type="button"
                              onClick={() => pickOfficer(match)}
                              className="flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left transition hover:bg-sand"
                            >
                              <span className="font-semibold text-bark">{match.name}</span>
                              <span className="text-[10px] text-moss">
                                {[match.phone, match.email].filter(Boolean).join(" · ")}
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="absolute z-10 mt-1 w-full rounded-xl border border-sand-line bg-white px-3 py-2 text-[10px] text-moss shadow-lg">
                        No member matched. The name can still be typed as it should print.
                      </p>
                    )
                  )}
                </div>

                <div>
                  <label className="font-bold text-bark">Phone</label>
                  <input
                    type="tel"
                    placeholder="0712 345 678"
                    value={officerForm.phone}
                    onChange={(e) => setOfficerForm({ ...officerForm, phone: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-sand-line p-2.5 text-xs text-bark"
                  />
                </div>

                <div>
                  <label className="font-bold text-bark">Email</label>
                  <input
                    type="email"
                    placeholder="david@example.com"
                    value={officerForm.email}
                    onChange={(e) => setOfficerForm({ ...officerForm, email: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-sand-line p-2.5 text-xs text-bark"
                  />
                </div>

                <div>
                  <label className="font-bold text-bark">Duty</label>
                  <input
                    type="text"
                    placeholder="Counting the offering, holding the door…"
                    value={officerForm.duty}
                    onChange={(e) => setOfficerForm({ ...officerForm, duty: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-sand-line p-2.5 text-xs text-bark"
                  />
                </div>
              </div>

              </div>

              {/* The always-visible add row at the foot — the requests modals' pattern. */}
              <div className="mt-3 flex shrink-0 justify-end gap-2 border-t border-sand-line px-6 pb-4 pt-3">
                <button
                  type="button"
                  onClick={closeOfficerModal}
                  className="rounded-xl border border-sand-line px-4 py-2 text-xs font-bold text-bark"
                >
                  Done
                </button>
                <button
                  type="submit"
                  className="inline-flex items-center gap-1 rounded-xl bg-bark px-4 py-2 xs font-bold text-white shadow"
                >
                  <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                  Add Officer
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: DOCUMENT A MOMENT — the day, its words, its pictures, and the
          address of any video of it. Pictures go up as files; video rides as
          a link, because an album's pictures are all the video the church's
          storage will hold for now. */}
      {showMomentModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="flex max-h-[92vh] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-sand-line bg-white shadow-xl">
            <div className="flex shrink-0 items-center justify-between border-b border-sand-line px-6 pb-3 pt-6">
              <h3 className="font-bold text-base text-bark">Document a moment</h3>
              <button onClick={closeMomentModal} aria-label="Close" className="text-moss hover:text-bark">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={documentMoment} className="flex min-h-0 flex-1 flex-col">
              <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 pb-4 pt-4 text-xs">
              <div>
                <label className="font-bold text-bark">What it was *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Communion Service"
                  value={momentTitle}
                  onChange={(e) => setMomentTitle(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-sand-line p-2.5 text-xs text-bark"
                />
              </div>

              <div>
                <label className="font-bold text-bark">The day it happened</label>
                <input
                  type="date"
                  value={momentDay}
                  onChange={(e) => setMomentDay(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-sand-line p-2.5 text-xs text-bark"
                />
              </div>

              <div>
                <label className="font-bold text-bark">A few words</label>
                <textarea
                  rows={3}
                  placeholder="What the day was, for whoever opens it…"
                  value={momentNote}
                  onChange={(e) => setMomentNote(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-sand-line p-2.5 text-xs text-bark"
                />
              </div>

              <div>
                <p className="font-bold text-bark">Pictures</p>
                <button
                  type="button"
                  onClick={() => momentFileInputRef.current?.click()}
                  className="mt-1 w-full rounded-xl border border-dashed border-sand-line bg-sand-card px-4 py-4 text-center text-[11px] font-semibold text-moss transition hover:border-ember hover:text-bark"
                >
                  Choose from this device
                </button>
                <input
                  ref={momentFileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(e) => setMomentFiles(Array.from(e.target.files ?? []))}
                />
                {momentFiles.length > 0 && (
                  <ul className="mt-2 max-h-32 space-y-1 overflow-y-auto">
                    {momentFiles.map((file, index) => (
                      <li
                        key={`${file.name}-${index}`}
                        className="flex items-center justify-between rounded-xl bg-sand px-3 py-2 text-[11px]"
                      >
                        <span className="min-w-0 truncate font-semibold text-bark">{file.name}</span>
                        <button
                          type="button"
                          onClick={() => setMomentFiles((current) => current.filter((_, i) => i !== index))}
                          aria-label={`Remove ${file.name}`}
                          className="shrink-0 text-moss transition hover:text-red-600"
                        >
                          <X className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div>
                <label className="font-bold text-bark">Video link</label>
                <textarea
                  rows={2}
                  placeholder={"https://youtube.com/…\nOne link per line"}
                  value={momentLinks}
                  onChange={(e) => setMomentLinks(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-sand-line p-2.5 text-xs text-bark"
                />
                <p className="mt-1 text-[10px] text-moss">
                  A link to where the video lives — it is shown on the wall beside the pictures.
                </p>
              </div>

              </div>

              {/* The always-visible post row at the foot — the requests modals' pattern. */}
              <div className="flex shrink-0 justify-end gap-2 border-t border-sand-line px-6 pb-5 pt-3">
                <button
                  type="button"
                  onClick={closeMomentModal}
                  className="rounded-xl border border-sand-line px-4 py-2 text-xs font-bold text-bark"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={postingMoment}
                  className="rounded-xl bg-bark px-4 py-2 text-xs font-bold text-white shadow disabled:opacity-60"
                >
                  {postingMoment ? "Posting…" : "Post the moment"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
    </RotaFiltersContext.Provider>
  );
}
