"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { showAlert } from "@/lib/alerts";
import { Send, Sparkles, X } from "lucide-react";
import { localDate, dayFirst } from "@/lib/dates";
import { CARD_OPTION_CHOICES, GIVING_OPTION_CODES } from "@/lib/announcement-options";
import { useAllDepartments } from "@/hooks/use-departments";

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
  // The eldership as one body — every seat, not only one code. The pastorate
  // writes to the elders with it when a word is for their ears first.
  { value: "elders", label: "Elders" },
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
  // An Enroll now / Register now post is also a department event: the desk
  // whose calendar holds it, what a seat costs, and when registration closes.
  enroll_department?: string | null;
  enroll_fee?: string | number | null;
  enroll_deadline?: string | null;
  enrollment_event?: number | null;
  // The buttons this post's card carries — codes from CARD_OPTION_CHOICES.
  // Empty means a plain notice with nothing to press.
  options?: string[];
  // When the post goes live. Repeats is the meeting's own rhythm, kept
  // beside its hours rather than here.
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

/** A day typed day-first — dd/mm/yyyy, the way the church writes dates.
 *
 *  The browser's own date picker reads month-first in some locales, which is
 *  how the 3rd of November becomes the 11th of March. This field takes the
 *  day first, keeps the wire value ISO, and shows the day-first reading back
 *  once the officer leaves it.
 */
function parseDayFirst(text: string): string | null {
  const digits = text.replace(/\D/g, "");
  if (digits.length !== 8) return null;
  const day = Number(digits.slice(0, 2));
  const month = Number(digits.slice(2, 4));
  const year = Number(digits.slice(4));
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function DayField({
  value,
  onChange,
  required = false,
  invalid = false,
}: {
  value: string;
  onChange: (iso: string) => void;
  required?: boolean;
  /** Marks a day that cannot be accepted — a schedule hour already gone. */
  invalid?: boolean;
}) {
  // What is being typed, while it is being typed: the field shows the
  // officer's own digits rather than snapping back at every keystroke, and
  // settles on the day-first reading when they leave it.
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <input
      type="text"
      inputMode="numeric"
      required={required}
      value={draft ?? (value ? dayFirst(value) : "")}
      placeholder="dd/mm/yyyy"
      onChange={(event) => {
        const text = event.target.value;
        setDraft(text);
        const iso = parseDayFirst(text);
        if (iso) onChange(iso);
        else if (!text.trim()) onChange("");
      }}
      onBlur={() => setDraft(null)}
      aria-invalid={invalid || undefined}
      className={`mt-1 w-full rounded-xl border bg-white px-3.5 py-2.5 text-xs text-bark outline-none focus:border-ember ${
        invalid ? "border-red-300" : "border-sand-mute"
      }`}
    />
  );
}

  /** Which reach values are single-choice; the rest are congregation groups. */
  const REACH_VALUES = new Set(["all", "members_only", "public_website"]);


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


export function AnnouncementManager({
  presetAudience,
  /** Communicate mode: render only the compose modal, open from the start,
      with its own full-screen chrome and close behaviour suppressed — the
      host modal supplies both. */
  composerOnly = false,
  onDone,
  /** Thought mode: render only the Share a Thought modal, open from the
      start — the desk's Sharing panel opens the word/thought composer with
      nothing behind it. Closing it (cancelled or saved) hands control back
      to the host through `onDone`. */
  thoughtOnly = false,
  /** An announcement the host's feed asked to edit: the compose modal opens
      loaded from that row, so a post edited from the feed changes only
      itself. Null means a fresh post. */
  editItem = null,
  
  /** The host's refresh: run after Delete or Hide/Unhide so the feed behind
      the still-open composer reads the change at once. */
  onChanged = null,
}: { presetAudience?: string[]; composerOnly?: boolean; onDone?: () => void; thoughtOnly?: boolean; editItem?: Announcement | null; onChanged?: (() => void) | null } = {}) {
  // The id being edited; null while composing a new announcement.
  const [editingId, setEditingId] = useState<number | null>(null);
  // Whether the post being edited is visible to users: Hide keeps the row
  // on the desk while taking it out of every feed. True for a fresh post.
  const [isPublished, setIsPublished] = useState(true);
  // Delete / Hide / Unhide in flight — the footer's own buttons, apart from
  // the form's save.
  const [acting, setActing] = useState(false);

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
    // A post that enrols or registers people is also an event: the desk whose
    // calendar holds it, what a seat costs, and the day its register closes.
    enroll_department: "",
    enroll_fee: "",
    enroll_deadline: "",
    // Site and email are the ordinary pair: the post shows on the site and
    // lands in inboxes. SMS is added for the occasions it is wanted.
    sharing_option: "site,email",
    href: "",
    event_date_from: "",
    event_date_to: "",
    // The event's clock: blank for an all-day event, where the day says it.
    event_time_from: "",
    event_time_to: "",
    // When the post goes live, if it is scheduled at all. All blank means it
    // is posted the moment it is saved, which is what Post now says.
    publish_on: "",
    publish_time: "",
    repeat: "none" as "none" | "daily" | "weekly" | "monthly",
  });
  // The treasury accounts a "Request support" post may name, offered as the
  // wording members read on the giving form.
  const [accounts, setAccounts] = useState<{ id: number; name: string; description?: string }[]>([]);
  // The desks an Enroll now / Register now post may file its event under.
  const departments = useAllDepartments();
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
  // The day and minute this composer opened, read once. The fields judge a
  // schedule against it rather than reading the clock while rendering, which
  // the React compiler forbids — a render-time clock would make the form a
  // different component on every keystroke.
  const [openedAt, setOpenedAt] = useState<{ day: string; minutes: number } | null>(null);
  useEffect(() => {
    // Rides a microtask, the same shape as the form's other mount-time reads:
    // the set lands outside the effect's own synchronous body.
    void Promise.resolve().then(() => {
      const at = new Date();
      setOpenedAt({ day: localDate(at), minutes: at.getHours() * 60 + at.getMinutes() });
    });
  }, []);

  function handleEdit(item: Announcement) {
    setEditingId(item.id);
    setIsPublished(item.published ?? true);
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
      enroll_department: item.enroll_department ?? "",
      enroll_fee: item.enroll_fee != null ? String(item.enroll_fee) : "",
      enroll_deadline: item.enroll_deadline ?? "",
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
  }

  // A post brought from the host's feed opens the composer loaded from that
  // row: one press on a post's Edit lands the office in the form itself.
  useEffect(() => {
    if (!editItem) return;
    // The host's row rides a microtask: the composer's state writes then land
    // outside this effect's own synchronous body, which the React compiler
    // forbids, and a new row still reopens the form.
    const item = editItem;
    void Promise.resolve().then(() => handleEdit(item));
    // The shape of the row never changes identity-wise while mounted; only
    // a new row from the host should reopen the form.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editItem]);

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


  useEffect(() => {
    const token = localStorage.getItem("access_token");
    fetch(`${API_URL}/api/members/treasury/accounts/`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => setAccounts(Array.isArray(data) ? data : []))
      .catch(() => setAccounts([]));
  }, []);




  function resetAndCloseModal() {
    setForm({
      title: "",
      text: "",      visibility: "all",
      audience: (presetAudience ?? []) as string[],
      options: [],
      support_account: "",
      enroll_department: "",
      enroll_fee: "",
      enroll_deadline: "",
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
    setIsPublished(true);
    setAttachment(null);
    setExistingAttachment(null);
    setRemoveAttachment(false);
    setMessage("");
    if (composerOnly) {
      // Communicate mode: posted (or cancelled) — hand control back to the host.
      onDone?.();
      return;
    }
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
    // Enrolling or registering people makes the post an event: the calendar
    // that holds it, what a seat costs, and the day the register closes. The
    // API insists on all three, so the form asks before the round trip.
    if (form.options.some((code) => code === "enroll" || code === "register")) {
      if (!form.enroll_department) {
        const err = "Choose the department or ministry whose calendar holds this event.";
        setMessage(err);
        showAlert("Department Missing", err, "error");
        return;
      }
      if (!form.enroll_fee || Number(form.enroll_fee) <= 0) {
        const err = "Set the amount a member pays to be enrolled.";
        setMessage(err);
        showAlert("Amount Missing", err, "error");
        return;
      }
      if (!form.enroll_deadline) {
        const err = "Set the day registration closes.";
        setMessage(err);
        showAlert("Deadline Missing", err, "error");
        return;
      }
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
        // The enrolment fields belong to an Enroll now / Register now post
        // only; a plain notice leaves them off the wire entirely.
        if (
          (key === "enroll_department" || key === "enroll_fee" || key === "enroll_deadline") &&
          !form.options.some((code) => code === "enroll" || code === "register")
        ) {
          return;
        }
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
      // A hidden post stays hidden through a save: without an explicit
      // published the API re-decides visibility from the sharing channels.
      if (editingId && !isPublished) payload.append("published", "false");
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
    // Whether the chosen day and hour have already gone: the API refuses a
    // past hour, so the field says so while the officer is still in it rather
    // than only when they press Post. Judged against the minute the composer
    // opened, which is near enough for a hint and keeps the render pure.
    const scheduleInPast = (() => {
      if (!openedAt || !form.publish_on) return false;
      if (form.publish_on !== openedAt.day) return form.publish_on < openedAt.day;
      const [hours, minutes] = (form.publish_time || "00:00").split(":").map(Number);
      return hours * 60 + minutes <= openedAt.minutes;
    })();
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

              {/* A post that enrols or registers people is also an event on
                  a desk's calendar: members pay the fee through the card's
                  button, and the desk seats them — by that payment, or by
                  hand on the day. */}
              {form.options.some((code) => code === "enroll" || code === "register") && (
                <>
                  <label className="block text-xs font-semibold text-bark md:col-span-2">
                    Department / ministry *
                    <select
                      value={form.enroll_department}
                      onChange={(e) => setForm({ ...form, enroll_department: e.target.value })}
                      className="mt-1 w-full rounded-xl border border-sand-mute bg-white px-3.5 py-2.5 text-xs text-bark outline-none focus:border-ember"
                    >
                      <option value="">-- Select the desk that runs it --</option>
                      {departments.map((row) => (
                        <option key={row.code} value={row.code}>
                          {row.label}
                        </option>
                      ))}
                    </select>
                    <span className="mt-1 block text-[10px] font-normal text-moss">
                      The event lands on this desk&apos;s calendar, and its leader can seat people there.
                    </span>
                  </label>
                  <div className="md:col-span-2 grid gap-3 sm:grid-cols-2">
                    <label className="block text-xs font-semibold text-bark">
                      Registration fee (KES) *
                      <input
                        type="number"
                        min="1"
                        required
                        value={form.enroll_fee}
                        onChange={(e) => setForm({ ...form, enroll_fee: e.target.value })}
                        placeholder="e.g. 500"
                        className="mt-1 w-full rounded-xl border border-sand-mute px-3.5 py-2.5 text-xs text-bark outline-none focus:border-ember"
                      />
                    </label>
                    <label className="block text-xs font-semibold text-bark">
                      Register closes *
                      <DayField
                        required
                        value={form.enroll_deadline}
                        onChange={(iso) => setForm({ ...form, enroll_deadline: iso })}
                      />
                    </label>
                  </div>
                </>
              )}

              <div className="md:col-span-2 grid grid-cols-2 gap-3">
                <label className="block text-xs font-semibold text-bark">
                  Event start *
                  <DayField
                    required
                    value={form.event_date_from}
                    onChange={(iso) => {
                      // Picking the start also sets the end to it — most
                      // events are one day, and the officer widens the end
                      // only when the event truly spans days. It also keeps
                      // end >= start no matter how the start moves.
                      setForm({ ...form, event_date_from: iso, event_date_to: iso });
                    }}
                  />
                </label>

                <label className="block text-xs font-semibold text-bark">
                  Event end
                  <DayField
                    value={form.event_date_to}
                    onChange={(iso) =>
                      setForm({
                        ...form,
                        event_date_to:
                          iso && form.event_date_from && iso < form.event_date_from
                            ? form.event_date_from
                            : iso,
                      })
                    }
                  />
                </label>
              </div>

              {/* The hour, beside the days it falls on, and the rhythm the
                  notice keeps. The times are optional: an all-day event leaves
                  them empty and reads on its dates alone. The start is not
                  copied into the end — a service that begins at 09:00 does not
                  finish at 09:00. Repeats rides this row because it is the
                  meeting's own rhythm, not a part of when the post goes out. */}
              <div className="md:col-span-2 grid gap-3 sm:grid-cols-3">
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

                <label className="block text-xs font-semibold text-bark">
                  Repeats
                  <select
                    value={form.repeat}
                    onChange={(e) => setForm({ ...form, repeat: e.target.value as typeof form.repeat })}
                    className="mt-1 w-full rounded-xl border border-sand-mute bg-white px-3.5 py-2.5 text-xs text-bark outline-none focus:border-ember"
                  >
                    {REPEAT_CHOICES.map((choice) => (
                      <option key={choice.value} value={choice.value}>{choice.label}</option>
                    ))}
                  </select>
                </label>

                <p className="sm:col-span-3 text-[10px] font-normal text-moss">
                  Times are optional — blank means an all-day event. A start time alone reads “from 09:00”.
                  Repeats keeps the notice on the board on its own rhythm once it is live.
                </p>
              </div>

              {/* When the post goes out: now, or at a day and hour the office
                  picks. Post now is the default — the board's oldest habit —
                  and the scheduling fields appear only when Schedule is
                  chosen, so a post going out at once is never asked for a day
                  it does not have. */}
              <div className="md:col-span-2 rounded-xl border border-sand-line bg-sand-linen/40 p-3">
                <span className="block text-xs font-semibold text-bark">When it goes out</span>
                <div role="radiogroup" aria-label="When the announcement goes out" className="mt-1.5 flex flex-wrap gap-2">
                  {[
                    { value: "now", label: "Post now", hint: "The moment you save it" },
                    { value: "schedule", label: "Schedule", hint: "A day and hour you choose" },
                  ].map((option) => {
                    const selected = option.value === "schedule" ? Boolean(form.publish_on) : !form.publish_on;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        onClick={() =>
                          setForm({
                            ...form,
                            // A day with no hour is a morning post: the hour is
                            // filled rather than left to read as midnight,
                            // which nobody schedules on purpose. The day opens
                            // on tomorrow, the soonest hour that is still ahead.
                            publish_on:
                              option.value === "schedule"
                                ? form.publish_on || localDate(new Date(Date.now() + 24 * 60 * 60 * 1000))
                                : "",
                            publish_time: option.value === "schedule" ? form.publish_time || "08:00" : "",
                          })
                        }
                        className={`flex min-w-0 flex-1 items-center gap-2 rounded-xl border px-3 py-2 text-left text-xs transition ${
                          selected ? "border-ember bg-white text-bark" : "border-sand-mute bg-white/60 text-moss hover:border-ember"
                        }`}
                      >
                        <span
                          className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
                            selected ? "border-ember" : "border-sand-mute"
                          }`}
                        >
                          {selected && <span className="h-2 w-2 rounded-full bg-ember" />}
                        </span>
                        <span className="min-w-0">
                          <span className="block font-semibold">{option.label}</span>
                          <span className="block text-[10px] font-normal text-moss">{option.hint}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
                {form.publish_on && (
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    <label className="block text-[11px] font-semibold text-moss">
                      Day
                      <DayField
                        invalid={scheduleInPast}
                        value={form.publish_on}
                        onChange={(iso) =>
                          setForm({
                            ...form,
                            publish_on: iso,
                            publish_time: iso && !form.publish_time ? "08:00" : form.publish_time,
                          })
                        }
                      />
                    </label>
                    <label className="block text-[11px] font-semibold text-moss">
                      Time
                      <input
                        type="time"
                        value={form.publish_time}
                        onChange={(e) => setForm({ ...form, publish_time: e.target.value })}
                        aria-invalid={scheduleInPast || undefined}
                        className={`mt-1 w-full rounded-xl border bg-white px-3 py-2 text-xs text-bark outline-none focus:border-ember ${
                          scheduleInPast ? "border-red-300" : "border-sand-mute"
                        }`}
                      />
                    </label>
                  </div>
                )}
                <p
                  className={`mt-1.5 text-[10px] ${
                    scheduleInPast ? "font-semibold text-red-700" : "font-normal text-moss"
                  }`}
                >
                  {scheduleInPast
                    ? "That day and hour have already gone — pick a later one, or choose Post now."
                    : form.publish_on
                      ? `Goes out on ${dayFirst(form.publish_on)}${form.publish_time ? ` at ${form.publish_time}` : ""} — nothing reaches the congregation before then.`
                      : "The post is published the moment you save it."}
                </p>
              </div>

              <div className="text-xs font-semibold text-bark md:col-span-2">
                {/* The name and the picker share one row: an attachment is a
                    single choice, not a section of its own, and the row ends
                    at the picker's own edge. */}
                <div className="flex flex-wrap items-center gap-2">
                  <span className="shrink-0">Attachment (optional)</span>
                  {existingAttachment && !removeAttachment && (
                    <p className="flex min-w-0 flex-1 flex-wrap items-center gap-2 rounded-xl border border-sand-deep bg-sand-veil px-3 py-2 text-xs font-normal text-moss-mid">
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
                  {!removeAttachment && (
                    <input
                      type="file"
                      onChange={(e) => {
                        setAttachment(e.target.files?.[0] ?? null);
                        if (e.target.files?.[0]) setRemoveAttachment(false);
                      }}
                      className="min-w-0 flex-1 rounded-xl border border-sand-mute px-3 py-2 font-normal text-bark outline-none file:mr-3 file:rounded-full file:border-0 file:bg-sand file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-bark focus:border-ember"
                    />
                  )}
                </div>
                {removeAttachment && (
                  <p className="mt-1 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-normal text-red-700">
                    Current attachment will be removed when you save.
                  </p>
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

  /** Take down the post being edited, after asking once. The host closes
      the composer and re-reads its feed. */
  async function handleDelete() {
    if (!editingId || acting) return;
    const answer = await showAlert(
      "Delete this announcement?",
      "It will be taken down for everyone. This cannot be undone.",
      "warning",
      { showCancelButton: true, confirmButtonText: "Delete", cancelButtonText: "Keep it" },
    );
    if (!answer.isConfirmed) return;
    setActing(true);
    try {
      const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
      const response = await fetch(`${API_URL}/api/members/announcements/${editingId}/`, {
        method: "DELETE",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.detail || "Failed to delete announcement.");
      }
      showAlert("Announcement Deleted", "The post was taken down for everyone.", "success");
      resetAndCloseModal();
    } catch (error) {
      showAlert("Delete Failed", error instanceof Error ? error.message : "Try again.", "error");
    } finally {
      setActing(false);
    }
  }

  /** Hide the post from users while keeping it on the desk, or let it back
      out. The change saves at once; the composer stays open. */
  async function handleToggleHidden() {
    if (!editingId || acting) return;
    const next = !isPublished;
    if (!next) {
      const answer = await showAlert(
        "Hide this announcement?",
        "Users will stop seeing it, but it stays here on the desk. A post still waiting for its scheduled hour goes out at that hour unless the schedule is cleared.",
        "warning",
        { showCancelButton: true, confirmButtonText: "Hide", cancelButtonText: "Keep it visible" },
      );
      if (!answer.isConfirmed) return;
    }
    setActing(true);
    try {
      const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
      const response = await fetch(`${API_URL}/api/members/announcements/${editingId}/`, {
        method: "PATCH",
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ published: next }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.detail || "Could not change visibility.");
      }
      setIsPublished(next);
      onChanged?.();
      showAlert(next ? "Announcement Visible" : "Announcement Hidden", next ? "Users can see the post again." : "Users can no longer see the post; it stays on the desk.", "success", {
        toast: true,
        timer: 4000,
        showConfirmButton: false,
      });
    } catch (error) {
      showAlert("Not Changed", error instanceof Error ? error.message : "Try again.", "error");
    } finally {
      setActing(false);
    }
  }

  /**
   * The composer's buttons, standing at the end of the scrolling form rather
   * than in a fixed footer — they travel with the fields, so there is no
   * standing panel at the dialog's foot.
   *
   * The submit rides the form by its id, since it no longer sits inside it.
   * Editing adds the card's old Delete beside Hide — the card itself keeps
   * Edit only.
   */
  function renderComposerActions() {
    return (
      <div className={`flex shrink-0 items-center gap-3 ${editingId ? "justify-between" : "justify-end"}`}>
        {editingId ? (
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={submitting || acting}
              onClick={() => void handleDelete()}
              className="rounded-full border border-red-200 bg-white px-4 py-2.5 text-xs font-semibold text-red-700 transition hover:border-red-400 disabled:opacity-60"
            >
              Delete
            </button>
            <button
              type="button"
              disabled={submitting || acting}
              onClick={() => void handleToggleHidden()}
              className="rounded-full border border-sand-mute bg-white px-4 py-2.5 text-xs font-semibold text-moss transition hover:border-ember disabled:opacity-60"
            >
              {acting ? "Working..." : isPublished ? "Hide" : "Unhide"}
            </button>
          </div>
        ) : null}
        <div className="flex items-center gap-3">
          <button
            type="button"
            disabled={submitting || acting}
            onClick={resetAndCloseModal}
            className="rounded-full border border-sand-mute bg-white px-5 py-2.5 text-xs font-semibold text-moss transition hover:border-ember"
          >
            Cancel
          </button>
          <button
            type="submit"
            form={COMPOSER_FORM_ID}
            disabled={submitting || acting}
            className="rounded-full bg-sage px-6 py-2.5 text-xs font-bold text-white shadow-sm transition hover:bg-sage-deep disabled:opacity-60"
          >
            {submitting ? "Saving..." : editingId ? "Save Changes" : "Post Announcement"}
          </button>
        </div>
      </div>
    );
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
    // because no frame of ours is here to draw them, and they stand at the
    // end of the scrolling body so they move with the fields.
    return (
      <>
        {renderComposerFields()}
        <div className="mt-4">{renderComposerActions()}</div>
      </>
    );
  }

  // The board is gone: the desk's Sharing feed is the announcements
  // surface, and this component now supplies only the composer and the
  // thought modal its hosts open.
  return null;
}
