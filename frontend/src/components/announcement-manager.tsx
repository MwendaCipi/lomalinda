"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { showAlert } from "@/lib/alerts";
import { ArrowUpRight, Download, Megaphone, Search, Send, Sparkles, X } from "lucide-react";
import { brand } from "@/lib/brand";
import { usePageHeader } from "@/components/app-frame";
import { localDate, dayFirst, dayFirstTime } from "@/lib/dates";
import { eventLabel } from "@/lib/announcement-dates";
import { AnnouncementAttachment } from "@/components/announcement-attachment";
import { CARD_OPTION_CHOICES, GIVING_OPTION_CODES } from "@/lib/announcement-options";
import { RecordList } from "./record-list";

/**
 * The "Post to" vocabulary: where a post travels, as one flat list — who it
 * reaches first, then the congregation groups it addresses.
 */
const POST_TO_OPTIONS: { value: string; label: string }[] = [
  { value: "all", label: "All users" },
  { value: "members_only", label: "Members only" },
  { value: "public_website", label: "Public website" },
  { value: "adventist_men", label: "Adventist Men" },
  { value: "adventist_women", label: "Adventist Women" },
  { value: "young_adults", label: "Young Adults" },
  { value: "board", label: "Board Members" },
  // Department addressing: a post to one of these reaches the department's
  // roll holders and its members (the backend resolves both).
  { value: "men_ministry", label: "AMM (Adventist Men)" },
  { value: "women_ministry", label: "AWM (Adventist Women)" },
  { value: "youth_leader", label: "AYM (Youth & Children)" },
  { value: "apm_leader", label: "APM (Possibility Ministries)" },
  { value: "chaplaincy", label: "Chaplaincy" },
  { value: "welfare_ministry", label: "Welfare Ministry" },
];

const REACH_LABELS: Record<string, string> = {
  public_website: "Public website",
  members_only: "Members only",
  all: "All users",
};

/** The manager's view-model of where a post travels. */
function parsePostTo(visibility?: string, audience?: string[]): { reach: string; ministries: string[] } {
  return {
    reach: REACH_LABELS[visibility ?? ""] ? (visibility as string) : "members_only",
    ministries: Array.isArray(audience) ? audience : [],
  };
}

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

/** Keep in sync with validate_text in backend/members/serializers.py. */
const ANNOUNCEMENT_TEXT_LIMIT = 500;

/** Ties the composer's buttons to its form: the buttons stand in the dialog's
 *  fixed footer, outside the form they submit. */
const COMPOSER_FORM_ID = "announcement-composer-form";

export type Announcement = {
  id: number;
  title: string;
  text: string;
  href?: string | null;
  event_date_from?: string | null;
  event_date_to?: string | null;
  event_time_from?: string | null;
  event_time_to?: string | null;
  attachment?: string | null;
  attachment_name?: string | null;
  attachment_size?: number | null;
  visibility: string;
  audience?: string[];
  action_type?: "none" | "tithe" | "combined_offering" | "13th_sabbath" | "camp_expenses" | "camp_goal" | "local_church_budget" | "respond";
  announcement_type?: "awareness" | "web_conference" | "promotion" | "opinion" | "job_vacancy";
  response_mode?: "open" | "closed" | "";
  response_options?: string;
  responses?: { id: number; action_type: string; response_text?: string; response_choice?: string; respondent_name?: string; created_at: string }[];
  support_account?: string | null;
  // The buttons this post's card carries — codes from CARD_OPTION_CHOICES.
  // Empty means a plain notice with nothing to press.
  options?: string[];
  // Scheduling: when the post goes live, and whether the notice repeats.
  publish_at?: string | null;
  repeat?: "none" | "daily" | "weekly" | "monthly";
  // The giving buttons a post saved before the picker existed carries.
  giving_actions?: string[];
  sharing_option?: string;
  action_prompt?: string;
  starts_at?: string | null;
  expires_at?: string | null;
  created_at: string;
  published?: boolean;
};

/** How a notice repeats once it is live. */
const REPEAT_CHOICES = [
  { value: "none", label: "Does not repeat" },
  { value: "daily", label: "Every day" },
  { value: "weekly", label: "Every week" },
  { value: "monthly", label: "Every month" },
] as const;

/** A date-only string from the API, rendered without shifting a day. */
function dayLabel(iso?: string | null): string {
  return dayFirst(iso, "—");
}  /** Which reach values are single-choice; the rest are congregation groups. */
  const REACH_VALUES = new Set(["all", "members_only", "public_website"]);

  /** The office's words for where this post sits in its display window. */
function windowLabel(item: Announcement): string {
  const today = localDate();
  if (item.starts_at && item.starts_at > today) return `Starts ${dayLabel(item.starts_at)}`;
  if (item.expires_at && item.expires_at < today) return `Ended ${dayLabel(item.expires_at)}`;
  if (!item.expires_at) return "Shows until removed";
  return `Shows until ${dayLabel(item.expires_at)}`;
}

/** DRF reports field errors as `{field: [message]}`; surface the first one. */
function firstErrorMessage(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const record = data as Record<string, unknown>;
  if (typeof record.detail === "string") return record.detail;
  for (const value of Object.values(record)) {
    if (typeof value === "string") return value;
    if (Array.isArray(value) && typeof value[0] === "string") return value[0];
    // A list field reports per index (`{ giving_actions: { 0: ["…"] } }`),
    // so dig one level deep — otherwise the officer sees the generic
    // "Unable to save" fallback and never the reason the API refused.
    if (value && typeof value === "object") {
      const nested = firstErrorMessage(value);
      if (nested) return nested;
    }
  }
  return null;
}

function channelsLabel(sharing?: string): string {
  if (!sharing) return "—";
  return sharing
    .split(",")
    .map((part) => {
      const value = part.trim().toLowerCase();
      return value === "site"
        ? "Site"
        : value === "sms"
          ? "SMS"
          : value === "email"
            ? "Email"
            : value === "phone"
              ? "Phone"
              : value === "all"
                ? "Site, Email, SMS, Phone"
                : part.trim();
    })
    .filter(Boolean)
    .join(", ");
}

/** Live tally for a closed-response opinion poll.
 *
 * Every member's pick is stored verbatim as `response_choice`, so the tally
 * groups responses by exactly the options the officer offered. Each option
 * gets a row with a share bar and its count; the leader is highlighted. An
 * option with no picks still appears — its empty bar tells the officer the
 * question was seen and declined, not forgotten.
 */
function PollTally({ item }: { item: Announcement }) {
  const options = (item.response_options || "").split("\n").map((line) => line.trim()).filter(Boolean);
  const picks = (item.responses ?? []).filter((r) => r.response_choice);
  if (item.announcement_type !== "opinion" || item.response_mode !== "closed" || options.length === 0) return null;
  const total = picks.length;
  const counts = new Map<string, number>();
  picks.forEach((r) => counts.set(r.response_choice as string, (counts.get(r.response_choice as string) ?? 0) + 1));
  // The leading option follows the order the officer declared: a tie is
  // broken by whoever was listed first, so the highlight is stable.
  const best = total > 0 ? Math.max(...counts.values()) : 0;
  const leader = total > 0 ? (options.find((option) => (counts.get(option) ?? 0) === best) ?? null) : null;
  return (
    <div className="mt-1 rounded-xl border border-sand-soft bg-sand p-2.5">
      <p className="text-[10px] font-bold uppercase tracking-wide text-moss">
        {total === 0 ? "No responses yet" : `${total} response${total === 1 ? "" : "s"}`}
      </p>
      <div className="mt-1.5 space-y-1.5">
        {options.map((option) => {
          const count = counts.get(option) ?? 0;
          const pct = total > 0 ? Math.round((count / total) * 100) : 0;
          const isLeader = total > 0 && option === leader;
          return (
            <div key={option}>
              <div className="flex items-baseline justify-between gap-2">
                <span className={`min-w-0 truncate text-[11px] ${isLeader ? "font-bold text-moss-dark" : "text-moss-mid"}`}>{option}</span>
                <span className={`shrink-0 text-[10px] ${isLeader ? "font-bold text-moss-dark" : "text-moss"}`}>{count} · {pct}%</span>
              </div>
              <div className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-sand-line">
                <div className={`h-full rounded-full ${isLeader ? "bg-sage" : "bg-ember/60"}`} style={{ width: `${pct}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** One pledge, as the office's list reads it. */
type PledgeRow = {
  id: number;
  member_name: string;
  member_email: string;
  amount: number | null;
  due_date: string | null;
  redeemed: boolean;
  redeemed_via: string;
};

function pledgeDay(iso: string | null) {
  if (!iso) return "no date promised";
  return dayFirst(iso);
}

/**
 * The pledges a giving announcement drew, for the officer who has to close
 * them.
 *
 * Most pledges close themselves — the member gives, and the church's own
 * records match the gift to the promise — so this list is about the ones that
 * do not: a cash gift recorded without a name, or a promise the office knows
 * came in. Each row can be marked given, and reopened if that was a mistake;
 * the member can do the same from their own side.
 */
function PledgePanel({ item }: { item: Announcement }) {
  const isGiving = item.announcement_type === "promotion";
  const [rows, setRows] = useState<PledgeRow[]>([]);
  const [totals, setTotals] = useState({ outstanding: 0, pledged: 0 });
  const [busyId, setBusyId] = useState<number | null>(null);

  const loadPledges = useCallback(() => {
    if (!isGiving) return;
    const token = localStorage.getItem("access_token");
    fetch(`${API_URL}/api/members/announcements/${item.id}/pledges/`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!data) return;
        setRows(Array.isArray(data.pledges) ? data.pledges : []);
        setTotals({ outstanding: data.outstanding ?? 0, pledged: data.pledged_total ?? 0 });
      })
      .catch(() => {});
  }, [item.id, isGiving]);

  useEffect(() => { loadPledges(); }, [loadPledges]);

  if (!isGiving) return null;

  const markPledge = async (pledge: PledgeRow) => {
    setBusyId(pledge.id);
    try {
      const token = localStorage.getItem("access_token");
      const response = await fetch(`${API_URL}/api/members/pledges/${pledge.id}/redeem/`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ redeemed: !pledge.redeemed }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.detail || "Could not update the pledge.");
      }
      loadPledges();
    } catch (error) {
      showAlert("Could not update", error instanceof Error ? error.message : "Could not update the pledge.", "error");
    } finally {
      setBusyId(null);
    }
  };

  if (rows.length === 0) return null;

  return (
    <div className="mt-1 rounded-xl border border-sand-soft bg-sand p-2.5">
      <p className="text-[10px] font-bold uppercase tracking-wide text-moss">
        {totals.outstanding === 0
          ? `All ${rows.length} pledge${rows.length === 1 ? "" : "s"} honoured`
          : `${totals.outstanding} of ${rows.length} pledge${rows.length === 1 ? "" : "s"} still owed · KES ${totals.pledged.toLocaleString()}`}
      </p>
      <div className="mt-1.5 space-y-1.5">
        {rows.map((pledge) => (
          <div key={pledge.id} className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className={`truncate text-[11px] ${pledge.redeemed ? "text-moss" : "font-semibold text-bark"}`}>
                {pledge.member_name}
                {pledge.amount ? ` · KES ${pledge.amount.toLocaleString()}` : ""}
              </p>
              <p className="truncate text-[10px] text-moss">
                {pledge.redeemed
                  ? `Given${pledge.redeemed_via === "giving" ? ": matched to their giving" : pledge.redeemed_via === "member" ? ": ticked off by them" : ": marked here"}`
                  : `promised by ${pledgeDay(pledge.due_date)}`}
              </p>
            </div>
            <button
              type="button"
              onClick={() => markPledge(pledge)}
              disabled={busyId === pledge.id}
              className={`shrink-0 rounded-lg border px-2 py-0.5 text-[10px] font-semibold transition disabled:opacity-50 ${
                pledge.redeemed
                  ? "border-sand-mute bg-white text-moss hover:border-ember"
                  : "border-sage bg-sage text-white hover:bg-sage-soft"
              }`}
            >
              {pledge.redeemed ? "Reopen" : "Mark given"}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

export function AnnouncementManager({
  presetAudience,
  /** Communicate mode: render only the compose modal, open from the start,
      with its own full-screen chrome and close behaviour suppressed — the
      host modal supplies both. */
  composerOnly = false,
  onDone,
  /** Rides as a card of another page (the elders' area views on Ministry):
      the host supplies the heading, so the console's own — the phone's
      "Announcements Management" title and its back-to-overview arrow —
      stands down. */
  embedded = false,
  /** The board's search rides the shell's heading row instead of a band of
      the board's own — the console's Sharing page and the eldership desk's
      Sharing view ask for it, so a phone meets the search at the top of the
      page, the way every other desk's search rides the band, rather than
      below the sheet's chrome. */
  hostSearch = false,
  /** Thought mode: render only the Share a Thought modal, open from the
      start — the desk's Sharing panel opens the word/thought composer
      without the whole board behind it. Closing it (cancelled or saved)
      hands control back to the host through `onDone`. */
  thoughtOnly = false,
  /** An announcement the host's feed asked to edit: the compose modal opens
      loaded from that row, so a post edited from the feed changes only
      itself. Null means a fresh post. */
  editItem = null,
}: { presetAudience?: string[]; composerOnly?: boolean; onDone?: () => void; embedded?: boolean; hostSearch?: boolean; thoughtOnly?: boolean; editItem?: Announcement | null } = {}) {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  // The board's own search — title and the words of the post, narrowing the
  // cards above the list rather than a page refetch. The heading names the
  // board above it, so a reader landing on Sharing finds a way through the
  // posts without scrolling every card.
  const [boardSearch, setBoardSearch] = useState("");
  // The search, hosted: when a surface above (the console page, the hub's
  // Sharing view) asks for it, the control rides the shell's heading row and
  // the board draws no band of its own.
  const { setHeaderRightAction } = usePageHeader();
  useEffect(() => {
    if (!hostSearch || composerOnly) return;
    setHeaderRightAction(
      <div className="flex w-full items-center sm:w-auto">
        <div className="relative w-full">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-moss" aria-hidden="true" />
          <input
            type="search"
            value={boardSearch}
            onChange={(event) => setBoardSearch(event.target.value)}
            placeholder="Search announcements..."
            aria-label="Search announcements"
            className="w-full rounded-full border border-sand-mute bg-white py-1.5 pl-9 pr-3 text-xs outline-none transition focus:border-ember sm:w-64"
          />
        </div>
      </div>,
    );
    return () => setHeaderRightAction(null);
  }, [hostSearch, composerOnly, boardSearch, setHeaderRightAction]);
  const visibleAnnouncements = (() => {
    const needle = boardSearch.trim().toLowerCase();
    if (!needle) return announcements;
    return announcements.filter((item) =>
      `${item.title} ${item.text} ${item.attachment_name ?? ""}`.toLowerCase().includes(needle),
    );
  })();
  const [showCreateModal, setShowCreateModal] = useState(composerOnly);
  // The id being edited; null while composing a new announcement.
  const [editingId, setEditingId] = useState<number | null>(null);

  type DailyWordRow = {
    id: number;
    date: string;
    text: string;
    author_name: string;
  };

  const [todayThought, setTodayThought] = useState<DailyWordRow | null>(null);
  const [showThoughtModal, setShowThoughtModal] = useState(thoughtOnly);
  const [thoughtDraft, setThoughtDraft] = useState("");
  const [savingThought, setSavingThought] = useState(false);

  // The fetch itself answers; the states move only in the promise callbacks
  // below, so the mount effect never setStates synchronously (the react
  // compiler forbids it): an `undefined` result means the fetch could not
  // read the word and the panel keeps whatever it was showing.
  const fetchDailyWord = useCallback(async (): Promise<DailyWordRow | null | undefined> => {
    try {
      const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
      if (!token) return undefined;
      const res = await fetch(`${API_URL}/api/members/daily-word/`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return undefined;
      const data = (await res.json()) as { today?: DailyWordRow | null };
      return data.today ?? null;
    } catch {
      return undefined;
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void fetchDailyWord().then((row) => {
      if (row !== undefined && !cancelled) setTodayThought(row);
    });
    const handleUpdate = () => {
      void fetchDailyWord().then((row) => {
        if (row !== undefined && !cancelled) setTodayThought(row);
      });
    };
    window.addEventListener("daily-word-updated", handleUpdate);
    return () => {
      cancelled = true;
      window.removeEventListener("daily-word-updated", handleUpdate);
    };
  }, [fetchDailyWord]);

  // Thought mode stands down the moment its modal closes — cancelled or
  // saved — so the host that mounted it can take the desk back.
  useEffect(() => {
    if (thoughtOnly && !showThoughtModal) onDone?.();
  }, [thoughtOnly, showThoughtModal, onDone]);

  // A post brought from the host's feed opens the composer loaded from that
  // row: one press on the feed's Edit lands the office in the form, not on
  // the board the edits came from.
  useEffect(() => {
    if (editItem) handleEdit(editItem);
    // The shape of the row never changes identity-wise while mounted; only
    // a new row from the host should reopen the form.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editItem]);

  const handleSaveThought = async () => {
    const text = thoughtDraft.trim();
    if (!text || savingThought) return;
    setSavingThought(true);
    try {
      const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
      const res = await fetch(`${API_URL}/api/members/daily-word/`, {
        method: "POST",
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ text }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || data.text || "The thought could not be shared.");
      showAlert("Shared", "Today's thought is with the church.", "success", {
        toast: true,
        timer: 4000,
        showConfirmButton: false,
      });
      setShowThoughtModal(false);
      setThoughtDraft("");
      await fetchDailyWord().then((row) => {
        if (row !== undefined) setTodayThought(row);
      });
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("daily-word-updated"));
      }
    } catch (error) {
      showAlert("Could not share", error instanceof Error ? error.message : "Try again.", "error");
    } finally {
      setSavingThought(false);
    }
  };

  const [form, setForm] = useState({
    title: "",
    text: "",
    // Church announcements default to all users so they reach the widest audience.
    visibility: "all",
    // Communicate-from-a-department opens the composer already addressed.
    audience: (presetAudience ?? []) as string[],
    // The buttons the card carries, as the officer ticks them. Empty is a
    // plain notice: words, its flyer, its link, and nothing to press.
    options: [] as string[],
    // The account a call for money or goods supports. The form asks for it
    // only when one of those buttons is ticked, the API insists on it there.
    support_account: "",
    // Site and email are the ordinary pair: the post shows on the site and
    // lands in inboxes. SMS is added for the occasions it is wanted.
    sharing_option: "site,email",
    href: "",
    event_date_from: "",
    event_date_to: "",
    // The event's clock: blank for an all-day event, where the day says it.
    event_time_from: "",
    event_time_to: "",
    // Scheduling: the day and hour the post goes live, and whether the notice
    // repeats once it is. All blank means it is posted the moment it is saved.
    publish_on: "",
    publish_time: "",
    repeat: "none" as "none" | "daily" | "weekly" | "monthly",
  });
  // The treasury accounts a "Request support" post may name, offered as the
  // wording members read on the giving form.
  const [accounts, setAccounts] = useState<{ id: number; name: string; description?: string }[]>([]);
  const [attachment, setAttachment] = useState<File | null>(null);
  // Editing shows the post's existing flyer; "Remove" clears it server-side
  // via the remove_attachment flag.
  const [existingAttachment, setExistingAttachment] = useState<{ name?: string | null; size?: number | null } | null>(null);
  const [removeAttachment, setRemoveAttachment] = useState(false);
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [showSharingDropdown, setShowSharingDropdown] = useState(false);
  const sharingDropdownRef = useRef<HTMLDivElement>(null);
  const [showPostToDropdown, setShowPostToDropdown] = useState(false);
  const postToDropdownRef = useRef<HTMLDivElement>(null);
  // The card's buttons — "User actions" — open as one combo, beside the
  // channels the post is shared on, rather than as a wall of chips above the
  // title.
  const [showActionsDropdown, setShowActionsDropdown] = useState(false);
  const actionsDropdownRef = useRef<HTMLDivElement>(null);

  /** What the closed "User actions" combo reads — the card's buttons, named
   *  in the officer's own tick order, or the plain-notice answer. */
  const actionsLabel = (() => {
    const chosen = CARD_OPTION_CHOICES.filter((option) => form.options.includes(option.value)).map(
      (option) => option.label,
    );
    return chosen.length === 0 ? "No actions" : chosen.join(", ");
  })();

  /** What the closed "Post to" combo reads, e.g. "Members only + 2 groups". */
  const postToLabel = (() => {
    const reach = REACH_LABELS[form.visibility] ?? "Members only";
    const count = form.audience.length;
    return count === 0 ? reach : `${reach} + ${count} ${count === 1 ? "group" : "groups"}`;
  })();

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (sharingDropdownRef.current && !sharingDropdownRef.current.contains(e.target as Node)) {
        setShowSharingDropdown(false);
      }
      if (postToDropdownRef.current && !postToDropdownRef.current.contains(e.target as Node)) {
        setShowPostToDropdown(false);
      }
      if (actionsDropdownRef.current && !actionsDropdownRef.current.contains(e.target as Node)) {
        setShowActionsDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function fetchAnnouncements(options?: { silent?: boolean }) {
    if (!options?.silent) setLoadingList(true);
    const token = localStorage.getItem("access_token");
    fetch(`${API_URL}/api/members/announcements/?include_expired=true&include_unpublished=true&include_scheduled=true`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((res) => (res.ok ? res.json() : []))
      .then((data: Announcement[]) => setAnnouncements(Array.isArray(data) ? data : []))
      .catch(() => setAnnouncements([]))
      .finally(() => {
        if (!options?.silent) setLoadingList(false);
      });
  }

  useEffect(() => {
    const timer = window.setTimeout(fetchAnnouncements, 0);
    // Live tallies: silent refetch every 30s — no spinner flicker — so poll
    // counts on the cards move as members answer.
    const poll = window.setInterval(() => fetchAnnouncements({ silent: true }), 30000);
    return () => {
      window.clearTimeout(timer);
      window.clearInterval(poll);
    };
  }, []);

  useEffect(() => {
    const token = localStorage.getItem("access_token");
    fetch(`${API_URL}/api/members/treasury/accounts/`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => setAccounts(Array.isArray(data) ? data : []))
      .catch(() => setAccounts([]));
  }, []);

  async function handleDelete(id: number, title: string) {
    const answer = await showAlert(
      "Delete this announcement?",
      `"${title}" will be taken down for everyone. This cannot be undone.`,
      "warning",
      {
        showCancelButton: true,
        confirmButtonText: "Delete",
        cancelButtonText: "Cancel",
        confirmButtonColor: brand.alert,
      },
    );
    if (!answer.isConfirmed) return;
    try {
      const response = await fetch(`${API_URL}/api/members/announcements/${id}/`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${localStorage.getItem("access_token")}`,
        },
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.detail ?? "Failed to delete announcement.");
      }
      showAlert("Announcement Deleted", `Announcement "${title}" was successfully deleted.`, "success");
      fetchAnnouncements();
    } catch (error) {
      const errorText = error instanceof Error ? error.message : "Failed to delete announcement.";
      showAlert("Delete Error", errorText, "error");
    }
  }

  async function handleExportAnswers(item: Announcement) {
    try {
      const token = localStorage.getItem("access_token");
      const res = await fetch(`${API_URL}/api/members/announcements/${item.id}/answers.csv`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Poll_Answers_${item.id}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      showAlert("Export Failed", "We could not export the answers for this post.", "error");
    }
  }

  function handleEdit(item: Announcement) {
    setEditingId(item.id);
    setMessage("");
    setAttachment(null);
    setExistingAttachment(item.attachment ? { name: item.attachment_name, size: item.attachment_size } : null);
    setRemoveAttachment(false);
    const postTo = parsePostTo(item.visibility, item.audience);
    // A post saved before the picker existed reports the buttons its card
    // already carries, so editing it opens on the same ticks. A post already
    // out has no schedule to open on — its hour is in the past, and the form
    // would refuse to save it back — so it opens as a post going out now.
    const publishAt = item.publish_at ? new Date(item.publish_at) : null;
    const waiting = publishAt && publishAt.getTime() > Date.now() ? publishAt : null;
    setForm({
      title: item.title,
      text: item.text,
      visibility: postTo.reach,
      audience: postTo.ministries,
      options: [...(item.options ?? [])],
      support_account: item.support_account ?? "",
      sharing_option: item.sharing_option || "site,email",
      href: item.href ?? "",
      event_date_from: item.event_date_from ?? "",
      event_date_to: item.event_date_to ?? "",
      event_time_from: (item.event_time_from ?? "").slice(0, 5),
      event_time_to: (item.event_time_to ?? "").slice(0, 5),
      // A post already scheduled opens on its own day and hour; the officer
      // can move it, or clear the day to post it now.
      publish_on: waiting ? localDate(waiting) : "",
      publish_time: waiting
        ? `${String(waiting.getHours()).padStart(2, "0")}:${String(waiting.getMinutes()).padStart(2, "0")}`
        : "",
      repeat: item.repeat ?? "none",
    });
    setShowCreateModal(true);
  }

  function resetAndCloseModal() {
    setForm({
      title: "",
      text: "",      visibility: "all",
      audience: (presetAudience ?? []) as string[],
      options: [],
      support_account: "",
      sharing_option: "site,email",
      href: "",
      event_date_from: "",
      event_date_to: "",
      event_time_from: "",
      event_time_to: "",
      publish_on: "",
      publish_time: "",
      repeat: "none",
    });
    setEditingId(null);
    setAttachment(null);
    setExistingAttachment(null);
    setRemoveAttachment(false);
    setMessage("");
    if (composerOnly) {
      // Communicate mode: posted (or cancelled) — hand control back to the host.
      onDone?.();
      return;
    }
    setShowCreateModal(false);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form.sharing_option || !form.sharing_option.trim()) {
      const err = "Please select at least one sharing option (On the Site, SMS, Email).";
      setMessage(err);
      showAlert("Missing Sharing Option", err, "error");
      return;
    }
    const textLength = form.text.replace(/\r\n/g, "\n").length;
    if (textLength > ANNOUNCEMENT_TEXT_LIMIT) {
      const err = `Announcement text must be ${ANNOUNCEMENT_TEXT_LIMIT} characters or fewer (currently ${textLength}).`;
      setMessage(err);
      showAlert("Announcement Too Long", err, "error");
      return;
    }
    if (!form.event_date_from) {
      const err = "Set the event date. The feed ranks a post by the day its event ends, and the post comes down the day after.";
      setMessage(err);
      showAlert("Event Date Missing", err, "error");
      return;
    }
    // A ticked button that needs input is checked here as well as at the API:
    // a meeting to join needs its link, and a call for money or goods needs
    // the account it supports.
    if (form.options.includes("join_meeting") && !form.href.trim()) {
      const err = "A post that invites members to join a meeting needs its meeting link.";
      setMessage(err);
      showAlert("Meeting Link Missing", err, "error");
      return;
    }
    if (form.options.some((code) => GIVING_OPTION_CODES.includes(code)) && !form.support_account.trim()) {
      const err = "A post that asks for money or goods needs the treasury account it supports.";
      setMessage(err);
      showAlert("Account Missing", err, "error");
      return;
    }
    // A scheduled post must fall in the future — the API refuses an hour that
    // has already passed, and the form says so before the round trip.
    const publishAt = form.publish_on
      ? new Date(`${form.publish_on}T${form.publish_time || "00:00"}`)
      : null;
    if (publishAt && publishAt.getTime() <= Date.now()) {
      const err = "A scheduled announcement must be set for a future day and time.";
      setMessage(err);
      showAlert("Schedule Invalid", err, "error");
      return;
    }
    setSubmitting(true);
    setMessage("");
    try {
      const payload = new FormData();
      Object.entries(form).forEach(([key, value]) => {
        // The audience is a list of codes, not one string.
        if (key === "audience") {
          (value as string[]).forEach((code) => payload.append("audience", code));
          return;
        }
        // The card's buttons and the schedule are sent as their own values
        // further down; String()-ing an array here would post one
        // comma-joined code the API reads as a single invalid choice.
        if (key === "options" || key === "publish_on" || key === "publish_time") return;
        // Optional fields are omitted when blank so the row keeps a real null
        // (an empty string would fail date parsing server-side). The drive
        // goal rides along only when written — the API mints a drive for a
        // new promotion only when it carries one, and ignores it on edits.
        // The event's clock is never omitted, even when blank: leaving a field
        // out of a PATCH says "leave it as it was", and an officer who clears
        // the start time of an existing post means to clear it. A blank time
        // is read by the API as exactly that.
        const optional = key === "href" || key === "event_date_from" || key === "event_date_to";
        if (optional && !value) return;
        if ((key === "event_time_from" || key === "event_time_to") && !value) {
          payload.append(key, "");
          return;
        }
        // The list-valued audience returned above; everything left is a string.
        payload.append(key, String(value));
      });
      if (attachment) payload.append("attachment", attachment);
      if (editingId && removeAttachment) payload.append("remove_attachment", "true");
      // The card's buttons, as repeated values in the officer's own tick order.
      form.options.forEach((code) => payload.append("options", code));
      // A scheduled post carries the moment it goes live; a post going out now
      // carries a blank, which the API reads as "no wait" (an untouched PATCH
      // would otherwise keep a stale hour standing).
      payload.append("publish_at", publishAt ? publishAt.toISOString() : "");
      payload.append("repeat", form.repeat || "none");
      const response = await fetch(
        editingId ? `${API_URL}/api/members/announcements/${editingId}/` : `${API_URL}/api/members/announcements/`,
        {
          method: editingId ? "PATCH" : "POST",
          headers: {
            Authorization: `Bearer ${localStorage.getItem("access_token")}`,
          },
          body: payload,
        },
      );
      const data = await response.json();
      if (!response.ok) throw new Error(firstErrorMessage(data) ?? "Unable to save the announcement.");

      const successText = editingId ? "Announcement updated." : "Announcement posted successfully.";
      showAlert(editingId ? "Announcement Updated" : "Announcement Posted", successText, "success");
      resetAndCloseModal();
      fetchAnnouncements();
    } catch (error) {
      const errorText = error instanceof Error ? error.message : "Unable to save the announcement.";
      setMessage(errorText);
      showAlert("Post Error", errorText, "error");
    } finally {
      setSubmitting(false);
    }
  }

  /** The compose form: the fields and the message row — the buttons ride the
   *  dialog's own foot, outside the form, and reach it by its id. */
  function renderComposerFields() {
    return (
      <form id={COMPOSER_FORM_ID} onSubmit={submit} className="grid gap-4 md:grid-cols-2">
              <label className="block text-xs font-semibold text-bark">
                Title *
                <input
                  required
                  maxLength={160}
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder="Announcement title"
                  className="mt-1 w-full rounded-xl border border-sand-mute px-3.5 py-2.5 text-xs text-bark outline-none focus:border-ember"
                />
              </label>

              {/* Post to: one flat list — who the post reaches, then the
                  congregation groups it addresses. */}
              <div className="block text-xs font-semibold text-bark">
                <span>Post to *</span>
                <div className="relative mt-1" ref={postToDropdownRef}>
                  <button
                    type="button"
                    onClick={() => setShowPostToDropdown((prev) => !prev)}
                    aria-expanded={showPostToDropdown}
                    className="flex w-full items-center justify-between gap-2 rounded-xl border border-sand-mute bg-white px-3.5 py-2.5 text-left text-xs outline-none transition hover:border-ember focus:border-ember"
                  >
                    <span className="min-w-0 truncate text-bark">{postToLabel}</span>
                    <svg className="h-4 w-4 shrink-0 text-moss" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                  </button>
                  {showPostToDropdown && (
                    <div className="absolute z-50 mt-1 max-h-64 w-full overflow-y-auto rounded-xl border border-sand-line bg-white p-2 shadow-lg">
                      {POST_TO_OPTIONS.map((option) => {
                        const isReach = REACH_VALUES.has(option.value);
                        const selected = isReach
                          ? form.visibility === option.value
                          : form.audience.includes(option.value);
                        return (
                          <button
                            key={option.value}
                            type="button"
                            onClick={() => {
                              if (isReach) {
                                setForm({ ...form, visibility: option.value });
                              } else {
                                setForm({
                                  ...form,
                                  audience: selected
                                    ? form.audience.filter((code) => code !== option.value)
                                    : [...form.audience, option.value],
                                });
                              }
                            }}
                            className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-xs text-bark transition hover:bg-sand"
                          >
                            <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${selected ? "border-ember bg-ember" : "border-sand-mute bg-white"}`}>
                              {selected && (
                                <svg className="h-3 w-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                              )}
                            </span>
                            <span className="min-w-0 truncate">{option.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              {/* A meeting to join needs its link; a call for money or goods
                  needs the account it supports. Everything else is optional. */}
              {form.options.includes("join_meeting") && (
                <label className="block text-xs font-semibold text-bark md:col-span-2">
                  Meeting link *
                  <input
                    type="url"
                    required
                    value={form.href}
                    onChange={(e) => setForm({ ...form, href: e.target.value })}
                    placeholder="Zoom, Meet or Teams link"
                    className="mt-1 w-full rounded-xl border border-sand-mute px-3.5 py-2.5 text-xs text-bark outline-none focus:border-ember"
                  />
                </label>
              )}


              <label className="block text-xs font-semibold text-bark">
                Share Announcement Via *<span className="font-normal text-moss"> (select one or more)</span>
                <div className="mt-1 relative" ref={sharingDropdownRef}>
                  <button
                    type="button"
                    onClick={() => setShowSharingDropdown((prev) => !prev)}
                    className="w-full rounded-xl border border-sand-mute bg-white px-3.5 py-2.5 text-xs text-left outline-none focus:border-ember flex items-center justify-between"
                  >
                    <span className={form.sharing_option ? "text-bark" : "text-graymuted"}>
                      {(() => {
                        const channels = form.sharing_option.split(",").map((s) => s.trim()).filter(Boolean);
                        if (channels.length === 0) return "Select channels";
                        return channels.map((c) => c === "site" ? "Site" : c === "sms" ? "SMS" : "Email").join(", ");
                      })()}
                    </span>
                    <svg className="h-4 w-4 text-moss shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                  </button>
                  {showSharingDropdown && (
                    <div className="absolute z-50 mt-1 w-full rounded-xl border border-sand-line bg-white shadow-lg p-2 space-y-1">
                      {["site", "sms", "email", "phone"].map((channel) => {
                        const selected = form.sharing_option.split(",").map((s) => s.trim()).includes(channel);
                        return (
                          <button
                            key={channel}
                            type="button"
                            onClick={() => {
                              const current = form.sharing_option.split(",").map((s) => s.trim()).filter(Boolean);
                              const next = selected ? current.filter((c) => c !== channel) : [...current, channel];
                              setForm({ ...form, sharing_option: next.join(",") });
                            }}
                            className="w-full flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs hover:bg-sand transition"
                          >
                            <span className={`flex h-4 w-4 items-center justify-center rounded border ${selected ? "bg-ember border-ember" : "border-sand-mute bg-white"}`}>
                              {selected && (
                                <svg className="h-3 w-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                              )}
                            </span>
                            <span className="text-bark">
                              {channel === "site"
                                ? "On the Site"
                                : channel === "sms"
                                  ? "Through SMS"
                                  : channel === "email"
                                    ? "Through Email"
                                    : "As a Notification"}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </label>

              {/* What a member can press on the post's card. It reads beside
                  the channels the post is shared on, the way the rest of the
                  form pairs its choices, and opens as one combo of ticks
                  rather than a wall of chips above the title. */}
              <div className="block text-xs font-semibold text-bark">
                <span>User actions</span>
                <div className="mt-1 relative" ref={actionsDropdownRef}>
                  <button
                    type="button"
                    onClick={() => setShowActionsDropdown((prev) => !prev)}
                    aria-expanded={showActionsDropdown}
                    className="flex w-full items-center justify-between gap-2 rounded-xl border border-sand-mute bg-white px-3.5 py-2.5 text-left text-xs outline-none transition focus:border-ember"
                  >
                    <span
                      className={`min-w-0 truncate ${form.options.length ? "text-bark" : "text-graymuted"}`}
                    >
                      {actionsLabel}
                    </span>
                    <svg className="h-4 w-4 shrink-0 text-moss" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                  </button>
                  {showActionsDropdown && (
                    <div className="absolute z-50 mt-1 max-h-64 w-full overflow-y-auto rounded-xl border border-sand-line bg-white p-2 shadow-lg">
                      {CARD_OPTION_CHOICES.map((option) => {
                        const selected = form.options.includes(option.value);
                        return (
                          <button
                            key={option.value}
                            type="button"
                            aria-pressed={selected}
                            onClick={() =>
                              setForm((f) => ({
                                ...f,
                                options: selected
                                  ? f.options.filter((code) => code !== option.value)
                                  : [...f.options, option.value],
                              }))
                            }
                            className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-xs text-bark transition hover:bg-sand"
                          >
                            <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${selected ? "border-ember bg-ember" : "border-sand-mute bg-white"}`}>
                              {selected && (
                                <svg className="h-3 w-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                              )}
                            </span>
                            <span className="min-w-0 truncate">{option.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
                <span className="mt-1 block text-[10px] font-normal text-moss">
                  What members can press on this post&apos;s card. Leave them all unticked for a plain
                  notice.
                </span>
              </div>

              {/* A call for money or goods names the account it supports —
                  the wording members read on the giving form. */}
              {form.options.some((code) => GIVING_OPTION_CODES.includes(code)) && (
                <label className="block text-xs font-semibold text-bark md:col-span-2">
                  Support account *
                  <select
                    value={form.support_account}
                    onChange={(e) => setForm({ ...form, support_account: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-sand-mute bg-white px-3.5 py-2.5 text-xs text-bark outline-none focus:border-ember"
                  >
                    <option value="">-- Select account --</option>
                    {accounts.map((account) => (
                      <option key={account.id} value={account.description || account.name}>
                        {account.description || account.name}
                      </option>
                    ))}
                  </select>
                  <span className="mt-1 block text-[10px] font-normal text-moss">
                    The account the card&apos;s giving buttons name. Give now asks for money, Give in
                    kind asks for goods — tick both when the call takes either.
                  </span>
                </label>
              )}

              <div className="md:col-span-2 grid grid-cols-2 gap-3">
                <label className="block text-xs font-semibold text-bark">
                  Event start *
                  <input
                    type="date"
                    required
                    value={form.event_date_from}
                    onChange={(e) => {
                      // Picking the start also sets the end to it — most
                      // events are one day, and the officer widens the end
                      // only when the event truly spans days. It also keeps
                      // end >= start no matter how the start moves.
                      setForm({ ...form, event_date_from: e.target.value, event_date_to: e.target.value });
                    }}
                    className="mt-1 w-full rounded-xl border border-sand-mute bg-white px-3.5 py-2.5 text-xs text-bark outline-none focus:border-ember"
                  />
                </label>

                <label className="block text-xs font-semibold text-bark">
                  Event end
                  <input
                    type="date"
                    min={form.event_date_from || undefined}
                    value={form.event_date_to}
                    onChange={(e) => setForm({ ...form, event_date_to: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-sand-mute bg-white px-3.5 py-2.5 text-xs text-bark outline-none focus:border-ember"
                  />
                </label>
              </div>

              {/* The hour, beside the days it falls on. Both are optional:
                  an all-day event leaves them empty and reads on its dates
                  alone. The start is not copied into the end — a service that
                  begins at 09:00 does not finish at 09:00. */}
              <div className="md:col-span-2 grid grid-cols-2 gap-3">
                <label className="block text-xs font-semibold text-bark">
                  Start time
                  <input
                    type="time"
                    value={form.event_time_from}
                    onChange={(e) => setForm({ ...form, event_time_from: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-sand-mute bg-white px-3.5 py-2.5 text-xs text-bark outline-none focus:border-ember"
                  />
                </label>

                <label className="block text-xs font-semibold text-bark">
                  End time
                  <input
                    type="time"
                    value={form.event_time_to}
                    onChange={(e) => setForm({ ...form, event_time_to: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-sand-mute bg-white px-3.5 py-2.5 text-xs text-bark outline-none focus:border-ember"
                  />
                </label>

                <p className="md:col-span-2 text-[10px] font-normal text-moss">
                  Optional — blank means an all-day event. A start time alone reads “from 09:00”.
                </p>
              </div>

              {/* Scheduling: the day and hour the post goes live, and whether
                  the notice repeats once it is. Blank means it goes out the
                  moment it is saved, which is what the board has always done;
                  a day and hour keep it out of the feed — and out of every
                  inbox and phone — until that moment arrives. */}
              <div className="md:col-span-2 rounded-xl border border-sand-line bg-sand-linen/40 p-3">
                <span className="block text-xs font-semibold text-bark">Schedule</span>
                <div className="mt-1.5 grid gap-2 sm:grid-cols-3">
                  <label className="block text-[11px] font-semibold text-moss">
                    Day
                    <input
                      type="date"
                      min={localDate()}
                      value={form.publish_on}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          publish_on: e.target.value,
                          // A day with no hour is a morning post: the hour
                          // input is filled rather than left to read as
                          // midnight, which nobody schedules on purpose.
                          publish_time: e.target.value && !form.publish_time ? "08:00" : form.publish_time,
                        })
                      }
                      className="mt-1 w-full rounded-xl border border-sand-mute bg-white px-3 py-2 text-xs text-bark outline-none focus:border-ember"
                    />
                  </label>
                  <label className="block text-[11px] font-semibold text-moss">
                    Time
                    <input
                      type="time"
                      value={form.publish_time}
                      onChange={(e) => setForm({ ...form, publish_time: e.target.value })}
                      className="mt-1 w-full rounded-xl border border-sand-mute bg-white px-3 py-2 text-xs text-bark outline-none focus:border-ember"
                    />
                  </label>
                  <label className="block text-[11px] font-semibold text-moss">
                    Repeats
                    <select
                      value={form.repeat}
                      onChange={(e) => setForm({ ...form, repeat: e.target.value as typeof form.repeat })}
                      className="mt-1 w-full rounded-xl border border-sand-mute bg-white px-3 py-2 text-xs text-bark outline-none focus:border-ember"
                    >
                      {REPEAT_CHOICES.map((choice) => (
                        <option key={choice.value} value={choice.value}>{choice.label}</option>
                      ))}
                    </select>
                  </label>
                </div>
                <p className="mt-1.5 text-[10px] font-normal text-moss">
                  {form.publish_on
                    ? `Goes out on ${dayFirst(form.publish_on)}${form.publish_time ? ` at ${form.publish_time}` : ""} — nothing reaches the congregation before then.`
                    : "Blank means the post is published the moment you save it."}
                </p>
              </div>

              <div className="text-xs font-semibold text-bark">
                Attachment (optional)
                {existingAttachment && !removeAttachment && (
                  <p className="mt-1 flex flex-wrap items-center gap-2 rounded-xl border border-sand-deep bg-sand-veil px-3 py-2 text-xs font-normal text-moss-mid">
                    <span className="truncate">{existingAttachment.name || "Current attachment"}</span>
                    <button
                      type="button"
                      onClick={() => { setRemoveAttachment(true); setAttachment(null); }}
                      className="ml-auto shrink-0 text-[11px] font-bold text-red-700 hover:underline"
                    >
                      Remove
                    </button>
                  </p>
                )}
                {removeAttachment && (
                  <p className="mt-1 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-normal text-red-700">
                    Current attachment will be removed when you save.
                  </p>
                )}
                {!removeAttachment && (
                  <input
                    type="file"
                    onChange={(e) => {
                      setAttachment(e.target.files?.[0] ?? null);
                      if (e.target.files?.[0]) setRemoveAttachment(false);
                    }}
                    className="mt-1 w-full rounded-xl border border-sand-mute px-3.5 py-2 font-normal text-bark outline-none file:mr-3 file:rounded-full file:border-0 file:bg-sand file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-bark focus:border-ember"
                  />
                )}
              </div>

              <label className="block text-xs font-semibold text-bark md:col-span-2">
                Announcement Text *
                <textarea
                  required
                  rows={4}
                  maxLength={ANNOUNCEMENT_TEXT_LIMIT}
                  value={form.text}
                  onChange={(e) => setForm({ ...form, text: e.target.value.slice(0, ANNOUNCEMENT_TEXT_LIMIT) })}
                  placeholder="Write full announcement content..."
                  className="mt-1 w-full rounded-xl border border-sand-mute px-3.5 py-2.5 text-xs text-bark outline-none focus:border-ember"
                />
                <span
                  className={`mt-1 block text-right text-[10px] font-semibold ${
                    form.text.length >= ANNOUNCEMENT_TEXT_LIMIT ? "text-ember font-bold" : "text-moss"
                  }`}
                >
                  {form.text.length}/{ANNOUNCEMENT_TEXT_LIMIT} characters
                </span>
              </label>

              {message && (
                <div className="md:col-span-2 rounded-xl bg-red-50 p-3 text-xs font-medium text-red-700">
                  {message}
                </div>
              )}

            </form>
    );
  }

  /**
   * The composer's two buttons, at the dialog's foot rather than inside the
   * form.
   *
   * An announcement is a long form, and honours the request modals under
   * Fellowship instead: the fields scroll between a standing header and a
   * standing footer, so Post is in reach without scrolling a post's own
   * length. The submit rides the form by its id, since it no longer sits
   * inside it.
   */
  function renderComposerActions() {
    return (
      <div className="flex shrink-0 items-center justify-end gap-3">
        <button
          type="button"
          disabled={submitting}
          onClick={resetAndCloseModal}
          className="rounded-full border border-sand-mute bg-white px-5 py-2.5 text-xs font-semibold text-moss transition hover:border-ember"
        >
          Cancel
        </button>
        <button
          type="submit"
          form={COMPOSER_FORM_ID}
          disabled={submitting}
          className="rounded-full bg-sage px-6 py-2.5 text-xs font-bold text-white shadow-sm transition hover:bg-sage-deep disabled:opacity-60"
        >
          {submitting ? "Saving..." : editingId ? "Save Changes" : "Post Announcement"}
        </button>
      </div>
    );
  }

  /** The compose dialog: overlay + card in manager mode; called via renderComposerForm(true) when embedded. */
  function renderComposerForm(inline = false) {
    // Three parts, the way the request modals are built: a header and a footer
    // that hold still, and the fields scrolling between them — so a post
    // longer than the screen still has its Post button in the same place.
    const card = (
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-announcement-title"
        className={inline ? "w-full" : "flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl ring-1 ring-sand-line"}
      >
        {/* The frame is the fund-drive modal's, line for line: the same header
            with its name and a line saying what the form asks for, the same
            body padding, and a plain footer over the same border — so posting a
            notice and opening a drive read as two desks of one office rather
            than two designs. */}
        <div className={`flex shrink-0 items-center justify-between border-b border-sand-line ${inline ? "pb-4" : "px-6 pb-4 pt-6 sm:px-8 sm:pt-8"}`}>
          <div>
            <h2 id="create-announcement-title" className="text-xl font-bold text-bark">
              {editingId ? "Edit Announcement" : "Post Announcement"}
            </h2>
            <p className="mt-1 text-xs text-moss">
              {editingId
                ? "Update the post's wording, who it reaches, the buttons it carries and when it goes out."
                : "Write the notice, choose who it reaches and what members can press on it, then post it now or schedule it."}
            </p>
          </div>
          <button
            type="button"
            disabled={submitting}
            onClick={resetAndCloseModal}
            className="rounded-full p-2 text-xl leading-none text-moss transition hover:bg-sand hover:text-bark"
            aria-label="Close modal"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        <div className={inline ? "mt-6" : "min-h-0 flex-1 overflow-y-auto px-6 pb-4 pt-6 sm:px-8"}>
          {renderComposerFields()}
        </div>
        <div className={`flex shrink-0 items-center justify-end border-t border-sand-line ${inline ? "pt-4" : "px-6 pb-4 pt-3 sm:px-8"}`}>
          {renderComposerActions()}
        </div>
      </div>
    );
    if (inline) return card;
    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
        onClick={(e) => {
          if (e.target === e.currentTarget && !submitting) resetAndCloseModal();
        }}
      >
        {card}
      </div>
    );
  }

  function renderComposerOverlay() {
    return renderComposerForm(false);
  }

  function renderThoughtModal() {
    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-bark/60 p-4 backdrop-blur-sm animate-in fade-in duration-200"
        role="dialog"
        aria-modal="true"
        aria-labelledby="thought-modal-title"
      >
        <div className="relative flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-2xl border border-sand-line">
          {/* Header */}
          <div className="flex shrink-0 items-center justify-between border-b border-sand-line px-5 py-4">
            <div className="flex items-center gap-2.5">
              <div className="rounded-xl bg-ember/10 p-2 text-ember">
                <Sparkles className="h-5 w-5" aria-hidden="true" />
              </div>
              <div>
                <h2 id="thought-modal-title" className="text-base font-bold text-bark">
                  Share a Thought
                </h2>
                <p className="text-xs text-moss">
                  Today&apos;s devotional thought for the congregation.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setShowThoughtModal(false)}
              className="rounded-xl p-2 text-moss hover:bg-sand hover:text-bark transition"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            {todayThought && (
              <div className="rounded-xl border border-sand-line bg-sand-linen p-3.5">
                <div className="flex items-center justify-between text-[11px] font-semibold text-ember">
                  <span>Currently Live for Today</span>
                  {todayThought.author_name && <span>— {todayThought.author_name}</span>}
                </div>
                <p className="mt-1 whitespace-pre-wrap text-xs text-bark">{todayThought.text}</p>
              </div>
            )}

            <div>
              <label htmlFor="thought-text" className="block text-xs font-semibold text-bark">
                {todayThought ? "Update Today's Thought" : "Write Today's Thought"}
              </label>
              <p className="mt-0.5 text-[11px] text-moss">
                A daily word of faith, encouragement, or scripture reflection. Posting replaces any previous thought for today.
              </p>
              <textarea
                id="thought-text"
                rows={5}
                value={thoughtDraft}
                onChange={(e) => setThoughtDraft(e.target.value)}
                placeholder="Share a short devotional thought or verse reflection for today..."
                className="mt-2 w-full rounded-xl border border-sand-line bg-white p-3 text-xs leading-5 text-bark placeholder:text-moss-faint focus:border-ember focus:outline-none focus:ring-1 focus:ring-ember"
              />
            </div>
          </div>

          {/* Footer */}
          <div className="flex shrink-0 items-center justify-end gap-2 border-t border-sand-line bg-sand px-5 py-3">
            <button
              type="button"
              onClick={() => setShowThoughtModal(false)}
              disabled={savingThought}
              className="rounded-xl border border-sand-line bg-white px-4 py-2 text-xs font-semibold text-bark hover:bg-sand transition"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void handleSaveThought()}
              disabled={savingThought || !thoughtDraft.trim()}
              className="inline-flex items-center gap-1.5 rounded-xl bg-ember px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-ember-dark disabled:opacity-50"
            >
              <Send className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{savingThought ? "Sharing…" : todayThought ? "Update Thought" : "Share with Church"}</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (thoughtOnly) {
    // Thought mode: the Share a Thought modal alone — its save and its
    // close both stand it down, and the effect above walks the host out.
    return renderThoughtModal();
  }

  if (composerOnly) {
    // Communicate mode: the compose fields alone — the host modal supplies
    // the frame, the heading, and the close button. The buttons come along,
    // because no frame of ours is here to draw them.
    return (
      <>
        {renderComposerFields()}
        <div className="mt-6 border-t border-sand-line pt-4">{renderComposerActions()}</div>
      </>
    );
  }

  return (
    <section
      className={`flex h-full min-h-0 w-full flex-col gap-3 bg-white p-0 ${
        embedded ? "" : "border-b border-sand-line"
      }`}
    >
      {/* No heading of its own, and no way back to the console: the shell's
          band names the page, and the desk this board sits under owns the
          way out — a private back arrow to the console's overview read as if
          Administration were the only road to it, when the console opens from
          the account menu. */}

      {/* Announcements — ledger-style table container */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-sand-line bg-white">
        {/* The board's own search, pinned at the top like every desk's search:
            the heading above names the place, this narrows its posts. Held
            when a surface above hosts it in the shell's heading row. */}
        {!hostSearch && (
        <div className="shrink-0 border-b border-sand-line bg-white px-4 py-2.5 sm:px-6">
          <div className="relative max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-moss" aria-hidden="true" />
            <input
              type="search"
              value={boardSearch}
              onChange={(event) => setBoardSearch(event.target.value)}
              placeholder="Search announcements..."
              aria-label="Search announcements"
              className="w-full rounded-full border border-sand-mute bg-white py-1.5 pl-9 pr-3 text-xs outline-none transition focus:border-ember"
            />
          </div>
        </div>
        )}
        {todayThought && (
          <div className="shrink-0 border-b border-sand-line bg-sand-linen/60 px-4 py-3 sm:px-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
              <div className="flex items-start gap-2.5">
                <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-ember" aria-hidden="true" />
                <div>
                  <div className="flex items-center gap-1.5 text-xs font-bold text-bark">
                    <span>Thought of the Day</span>
                    {todayThought.author_name && (
                      <span className="font-normal text-moss text-[11px]">— {todayThought.author_name}</span>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs text-moss-dark line-clamp-2 sm:line-clamp-1">
                    {todayThought.text}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setThoughtDraft(todayThought.text);
                  setShowThoughtModal(true);
                }}
                className="shrink-0 self-end sm:self-center rounded-lg border border-sand-line bg-white px-2.5 py-1 text-xs font-semibold text-bark hover:border-ember transition"
              >
                Edit thought
              </button>
            </div>
          </div>
        )}
        {/* The announcement board is cards at every width — a bulletin reads as
            a bulletin, not as a ledger row. */}
        <RecordList
          rows={visibleAnnouncements}
          loading={loadingList}
          rowKey={(item) => item.id}
          cardsOnly
          loadingLabel="Loading announcements..."
          cardsClassName="custom-table-scrollbar grid min-h-0 flex-1 content-start gap-4 overflow-y-auto overscroll-contain p-4 sm:grid-cols-2 xl:grid-cols-3"
          cardsStateClassName="col-span-full py-12 text-center text-sm text-moss"
          cardsEmpty={
            boardSearch.trim() ? (
              <>
                <Search size={32} className="text-moss-faint" aria-hidden="true" />
                <p className="mt-3 text-sm font-semibold text-bark">No announcements match that search.</p>
                <p className="mt-1 text-xs text-moss">Try another word, or clear the search to read the whole board.</p>
              </>
            ) : (
              <>
                <Megaphone size={36} className="text-moss-faint" aria-hidden="true" />
                <p className="mt-3 text-sm font-semibold text-bark">No announcements available.</p>
                <p className="mt-1 text-xs text-moss">Tap &quot;Add Announcement&quot; below to post your first announcement.</p>
              </>
            )
          }
          renderCard={(item) => (
            <article
              key={item.id}
              className="flex min-h-56 flex-col gap-4 rounded-2xl border border-sand-line bg-white p-5 text-xs shadow-sm md:p-6"
            >
              <div className="flex items-start justify-between gap-3">
                <h4 className="text-sm font-bold text-bark">{item.title}</h4>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={() => handleEdit(item)}
                    className="rounded-lg p-1.5 text-slate-400 transition hover:bg-sand hover:text-ember"
                    title="Edit Announcement"
                    aria-label="Edit Announcement"
                  >
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(item.id, item.title)}
                    className="rounded-lg p-1.5 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"
                    title="Delete Announcement"
                    aria-label="Delete Announcement"
                  >
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              </div>
              <p className="text-[11px] leading-relaxed text-moss-mid">{item.text}</p>
              <AnnouncementAttachment
                attachment={item.attachment}
                name={item.attachment_name}
                size={item.attachment_size}
                compact
                className="mt-1"
              />
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="rounded-full bg-mist-select px-2 py-0.5 text-[10px] font-bold text-moss-dark capitalize">
                  {item.visibility}
                </span>
                <span className="rounded-full bg-ember/10 px-2 py-0.5 text-[10px] font-bold text-ember">
                  Via {channelsLabel(item.sharing_option)}
                </span>
                {item.publish_at && new Date(item.publish_at).getTime() > Date.now() && (
                  <span className="rounded-full bg-sand-veil px-2 py-0.5 text-[10px] font-bold text-bark">
                    Scheduled for {dayFirstTime(item.publish_at)}
                  </span>
                )}
                {item.repeat && item.repeat !== "none" && (
                  <span className="rounded-full bg-sand-veil px-2 py-0.5 text-[10px] font-bold text-bark">
                    Repeats {item.repeat}
                  </span>
                )}
                {item.announcement_type && item.announcement_type !== "awareness" && (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">
                    {item.announcement_type === "web_conference"
                      ? "Web conference"
                      : item.announcement_type === "opinion"
                        ? "Opinion poll"
                        : item.announcement_type === "job_vacancy"
                          ? "Job vacancy"
                          : "Promotion / Contribution"}
                  </span>
                )}
                {item.action_type && item.action_type !== "none" && item.action_type !== "respond" && (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800 capitalize">
                    {item.action_type.replaceAll("_", " ")}
                  </span>
                )}
                {item.support_account && (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">
                    Support: {item.support_account}
                  </span>
                )}
              </div>
              {eventLabel(item) && (
                <p className="text-[10px] font-semibold text-ember">Event: {eventLabel(item)}</p>
              )}
              <PollTally item={item} />
              <PledgePanel item={item} />
              {item.href && (
                <p className="text-[10px]">
                  <a href={item.href} target="_blank" rel="noopener noreferrer" className="font-semibold text-ember underline underline-offset-2">
                    Open link <ArrowUpRight size={10} className="inline" aria-hidden="true" />
                  </a>
                </p>
              )}
              <div className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-sand-soft pt-2 text-[10px] text-moss">
                <span className="flex items-center gap-2">
                  Posted {dayLabel(item.created_at.slice(0, 10))}
                  {item.announcement_type === "opinion" && (
                    <button
                      type="button"
                      onClick={() => handleExportAnswers(item)}
                      className="rounded-lg border border-sand-mute bg-white px-2 py-0.5 text-[10px] font-semibold text-bark transition hover:border-ember hover:bg-sand"
                      title="Download the answers as CSV, respondent names included"
                    >
                      <Download size={10} className="inline" aria-hidden="true" /> Export answers
                    </button>
                  )}
                </span>
                <span className="font-semibold text-moss-dark">{windowLabel(item)}</span>
              </div>
            </article>
          )}
          />

        {/* Sticky Footer — the desk's own count and its two writes. It steps
            aside with the rest of the chrome while the board is read. */}
        <div className="page-actions">
        <div className="shrink-0 border-t-2 border-sand-mute bg-sand font-bold text-bark">
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5">
            <span className="text-xs text-moss sm:text-sm">
              Showing <strong className="text-bark">{visibleAnnouncements.length}</strong> announcement{visibleAnnouncements.length === 1 ? "" : "s"}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setThoughtDraft(todayThought?.text ?? "");
                  setShowThoughtModal(true);
                }}
                className="h-9 inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-xl border border-sand-line bg-white px-3 text-xs font-semibold text-bark shadow-sm transition hover:border-ember hover:bg-sand-linen sm:px-3.5"
              >
                <Sparkles className="h-3.5 w-3.5 text-ember" aria-hidden="true" />
                <span>Share a Thought</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setMessage("");
                  setShowCreateModal(true);
                }}
                className="h-9 inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-xl bg-ember px-3 text-xs font-semibold text-white shadow-sm transition hover:bg-ember-dark sm:px-3.5"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                </svg>
                <span>Add Announcement</span>
              </button>
            </div>
          </div>
        </div>
        </div>
      </div>

      {/* Add Announcement Modal */}
      {showCreateModal && renderComposerOverlay()}

      {/* Share a Thought Modal (Daily Word) */}
      {showThoughtModal && renderThoughtModal()}
    </section>
  );
}
