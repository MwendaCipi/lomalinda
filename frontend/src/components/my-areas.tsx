"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, CalendarDays, Info, LogOut, Mail, MessageSquare, MoreVertical, Phone, Plus, Search, UserMinus, UserPlus, UserRound, Users, Wallet, X } from "lucide-react";

import { usePageHeader } from "@/components/app-frame";
import { SubNav } from "@/components/sub-nav";
import { isStaffRole } from "@/config/navigation";
import { showAlert } from "@/lib/alerts";
import { brand } from "@/lib/brand";
import { invalidateDepartments, useAllDepartments, useMyTies } from "@/hooks/use-departments";
import { useHeaderData } from "@/hooks/use-header-data";
import { dayFirst } from "@/lib/dates";
import { DepartmentAccountsPanel } from "@/components/department-hub";
import { openConversation } from "@/lib/chat";
import { WhatsAppIcon } from "@/components/whatsapp-icon";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

/**
 * One person on an area's roll, as the desk's own endpoint reports them —
 * with the contact details each member card's actions need (call, WhatsApp,
 * chat, email), the same four the roster offers on PC.
 */
type RollRow = {
  id: number;
  name: string;
  unit: string;
  via: string;
  /** The membership row behind this one — absent on the rows the music
      register unions in from the choir or a singing group, which the desk
      cannot take off here. */
  membership_id?: number | null;
  role?: string;
  username?: string;
  email?: string;
  phone_number?: string;
  whatsapp_number?: string;
};

/** One entry of an area's calendar. */
type AreaEvent = {
  id: number;
  title: string;
  date: string;
  time: string;
  location: string;
  lead: string;
};

function authHeaders(): Record<string, string> {
  const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

type AreaCandidate = { id: number; name: string; username: string };

/** One person's contact details, as the cards read them — the roll's own
    fields, or the leadership row's id where the holder has no roll entry. */
type ContactTarget = {
  name: string;
  /** The account to open a DM with; absent when nothing identifies one. */
  chatId?: number;
  phone?: string;
  whatsapp?: string;
  email?: string;
};

/**
 * A person's contact actions — the roster's own four (chat, WhatsApp, call,
 * email), wherever the person appears: a roll card or the leadership row.
 *
 * A wide card shows them one tap each, as the roll always has; a phone folds
 * them behind one Actions button that opens a popover, so four icon buttons
 * never squeeze a name off its own card. Only the doors the person's details
 * actually open are listed, and the popover closes on any pick or a click
 * away from it.
 */
function ContactActions({
  target,
  onChat,
}: {
  target: ContactTarget;
  onChat: (memberId: number) => void;
}) {
  const [open, setOpen] = useState(false);

  // A click outside the control closes it — the same read the desks' row
  // menus use, so the popover behaves like every other menu in the system.
  useEffect(() => {
    if (!open) return;
    const handleOutside = (event: MouseEvent) => {
      const el = event.target as HTMLElement | null;
      if (el?.closest?.("[data-action-menu]")) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [open]);

  // WhatsApp reaches them by whatever number the church holds, digits only.
  // WhatsApp's wa.me link needs the international form (2547...), so
  // convert the 07... stored on the record first.
  const rawWa = (target.whatsapp || target.phone || "").replace(/\D/g, "");
  const wa = rawWa.startsWith("0") ? "254" + rawWa.slice(1) : rawWa;
  type Action = { key: string; label: string; icon: React.ReactNode; href?: string; run?: () => void };
  const actions: Action[] = [];
  if (target.chatId) {
    actions.push({
      key: "chat",
      label: "Chat here",
      icon: <MessageSquare className="h-4 w-4" aria-hidden="true" />,
      run: () => {
        setOpen(false);
        onChat(target.chatId as number);
      },
    });
  }
  if (wa) {
    actions.push({ key: "wa", label: "WhatsApp", icon: <WhatsAppIcon className="h-4 w-4" />, href: `https://wa.me/${wa}` });
  }
  if (target.phone) {
    actions.push({ key: "call", label: "Call", icon: <Phone className="h-4 w-4" aria-hidden="true" />, href: `tel:${target.phone}` });
  }
  if (target.email) {
    actions.push({ key: "email", label: "Email", icon: <Mail className="h-4 w-4" aria-hidden="true" />, href: `mailto:${target.email}` });
  }
  if (actions.length === 0) return null;

  const iconBtn = "flex h-8 w-8 items-center justify-center rounded-lg border border-sand-mute bg-white text-ember transition hover:bg-sand";
  const menuItem = "flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-xs font-semibold text-bark transition hover:bg-sand";

  return (
    <div className="relative shrink-0" data-action-menu>
      {/* A wide card has room for the four, one tap each. */}
      <div className="hidden items-center gap-1.5 sm:flex">
        {actions.map((action) =>
          action.href ? (
            <a
              key={action.key}
              href={action.href}
              target={action.href.startsWith("http") ? "_blank" : undefined}
              rel={action.href.startsWith("http") ? "noreferrer" : undefined}
              aria-label={`${action.label} ${target.name}`}
              title={action.label}
              className={iconBtn}
            >
              {action.icon}
            </a>
          ) : (
            <button
              key={action.key}
              type="button"
              onClick={action.run}
              aria-label={`${action.label} ${target.name}`}
              title={action.label}
              className={iconBtn}
            >
              {action.icon}
            </button>
          ),
        )}
      </div>

      {/* A phone folds them behind one Actions popover. */}
      <div className="sm:hidden">
        <button
          type="button"
          onClick={() => setOpen((current) => !current)}
          aria-expanded={open}
          aria-label={`Actions for ${target.name}`}
          title="Actions"
          className={iconBtn}
        >
          <MoreVertical className="h-4 w-4 text-moss" aria-hidden="true" />
        </button>
        {open && (
          <div className="absolute right-0 top-full z-40 mt-1.5 w-44 rounded-2xl border border-sand-line bg-white p-1.5 text-left shadow-2xl ring-1 ring-black/5">
            {actions.map((action) =>
              action.href ? (
                <a
                  key={action.key}
                  href={action.href}
                  target={action.href.startsWith("http") ? "_blank" : undefined}
                  rel={action.href.startsWith("http") ? "noreferrer" : undefined}
                  onClick={() => setOpen(false)}
                  className={menuItem}
                >
                  {action.icon}
                  {action.label}
                </a>
              ) : (
                <button key={action.key} type="button" onClick={action.run} className={menuItem}>
                  {action.icon}
                  {action.label}
                </button>
              ),
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function AddAreaMemberModal({
  departmentLabel,
  rollIds,
  onClose,
  onBatchAdd,
}: {
  departmentLabel: string;
  /** Already on this roll — the search marks them, the desk can't pick them twice. */
  rollIds: Set<number>;
  onClose: () => void;
  /** Sends every picked name at once; resolves false when the send was
      refused, so the modal keeps the picks for a retry. */
  onBatchAdd: (members: AreaCandidate[]) => Promise<boolean>;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<AreaCandidate[]>([]);
  const [resultsForQuery, setResultsForQuery] = useState("");
  const [searching, setSearching] = useState(false);
  // The batch list: picked names wait here until Add members sends them all —
  // the same picker the Church Leadership desk's roll already uses.
  const [picked, setPicked] = useState<AreaCandidate[]>([]);
  const [sending, setSending] = useState(false);
  const pickedIds = new Set(picked.map((member) => member.id));

  const visibleResults = query.trim().length >= 2 && resultsForQuery === query.trim() ? results : [];

  useEffect(() => {
    if (query.trim().length < 2) return;
    let alive = true;
    const timer = window.setTimeout(() => {
      setSearching(true);
      fetch(`${API_URL}/api/members/users/`, { headers: authHeaders() })
        .then((res) => (res.ok ? res.json() : []))
        .then((data) => {
          if (!alive) return;
          const needle = query.trim().toLowerCase();
          const members = Array.isArray(data) ? data : Array.isArray(data?.results) ? data.results : [];
          setResultsForQuery(query.trim());
          setResults(
            members
              .filter((user: { first_name?: string; last_name?: string; username?: string; phone_number?: string }) =>
                `${user.first_name || ""} ${user.last_name || ""} ${user.username || ""} ${user.phone_number || ""}`
                  .toLowerCase()
                  .includes(needle),
              )
              .slice(0, 12)
              .map((user: { id: number; first_name?: string; last_name?: string; username: string }) => ({
                id: user.id,
                name: `${user.first_name || ""} ${user.last_name || ""}`.trim() || user.username,
                username: user.username,
              })),
          );
        })
        .catch(() => {
          if (alive) setResults([]);
        })
        .finally(() => {
          if (alive) setSearching(false);
        });
    }, 250);
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [query]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" role="presentation">
      <div role="dialog" aria-modal="true" aria-labelledby="add-area-member-title" className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-3xl bg-white p-5 shadow-2xl ring-1 ring-sand-line sm:p-6">
        <div className="flex items-center justify-between gap-3 border-b border-sand-line pb-3">
          <div>
            <h2 id="add-area-member-title" className="text-base font-bold text-bark">Add member</h2>
            <p className="mt-0.5 text-xs text-moss">Add someone to {departmentLabel}&apos;s roll.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-2 text-moss hover:bg-sand hover:text-bark">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="relative mt-4">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-moss" aria-hidden="true" />
          <input
            autoFocus
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by name, username or phone…"
            aria-label="Search members to add"
            className="w-full rounded-xl border border-sand-line bg-sand py-2.5 pl-9 pr-3 text-sm outline-none focus:border-ember"
          />
        </div>
        <div className="mt-3 space-y-2">
          {searching && <p className="py-4 text-center text-xs text-moss">Searching…</p>}
          {!searching && query.trim().length >= 2 && results.length === 0 && (
            <p className="py-4 text-center text-xs text-moss">No members match that search.</p>
          )}
          {!searching && visibleResults.map((member) => {
            const onRoll = rollIds.has(member.id) || pickedIds.has(member.id);
            return (
              <button
                key={member.id}
                type="button"
                disabled={onRoll}
                onClick={() => {
                  setPicked((current) => [...current, member]);
                  setQuery("");
                  setResults([]);
                }}
                className={`flex w-full items-center justify-between gap-3 rounded-xl border border-sand-line px-3.5 py-3 text-left transition ${
                  onRoll ? "cursor-not-allowed border-dashed opacity-60" : "hover:border-ember hover:bg-sand-linen"
                }`}
              >
                <span className="flex min-w-0 items-center gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-sand-card text-xs font-bold uppercase text-ember" aria-hidden="true">
                    {member.name.slice(0, 1) || "?"}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-bark">{member.name}</span>
                    <span className="block truncate text-[11px] text-moss">@{member.username}</span>
                  </span>
                </span>
                <span className="shrink-0 text-xs font-semibold text-ember">{onRoll ? "On this roll" : "Pick"}</span>
              </button>
            );
          })}
        </div>
        {/* The batch list: picked names gather here and one button sends
            them all — a roll built a class at a time, not a name at a time. */}
        <div className="mt-4 border-t border-sand-line pt-3">
          {picked.length === 0 ? (
            <p className="text-center text-[11px] text-moss">Search and pick everyone to add, then send them to the roll together.</p>
          ) : (
            <ul className="space-y-1.5">
              {picked.map((member) => (
                <li key={member.id} className="flex items-center justify-between gap-2 rounded-xl bg-sand px-3 py-2">
                  <span className="min-w-0 truncate text-xs font-semibold text-bark">{member.name}</span>
                  <button
                    type="button"
                    onClick={() => setPicked((current) => current.filter((p) => p.id !== member.id))}
                    aria-label={`Remove ${member.name} from the list`}
                    className="shrink-0 text-[11px] font-semibold text-moss transition hover:text-ember"
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
          <button
            type="button"
            disabled={picked.length === 0 || sending}
            onClick={async () => {
              setSending(true);
              try {
                // Only a successful send empties the list — a refused batch
                // keeps the picks so the desk can retry as-is.
                const added = await onBatchAdd(picked);
                if (added) {
                  setPicked([]);
                  onClose();
                }
              } finally {
                setSending(false);
              }
            }}
            className="mt-3 w-full rounded-xl bg-ember px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-ember-deep disabled:opacity-60"
          >
            {sending ? "Adding…" : `Add ${picked.length > 0 ? picked.length : ""} member${picked.length === 1 ? "" : "s"}`.trim()}
          </button>
        </div>
      </div>
    </div>
  );
}

function AddAreaEventModal({
  departmentLabel,
  onClose,
  onAdd,
}: {
  departmentLabel: string;
  onClose: () => void;
  onAdd: (event: { title: string; date: string; time: string; location: string; mode: "physical" | "virtual"; meetingLink: string }) => Promise<boolean>;
}) {
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [location, setLocation] = useState("");
  const [mode, setMode] = useState<"physical" | "virtual">("physical");
  const [meetingLink, setMeetingLink] = useState("");
  const [saving, setSaving] = useState(false);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" role="presentation">
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-area-event-title"
        onSubmit={async (event) => {
          event.preventDefault();
          if (!title.trim() || !date) return;
          setSaving(true);
          const added = await onAdd({ title: title.trim(), date, time, location, mode, meetingLink });
          if (added) onClose();
          setSaving(false);
        }}
        className="max-h-[90vh] w-full max-w-lg space-y-4 overflow-y-auto rounded-3xl bg-white p-5 shadow-2xl ring-1 ring-sand-line sm:p-6"
      >
        <div className="flex items-center justify-between gap-3 border-b border-sand-line pb-3">
          <div>
            <h2 id="add-area-event-title" className="text-base font-bold text-bark">Add calendar event</h2>
            <p className="mt-0.5 text-xs text-moss">Add an event to {departmentLabel}&apos;s calendar.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-2 text-moss hover:bg-sand hover:text-bark">
            <X className="h-4 w-4" />
          </button>
        </div>
        <label className="block text-xs font-semibold text-bark">
          Event title
          <input required autoFocus value={title} onChange={(event) => setTitle(event.target.value)} className="mt-1 w-full rounded-xl border border-sand-line bg-sand px-3 py-2.5 text-sm font-normal outline-none focus:border-ember" />
        </label>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block text-xs font-semibold text-bark">
            Date
            <input required type="date" value={date} onChange={(event) => setDate(event.target.value)} className="mt-1 w-full rounded-xl border border-sand-line bg-sand px-3 py-2.5 text-sm font-normal outline-none focus:border-ember" />
          </label>
          <label className="block text-xs font-semibold text-bark">
            Time
            <input type="time" value={time} onChange={(event) => setTime(event.target.value)} className="mt-1 w-full rounded-xl border border-sand-line bg-sand px-3 py-2.5 text-sm font-normal outline-none focus:border-ember" />
          </label>
        </div>
        <fieldset>
          <legend className="text-xs font-semibold text-bark">Event type</legend>
          <div className="mt-2 flex gap-2">
            {(["physical", "virtual"] as const).map((option) => (
              <button key={option} type="button" aria-pressed={mode === option} onClick={() => setMode(option)} className={`rounded-xl px-4 py-2 text-xs font-semibold capitalize ${mode === option ? "bg-ember text-white" : "border border-sand-line bg-white text-bark"}`}>
                {option}
              </button>
            ))}
          </div>
        </fieldset>
        {mode === "physical" ? (
          <label className="block text-xs font-semibold text-bark">
            Location
            <input value={location} onChange={(event) => setLocation(event.target.value)} className="mt-1 w-full rounded-xl border border-sand-line bg-sand px-3 py-2.5 text-sm font-normal outline-none focus:border-ember" />
          </label>
        ) : (
          <label className="block text-xs font-semibold text-bark">
            Meeting link
            <input type="url" value={meetingLink} onChange={(event) => setMeetingLink(event.target.value)} placeholder="https://…" className="mt-1 w-full rounded-xl border border-sand-line bg-sand px-3 py-2.5 text-sm font-normal outline-none focus:border-ember" />
          </label>
        )}
        <div className="flex justify-end gap-2 border-t border-sand-line pt-3">
          <button type="button" onClick={onClose} className="rounded-xl border border-sand-line px-4 py-2.5 text-xs font-semibold text-moss">Cancel</button>
          <button type="submit" disabled={saving || !title.trim() || !date} className="rounded-xl bg-ember px-4 py-2.5 text-xs font-semibold text-white disabled:opacity-60">
            {saving ? "Saving…" : "Add event"}
          </button>
        </div>
      </form>
    </div>
  );
}

/**
 * The two fellowships that are one sex's own: the men's ministry and the
 * women's. A member of the other sex may still belong by the desk's own
 * hand, but may not ask to join — so the card is not offered them.
 */
const SEX_ONLY_AREA: Record<string, "male" | "female"> = {
  amm: "male",
  awm: "female",
};

type AreaTab = "mine" | "other";

const TAB_LABELS: Record<AreaTab, string> = { mine: "My Ministry", other: "Other Ministries" };

const LEGACY_DEPARTMENT_CODES: Record<string, string> = {
  children: "children",
  young_adults: "aym",
};

/**
 * My areas — the church's ministries and departments as the member's own map.
 *
 * One page, two sub-navs: the member's own areas and the other
 * ministries/departments they may ask to join. Opening a card reads the area —
 * its leadership, its roll, its calendar, and its accounts & withdrawals —
 * with withdrawal requests enabled for leaders.
 */
export function MyAreas() {
  const rows = useAllDepartments();
  const ties = useMyTies();
  const { me } = useHeaderData();
  const sex = (me?.gender || "").trim().toLowerCase();
  const roles = Array.isArray(me?.roles) && me.roles.length > 0 ? me.roles : [me?.role || "member"];
  // The office oversees every area — the two sex-only fellowships among
  // them — so those are only ever withheld from a member who may not ask
  // to join them.
  const staff = isStaffRole(roles);

  const [tab, setTab] = useState<AreaTab>("mine");
  const [openCode, setOpenCode] = useState<string | null>(null);
  const [areaView, setAreaView] = useState<"members" | "calendar" | "accounts">("members");
  const [joining, setJoining] = useState<string | null>(null);
  const [leaving, setLeaving] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<number | null>(null);
  /** Whether the screen is wide enough for the leadership card. A phone
      reads the area as one list — every leader is a member row wearing their
      role badge — so the second card only exists where it earns its space.
      Read synchronously from the media query rather than set in an effect:
      the area view only ever renders after a tap, so there is no markup to
      disagree with. */
  const [wide, setWide] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia("(min-width: 640px)").matches : true
  );

  useEffect(() => {
    const query = window.matchMedia("(min-width: 640px)");
    const onChange = (event: MediaQueryListEvent) => setWide(event.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);
  const legacyDepartmentCode = (me?.department || "").trim();
  const ownDepartmentCode = (me?.department_ref || LEGACY_DEPARTMENT_CODES[legacyDepartmentCode] || legacyDepartmentCode).trim();

  /** May the member ask to join this area? The two sex-only fellowships say no
      to the other sex; every other ministry and department is open. */
  const canJoin = useCallback((code: string) => {
    const only = SEX_ONLY_AREA[code];
    return !only || !sex || only === sex;
  }, [sex]);

  const isMyMinistry = useCallback((area: (typeof rows)[number]) => {
    return area.code === ownDepartmentCode || ties.includes(area.code);
  }, [ownDepartmentCode, ties]);

  // What the member sees: first the areas they belong to or serve in, then
  // other areas open for a join request. Sex-only ministries stay hidden from
  // people who may not request them.
  const visible = useMemo(
    () =>
      rows
        .filter((area) => {
          const mine = isMyMinistry(area);
          if (tab === "mine") return mine;
          return !mine && !ties.includes(area.code) && (staff || canJoin(area.code));
        })
        .sort((a, b) => {
          if (tab === "mine") {
            const departmentA = a.code === ownDepartmentCode ? 0 : 1;
            const departmentB = b.code === ownDepartmentCode ? 0 : 1;
            if (departmentA !== departmentB) return departmentA - departmentB;
            const groupA = a.group === "ministry" ? 0 : 1;
            const groupB = b.group === "ministry" ? 0 : 1;
            return groupA - groupB || a.label.localeCompare(b.label);
          }
          // Other Ministries reads as one A–Z list, the way the rail files
          // it: nobody should step past every ministry before the first
          // department appears.
          return a.label.localeCompare(b.label);
        }),
    [canJoin, isMyMinistry, ownDepartmentCode, rows, staff, tab, ties],
  );

  const openArea = openCode ? rows.find((row) => row.code === openCode) ?? null : null;

  const { setCustomToggles, setCustomHeader } = usePageHeader();
  const accountViewItems = useMemo(
    () => [
      { key: "members", label: "Members", icon: Users },
      { key: "calendar", label: "Calendar", icon: CalendarDays },
      { key: "accounts", label: "Account & Withdrawals", short: "Accounts", help: "Account & Withdrawals", icon: Wallet },
    ],
    [],
  );

  // The sub-navs: for directory list (my/joinable), or for opened area (Members/Calendar/Accounts).
  useEffect(() => {
    if (openArea) {
      setCustomToggles(
        <SubNav
          label={`${openArea.label} views`}
          value={areaView}
          onChange={(next) => setAreaView(next as typeof areaView)}
          items={accountViewItems}
        />
      );
      return () => setCustomToggles(null);
    }
    setCustomToggles(
      <SubNav
        label="Ministry"
        value={tab}
        onChange={(next) => {
          setTab(next as AreaTab);
          setOpenCode(null);
          setAreaView("members");
        }}
        items={[
          { key: "mine", label: TAB_LABELS.mine },
          { key: "other", label: TAB_LABELS.other },
        ]}
      />
    );
    return () => setCustomToggles(null);
  }, [openArea, areaView, tab, accountViewItems, setCustomToggles]);

  // The shell names the area the member opened, or the map they are on.
  useEffect(() => {
    setCustomHeader(
      openArea
        ? { label: openArea.label, description: openArea.description }
        : {
            label: "Ministry",
            description:
              tab === "mine"
                ? "The ministries and departments you are part of or serve in."
                : "Other ministries and departments you can ask to join.",
          }
    );
    return () => setCustomHeader(null);
  }, [openArea, tab, setCustomHeader]);

  const [roll, setRoll] = useState<RollRow[]>([]);
  const [events, setEvents] = useState<AreaEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [canManageArea, setCanManageArea] = useState(false);
  const [manageAreaCode, setManageAreaCode] = useState<string | null>(null);
  const [showAddMember, setShowAddMember] = useState(false);
  const [showAddEvent, setShowAddEvent] = useState(false);
  const [areaReload, setAreaReload] = useState(0);
  const router = useRouter();

  useEffect(() => {
    if (!openArea) return;
    const code = openArea.code;
    let alive = true;
    // The state writes ride a microtask, which is what keeps the effect's own
    // synchronous body from cascading the render (the same shape the desks
    // use for their own loads).
    void Promise.resolve().then(async () => {
      if (!alive) return;
      setLoading(true);
      const [membersData, eventsData] = await Promise.all([
        fetch(`${API_URL}/api/members/departments/${code}/members/`, { headers: authHeaders() })
          .then((res) => (res.ok ? res.json() : { members: [] }))
          .catch(() => ({ members: [] })),
        fetch(`${API_URL}/api/members/departments/${code}/events/`, { headers: authHeaders() })
          .then((res) => (res.ok ? res.json() : { events: [] }))
          .catch(() => ({ events: [] })),
      ]);
      if (!alive) return;
      setRoll(Array.isArray(membersData?.members) ? membersData.members : []);
      setEvents(Array.isArray(eventsData?.events) ? eventsData.events : []);
      setCanManageArea(Boolean(membersData?.can_manage));
      setManageAreaCode(code);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [openArea, areaReload]);

  // The batch add: one request carries every picked name — the endpoint
  // accepts member_ids as a list, so the whole batch lands in one send.
  async function addAreaMembers(members: AreaCandidate[]): Promise<boolean> {
    if (!openArea || members.length === 0) return false;
    try {
      const response = await fetch(`${API_URL}/api/members/departments/${openArea.code}/members/`, {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ member_ids: members.map((member) => member.id), unit: "" }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.detail || "The members could not be added.");
      const names = members.map((member) => member.name);
      const detail =
        names.length === 1
          ? `${names[0]} now belongs to ${openArea.label}.`
          : names.length <= 3
          ? `${names.join(", ")} now belong to ${openArea.label}.`
          : `${names.length} members now belong to ${openArea.label}.`;
      showAlert("Added to roll", detail, "success", { toast: true, timer: 5000, showConfirmButton: false });
      setAreaReload((value) => value + 1);
      return true;
    } catch (error) {
      showAlert("Could not add member", error instanceof Error ? error.message : "Try again.", "error");
      return false;
    }
  }

  async function addAreaEvent(event: { title: string; date: string; time: string; location: string; mode: "physical" | "virtual"; meetingLink: string }): Promise<boolean> {
    if (!openArea) return false;
    try {
      const body = new FormData();
      body.append("title", event.title);
      body.append("date", event.date);
      body.append("time", event.time);
      body.append("mode", event.mode);
      body.append("location", event.location);
      body.append("meeting_link", event.meetingLink);
      body.append("department", openArea.code);
      body.append("unit", "");
      const response = await fetch(`${API_URL}/api/members/departments/${openArea.code}/events/`, {
        method: "POST",
        headers: authHeaders(),
        body,
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.detail || "The event could not be saved.");
      showAlert("Event added", `“${event.title}” is on the ${openArea.label} calendar.`, "success", { toast: true, timer: 4000, showConfirmButton: false });
      setAreaReload((value) => value + 1);
      return true;
    } catch (error) {
      showAlert("Could not add event", error instanceof Error ? error.message : "Try again.", "error");
      return false;
    }
  }

  async function requestToJoin(code: string, label: string) {
    setJoining(code);
    try {
      const res = await fetch(`${API_URL}/api/members/department-join-requests/${code}/`, {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "join", note: "" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || "Your request could not be sent.");
      showAlert(
        "Request sent",
        `The ${label}'s leadership and the elders' desk have your request to join.`,
        "success",
        { toast: true, timer: 4500, showConfirmButton: false }
      );
    } catch (error) {
      showAlert("Could not send the request", error instanceof Error ? error.message : "Try again.", "error");
    } finally {
      setJoining(null);
    }
  }

  /** A leader taking someone off the roll — the desk's own Remove, living
      on the member's row. The roll row and any seat in this area go
      together, so nobody keeps leading a place they have left. */
  async function removeAreaMember(member: RollRow) {
    if (!openArea) return;
    const result = await showAlert(
      "Remove from roll",
      `Take ${member.name} off ${openArea.label}'s roll? They will no longer appear among its members, and any seat they hold here is released.`,
      "question",
      { showCancelButton: true, confirmButtonText: "Remove", cancelButtonText: "Cancel", confirmButtonColor: brand.ember }
    );
    if (!result.isConfirmed) return;
    setRemovingId(member.id);
    try {
      const res = await fetch(`${API_URL}/api/members/departments/${openArea.code}/members/${member.id}/`, {
        method: "DELETE",
        headers: authHeaders(),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || "They could not be removed.");
      invalidateDepartments();
      showAlert("Removed from roll", `${member.name} is no longer on ${openArea.label}'s roll.`, "success", {
        toast: true,
        timer: 4500,
        showConfirmButton: false,
      });
      setAreaReload((value) => value + 1);
    } catch (error) {
      showAlert("Could not remove", error instanceof Error ? error.message : "Try again.", "error");
    } finally {
      setRemovingId(null);
    }
  }

  /** A member stepping off a roll themselves — leaving needs nobody's
      permission, and the map files them back under Other Ministries at
      once (the ties are re-read the moment the roll changes). */
  async function leaveArea(area: (typeof rows)[number]) {
    const isMinistry = area.group === "ministry";
    const result = await showAlert(
      isMinistry ? "Leave ministry" : "Leave department",
      `Step off ${area.label}'s roll? Its leadership will see you among its members no longer.`,
      "question",
      { showCancelButton: true, confirmButtonText: "Leave", cancelButtonText: "Stay", confirmButtonColor: brand.ember }
    );
    if (!result.isConfirmed) return;
    setLeaving(area.code);
    try {
      const res = await fetch(`${API_URL}/api/members/departments/${area.code}/members/`, {
        method: "DELETE",
        headers: authHeaders(),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || "You could not step off this roll.");
      invalidateDepartments();
      showAlert("You have left", `You are off ${area.label}'s roll.`, "success", {
        toast: true,
        timer: 4500,
        showConfirmButton: false,
      });
    } catch (error) {
      showAlert("Could not leave", error instanceof Error ? error.message : "Try again.", "error");
    } finally {
      setLeaving(null);
    }
  }  // ── One area, read-only ──────────────────────────────────────────
  // The chat flow is ContactMemberModal's: open the DM, then land in it.
  // The contact doors themselves live in ContactActions.
  const chatWith = async (memberId: number) => {
    try {
      await openConversation({ kind: "dm", member_id: memberId });
      router.push(`/chat?dm=${memberId}`);
    } catch (error) {
      showAlert("Could not open chat", error instanceof Error ? error.message : "Try again.", "error");
    }
  };
  if (openArea) {
    const canManageCurrentArea = manageAreaCode === openArea.code && canManageArea;
    const leaders = openArea.holders.filter((holder) => holder.kind === "leader");
    const assistants = openArea.holders.filter((holder) => holder.kind === "assistant");
    return (
      <div className="flex-1 min-w-0 h-full w-full px-4 py-6 sm:px-8 sm:py-8 lg:px-10 lg:py-10 md:overflow-y-auto custom-hover-scrollbar">
        <div className="mx-auto max-w-4xl space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => {
                setOpenCode(null);
                setAreaView("members");
              }}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-moss transition hover:text-bark"
            >
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
              Ministry
            </button>
          </div>

          {/* Section 1: Leadership — the wide screen's card. On a phone the
              roll carries the same people, their roles read as badges. */}
          {areaView === "members" && wide && (
            <section className="rounded-2xl border border-sand-line bg-white p-5 shadow-sm sm:p-6">
              <h2 className="flex items-center gap-2 text-sm font-bold text-bark">
                <UserRound className="h-4 w-4 text-ember" aria-hidden="true" />
                Leadership
              </h2>
              {leaders.length === 0 && assistants.length === 0 ? (
                <p className="mt-3 text-xs text-moss">No leadership is seated yet.</p>
              ) : (
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  {[...leaders, ...assistants].map((holder) => {
                    // The holder's contact details: the roll carries them when
                    // they also sit on it; an appointed holder without a roll
                    // entry still carries their account id from the directory.
                    const seated = roll.find((member) => member.username && member.username === holder.username);
                    return (
                      <div
                        key={`${holder.username}-${holder.role}-${holder.kind}`}
                        className="flex items-center gap-3 rounded-xl border border-sand-line bg-sand-linen px-3.5 py-3"
                      >
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-sand-card text-xs font-bold uppercase text-ember">
                          {holder.name.slice(0, 1) || "?"}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-bark">{holder.name}</p>
                          <p className="truncate text-[11px] text-moss">
                            {holder.role}
                            {holder.kind === "assistant" ? " · Assistant" : ""}
                          </p>
                        </div>
                        {/* The same contact actions a roll card gets — a leader
                            is reached as readily as the members beside them. */}
                        <ContactActions
                          target={{
                            name: holder.name,
                            chatId: holder.id ?? seated?.id,
                            phone: seated?.phone_number,
                            whatsapp: seated?.whatsapp_number,
                            email: seated?.email,
                          }}
                          onChat={chatWith}
                        />
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          )}

          {/* Section 2: Members */}
          {areaView === "members" && (
            <section className="rounded-2xl border border-sand-line bg-white p-5 shadow-sm sm:p-6">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h2 className="flex items-center gap-2 text-sm font-bold text-bark">
                    <Users className="h-4 w-4 text-ember" aria-hidden="true" />
                    Members
                  </h2>
                  {/* On a phone the count and Add member live in the bar at
                      the foot of the card instead — see below. */}
                  <span className="mt-1 hidden text-[11px] font-semibold text-moss sm:block">
                    {roll.length} {roll.length === 1 ? "person" : "people"}
                  </span>
                </div>
                {canManageCurrentArea && (
                  <button
                    type="button"
                    onClick={() => setShowAddMember(true)}
                    className="hidden min-h-10 shrink-0 items-center gap-1.5 rounded-xl bg-ember px-3 py-2 text-xs font-semibold text-white transition hover:bg-ember-deep sm:inline-flex"
                  >
                    <Plus className="h-4 w-4" aria-hidden="true" /> Add member
                  </button>
                )}
              </div>
              {loading && roll.length === 0 ? (
                <p className="mt-4 text-xs text-moss">Loading the roll…</p>
              ) : roll.length === 0 ? (
                <p className="mt-4 text-xs text-moss">Nobody is on this roll yet.</p>
              ) : (
                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                  {roll.map((member) => (
                    <article
                      key={member.id}
                      className="flex min-w-0 items-center gap-3 rounded-xl border border-sand-line bg-sand-linen px-3.5 py-3"
                    >
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-sand-card text-xs font-bold uppercase text-ember" aria-hidden="true">
                        {member.name.slice(0, 1) || "?"}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-bark">{member.name}</p>
                        {(member.role || member.unit || member.via) && (
                          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-moss">
                            {/* The role reads as a badge: with no leadership
                                card on a phone, this is how a leader is told
                                apart from the members beside them. */}
                            {member.role && (
                              <span className="rounded-full bg-sand-card px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-ember">
                                {member.role}
                              </span>
                            )}
                            {member.unit && <span>{member.unit}</span>}
                            {member.via && <span>Through {member.via}</span>}
                          </div>
                        )}
                      </div>
                      {/* The member's contact actions — the roster's four; a
                          wide card shows them one tap each, a phone folds
                          them into one Actions popover. */}
                      <ContactActions
                        target={{
                          name: member.name,
                          chatId: member.id,
                          phone: member.phone_number,
                          whatsapp: member.whatsapp_number,
                          email: member.email,
                        }}
                        onChat={chatWith}
                      />
                      {/* The leader's own Remove, on the row itself — shown
                          only where a real membership row stands behind it:
                          the music register's unioned rows are removed at
                          their own desk. */}
                      {canManageCurrentArea && Boolean(member.membership_id) && (
                        <button
                          type="button"
                          onClick={() => void removeAreaMember(member)}
                          disabled={removingId === member.id}
                          aria-label={`Remove ${member.name} from the roll`}
                          title="Remove from roll"
                          className="shrink-0 rounded-lg p-2 text-moss transition hover:bg-sand hover:text-ember disabled:opacity-60"
                        >
                          <UserMinus className="h-4 w-4" aria-hidden="true" />
                        </button>
                      )}
                    </article>
                  ))}
                </div>
              )}
              {/* The phone's own foot for this card: the count and the
                  desk's Add, pinned above the tab bar so a long roll never
                  carries them out of reach. */}
              <div className="sticky bottom-[calc(3.5rem_+_env(safe-area-inset-bottom))] z-10 -mx-5 -mb-5 mt-4 flex items-center justify-between gap-3 border-t border-sand-line bg-white px-5 py-3 sm:hidden">
                <span className="text-[11px] font-semibold text-moss">
                  {roll.length} {roll.length === 1 ? "person" : "people"}
                </span>
                {canManageCurrentArea && (
                  <button
                    type="button"
                    onClick={() => setShowAddMember(true)}
                    className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-xl bg-ember px-3 py-2 text-xs font-semibold text-white transition hover:bg-ember-deep"
                  >
                    <Plus className="h-4 w-4" aria-hidden="true" /> Add member
                  </button>
                )}
              </div>
            </section>
          )}

          {/* Section 3: Calendar */}
          {areaView === "calendar" && (
            <section className="rounded-2xl border border-sand-line bg-white p-5 shadow-sm sm:p-6">
              <h2 className="flex items-center gap-2 text-sm font-bold text-bark">
                <CalendarDays className="h-4 w-4 text-ember" aria-hidden="true" />
                Calendar
              </h2>
              <div className="mt-3 flex justify-end">
                {canManageCurrentArea && (
                  <button
                    type="button"
                    onClick={() => setShowAddEvent(true)}
                    className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-ember px-3 py-2 text-xs font-semibold text-white transition hover:bg-ember-deep"
                  >
                    <Plus className="h-4 w-4" aria-hidden="true" /> Add to calendar
                  </button>
                )}
              </div>
              {loading && events.length === 0 ? (
                <p className="mt-4 text-xs text-moss">Loading the calendar…</p>
              ) : events.length === 0 ? (
                <p className="mt-4 text-xs text-moss">
                  Nothing is on this {openArea.group === "ministry" ? "ministry" : "department"}&apos;s calendar yet.
                </p>
              ) : (
                <ul className="mt-4 space-y-2">
                  {events.map((event) => (
                    <li
                      key={event.id}
                      className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 rounded-xl border border-sand-line bg-sand-linen px-3.5 py-2.5"
                    >
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-bark">{event.title}</p>
                        <p className="text-[11px] text-moss">
                          {[event.time, event.location, event.lead].filter(Boolean).join(" · ") || "—"}
                        </p>
                      </div>
                      <span className="shrink-0 text-[11px] font-semibold text-ember">{dayFirst(event.date)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {/* Section 4: Account & Withdrawals */}
          {areaView === "accounts" && (
            <section className="rounded-2xl border border-sand-line bg-white p-5 shadow-sm sm:p-6">
              <div className="flex items-center justify-between gap-2 mb-4">
                <div>
                  <h2 className="flex items-center gap-2 text-sm font-bold text-bark">
                    <Wallet className="h-4 w-4 text-ember" aria-hidden="true" />
                    Account &amp; Withdrawals
                  </h2>
                  <p className="mt-0.5 text-xs text-moss">
                    Fund balance, transaction ledger, and withdrawal requests.
                  </p>
                </div>
              </div>
              <div className="h-[540px]">
                <DepartmentAccountsPanel
                  department={openArea}
                  showInlineControls
                  search=""
                  typeFilter="all"
                  className="flex min-h-0 flex-1 flex-col rounded-2xl border border-sand-line bg-sand-linen/30 h-full sm:overflow-hidden"
                />
              </div>
            </section>
          )}

          {showAddMember && (
            <AddAreaMemberModal
              departmentLabel={openArea.label}
              rollIds={new Set(roll.map((member) => member.id))}
              onClose={() => setShowAddMember(false)}
              onBatchAdd={addAreaMembers}
            />
          )}
          {showAddEvent && (
            <AddAreaEventModal
              departmentLabel={openArea.label}
              onClose={() => setShowAddEvent(false)}
              onAdd={addAreaEvent}
            />
          )}
        </div>
      </div>
    );
  }

  // ── The map: one card per area ─────────────────────────────────────────
  return (
    <div className="flex-1 min-w-0 h-full w-full px-4 py-6 sm:px-8 sm:py-8 lg:px-10 lg:py-10 md:overflow-y-auto custom-hover-scrollbar">
      {!openCode && visible.length === 0 ? (
        <div className="mx-auto max-w-2xl rounded-2xl border border-dashed border-sand-line px-5 py-12 text-center">
          <Users className="mx-auto h-9 w-9 text-moss" aria-hidden="true" />
          <p className="mt-3 text-sm font-semibold text-bark">
            {rows.length === 0 ? "Loading the church's ministries and departments…" : "Nothing here yet"}
          </p>
          <p className="mt-1 text-xs text-moss">
            {rows.length === 0
              ? "One moment."
              : tab === "mine"
              ? "Your department and ministries will appear here once the church office files them."
              : "There are no other ministries or departments available to join."}
          </p>
        </div>
      ) : (
        <div className="mx-auto grid max-w-4xl gap-4 sm:grid-cols-2">
          {visible.map((area) => {
            const inArea = isMyMinistry(area);
            const leaders = area.holders.filter((holder) => holder.kind === "leader").map((h) => h.name);
            return (
              <div
                key={area.code}
                role="button"
                tabIndex={0}
                onClick={() => setOpenCode(area.code)}
                onKeyDown={(event) => {
                  if (event.target !== event.currentTarget) return;
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    setOpenCode(area.code);
                  }
                }}
                className="flex cursor-pointer flex-col rounded-2xl border border-sand-line bg-white p-5 text-left shadow-sm transition hover:border-ember hover:shadow-md focus:outline-none focus:ring-2 focus:ring-ember/30"
              >
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-sm font-bold text-bark">{area.label}</h3>
                  {inArea && (
                    <span className="shrink-0 rounded-full bg-sand-card px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-ember">
                      You&apos;re in
                    </span>
                  )}
                </div>
                {area.description && <p className="mt-1.5 text-xs leading-5 text-moss">{area.description}</p>}
                <p className="mt-3 text-[11px] text-moss">
                  <span className="font-semibold text-bark">Leader:</span>{" "}
                  {leaders.length > 0 ? leaders.join(", ") : "not seated yet"}
                </p>
                <p className="text-[11px] text-moss">
                  {area.memberCount} on the roll · {area.eventCount} event{area.eventCount === 1 ? "" : "s"}
                </p>
                <div className="mt-4 flex flex-wrap gap-2 border-t border-sand-line pt-3">
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      setOpenCode(area.code);
                    }}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-sand-line bg-white px-3 py-1.5 text-xs font-semibold text-bark transition hover:border-ember hover:text-ember"
                  >
                    {area.group === "ministry" ? "View ministry" : "View department"}
                  </button>
                  {!inArea && canJoin(area.code) && (
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        void requestToJoin(area.code, area.label);
                      }}
                      disabled={joining === area.code}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-ember px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-ember-deep disabled:opacity-60"
                    >
                      <UserPlus className="h-3.5 w-3.5" aria-hidden="true" />
                      {joining === area.code ? "Sending…" : "Request to join"}
                    </button>
                  )}
                  {/* Leaving is the member's own door, and it sits on their
                      own card among its actions. */}
                  {inArea && (
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        void leaveArea(area);
                      }}
                      disabled={leaving === area.code}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-sand-line bg-white px-3 py-1.5 text-xs font-semibold text-moss transition hover:border-ember hover:text-ember disabled:opacity-60"
                    >
                      <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
                      {leaving === area.code
                        ? "Leaving…"
                        : area.group === "ministry"
                        ? "Leave ministry"
                        : "Leave department"}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
