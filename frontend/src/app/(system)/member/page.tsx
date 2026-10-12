"use client";

import Link from "next/link";
import { FormEvent, useEffect, useRef, useState } from "react";
import { showAlert } from "@/lib/alerts";
import { dayFirstTime } from "@/lib/dates";
import { kenyaCounties } from "@/config/kenya-counties";
import { getPushState, PushSupport } from "@/lib/push";
import { useAccessibility } from "@/context/accessibility-context";
import type { ThemeChoice } from "@/lib/theme";
import { offlineFetch } from "@/lib/offline-fetch";
import { OfflineBanner } from "@/components/offline-banner";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";
type Contribution = { id: string; amount: string; currency: string; purpose: string; status: string; created_at: string };
type Details = { date_of_birth: string; county_of_birth: string; education_level: string; profession: string; residence: string; current_church: string };

/** One person this member is related to, as the profile keeps it: an
    account when the roll found them, a name alone otherwise. */
type DeclaredRelationship = { person_id?: number | null; name: string; relationship: string };

/** The church's short list — anything rarer is Other. */
const RELATIONSHIP_CHOICES = [
  { value: "spouse", label: "Spouse" },
  { value: "sibling", label: "Sibling" },
  { value: "child", label: "Child" },
  { value: "friend", label: "Friend" },
  { value: "other", label: "Other" },
];

export default function MemberPage() {
  const { theme, setTheme } = useAccessibility();
  const [contributions, setContributions] = useState<Contribution[]>([]);
  const [details, setDetails] = useState<Details | null>(null);
  const [token] = useState(() => typeof window !== "undefined" ? localStorage.getItem("access_token") : null);
  const [message, setMessage] = useState(token ? "Loading your giving history..." : "Sign in to view your giving history.");
  const [detailsMessage, setDetailsMessage] = useState("");
  const [savingDetails, setSavingDetails] = useState(false);
  const [announcePrefs, setAnnouncePrefs] = useState<{ email: boolean; push: boolean } | null>(null);
  const [pushSupport, setPushSupport] = useState<PushSupport | null>(null);
  const [prefMessage, setPrefMessage] = useState("");
  const [isOffline, setIsOffline] = useState(false);
  const [cachedAt, setCachedAt] = useState<Date | null>(null);

  // The contact line: the member's own to change, same validation the
  // office edit gets — no appointment needed to say the number moved.
  const [phone, setPhone] = useState("");
  const [phoneSaving, setPhoneSaving] = useState(false);
  const [phoneMessage, setPhoneMessage] = useState("");

  // The people this member gives for or asks to give: declared here once,
  // read by the giving form instead of being asked on every gift.
  const [relationships, setRelationships] = useState<DeclaredRelationship[]>([]);
  const [relSaving, setRelSaving] = useState(false);
  const [relMessage, setRelMessage] = useState("");
  const [relQuery, setRelQuery] = useState("");
  const [relMatches, setRelMatches] = useState<{ id: number; name: string }[]>([]);
  const [pickedForAdd, setPickedForAdd] = useState<{ id?: number; name: string } | null>(null);
  const [newRelationship, setNewRelationship] = useState("");

  useEffect(() => {
    if (!token) return;
    const headers = { Authorization: `Bearer ${token}` };
    fetch(`${API_URL}/api/members/me/`, { headers })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) {
          setAnnouncePrefs({ email: !!data.announce_email, push: !!data.announce_push });
          setPhone(data.phone_number || "");
          setRelationships(Array.isArray(data.declared_relationships) ? data.declared_relationships : []);
        }
      })
      .catch(() => {});
    getPushState().then(setPushSupport).catch(() => setPushSupport(null));
  }, [token]);

  async function savePhone(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return;
    setPhoneSaving(true);
    setPhoneMessage("");
    try {
      const response = await fetch(`${API_URL}/api/members/me/`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ phone_number: phone.trim() }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        // The API names the field it refused — read it back verbatim.
        throw new Error(data?.phone_number || data?.detail || "Your phone number could not be saved.");
      }
      setPhone(data?.phone_number ?? phone.trim());
      const successMsg = "Your phone number has been saved.";
      setPhoneMessage(successMsg);
      showAlert("Phone number saved", successMsg, "success");
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Your phone number could not be saved.";
      setPhoneMessage(errorMsg);
      showAlert("Not saved", errorMsg, "error");
    } finally {
      setPhoneSaving(false);
    }
  }

  /** Debounced roll search while adding a person: a keystroke schedules the
      lookup, the previous one is cancelled, and nothing sets state until the
      answer lands. */
  const relSearchTimer = useRef<number | null>(null);
  const searchPersonToAdd = (raw: string) => {
    setRelQuery(raw);
    setPickedForAdd(null);
    if (relSearchTimer.current) window.clearTimeout(relSearchTimer.current);
    const query = raw.trim();
    if (query.length < 2) {
      setRelMatches([]);
      return;
    }
    relSearchTimer.current = window.setTimeout(() => {
      fetch(`${API_URL}/api/members/lookup/names/?q=${encodeURIComponent(query)}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => setRelMatches(Array.isArray(data?.matches) ? data.matches : []))
        .catch(() => setRelMatches([]));
    }, 250);
  };

  const addRelationship = () => {
    const person = pickedForAdd || (relQuery.trim() ? { name: relQuery.trim() } : null);
    if (!person) {
      showAlert("Name needed", "Type a name, or pick the person from the list as you type.", "warning");
      return;
    }
    if (!newRelationship) {
      showAlert("Relationship needed", "Say how this person relates to you — spouse, sibling, child, friend or other.", "warning");
      return;
    }
    const already = relationships.some((row) =>
      person.id && row.person_id ? row.person_id === person.id : (row.name || "").trim().toLowerCase() === person.name.trim().toLowerCase()
    );
    if (already) {
      showAlert("Already listed", "This person is already among your relationships.", "warning");
      return;
    }
    setRelationships([...relationships, { person_id: person.id ?? null, name: person.name, relationship: newRelationship }]);
    setRelQuery("");
    setRelMatches([]);
    setPickedForAdd(null);
    setNewRelationship("");
    setRelMessage("");
  };

  async function saveRelationships() {
    if (!token) return;
    setRelSaving(true);
    setRelMessage("");
    try {
      const response = await fetch(`${API_URL}/api/members/me/`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ declared_relationships: relationships }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(data?.declared_relationships || data?.detail || "Your relationships could not be saved.");
      }
      setRelationships(Array.isArray(data?.declared_relationships) ? data.declared_relationships : relationships);
      const successMsg = "Your relationships have been saved.";
      setRelMessage(successMsg);
      showAlert("Relationships saved", successMsg, "success");
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Your relationships could not be saved.";
      setRelMessage(errorMsg);
      showAlert("Not saved", errorMsg, "error");
    } finally {
      setRelSaving(false);
    }
  }

  async function saveAnnouncePref(field: "email" | "push", value: boolean) {
    if (!announcePrefs) return;
    const previous = announcePrefs;
    setAnnouncePrefs({ ...announcePrefs, [field]: value });
    setPrefMessage("");
    try {
      const response = await fetch(`${API_URL}/api/members/me/`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(field === "email" ? { announce_email: value } : { announce_push: value }),
      });
      if (!response.ok) throw new Error();
      setPrefMessage("Preference saved.");
    } catch {
      setAnnouncePrefs(previous);
      showAlert("Not saved", "Your preference could not be saved. Try again.", "error");
    }
  }

  useEffect(() => {
    if (!token) return;
    const headers = { Authorization: `Bearer ${token}` };
    Promise.all([
      offlineFetch<Contribution[]>(`${API_URL}/api/members/contributions/`, { headers }),
      offlineFetch<Details>(`${API_URL}/api/members/me/enrollment-details/`, { headers }),
    ]).then(([contribResult, detailsResult]) => {
      if (contribResult.status === 401 || contribResult.status === 403) {
        setMessage("Your session may have expired.");
        return;
      }
      if (contribResult.ok && contribResult.data) {
        setContributions(contribResult.data);
        setMessage("");
      } else if (contribResult.error === "offline" && !contribResult.data) {
        setMessage("You're offline and this page hasn't been loaded before. Connect to see your giving history.");
        return;
      } else if (!contribResult.ok) {
        setMessage("Could not load your giving history.");
      }
      /* Show offline banner if either response came from SW cache. */
      const offline = contribResult.isOffline || detailsResult.isOffline;
      setIsOffline(offline);
      if (offline) setCachedAt(contribResult.cachedAt ?? detailsResult.cachedAt);
      if (detailsResult.ok && detailsResult.data) setDetails(detailsResult.data);
    });
  }, [token]);

  async function saveDetails(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !details) return;
    setSavingDetails(true);
    setDetailsMessage("");
    try {
      const response = await fetch(`${API_URL}/api/members/me/enrollment-details/`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(details)
      });
      if (!response.ok) throw new Error("Unable to save your details.");
      setDetails(await response.json());
      const successMsg = "Your additional details have been saved.";
      setDetailsMessage(successMsg);
      showAlert("Details Saved", successMsg, "success");
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Unable to save your details.";
      setDetailsMessage(errorMsg);
      showAlert("Error", errorMsg, "error");
    } finally {
      setSavingDetails(false);
    }
  }

  return (
    <main className="min-h-full bg-sand text-bark">
      <div className="p-4 sm:p-8 lg:p-10">
        <div className="mx-auto max-w-5xl space-y-6">
            <div className="flex flex-wrap items-center justify-end gap-4">
            <Link href="/give" className="rounded-full bg-ember px-5 py-2.5 text-xs sm:text-sm font-semibold text-white hover:bg-ember-dark">
              Give now
            </Link>
          </div>

          <div className="mt-4 flex flex-wrap gap-4 text-xs sm:text-sm">
            <Link href="/member/reports" className="font-semibold text-ember">View church financial reports &rarr;</Link>
            <Link href="/community/welfare" className="font-semibold text-ember">Church welfare &rarr;</Link>
            <Link href="/announcements" className="font-semibold text-ember">Member announcements &rarr;</Link>
          </div>

          <OfflineBanner isOffline={isOffline} cachedAt={cachedAt} className="mt-4" />

          <form onSubmit={savePhone} className="mt-8 rounded-3xl bg-white p-6 shadow-sm ring-1 ring-sand-line">
            <h2 className="text-xl font-semibold">Phone number</h2>
            <p className="mt-2 text-sm leading-6 text-moss">
              The number the church reaches you on, and the one M-Pesa prompts when you give.
              A member in our system receives their letters on their account address; this is the line for everything else.
            </p>
            <label className="mt-5 block text-sm font-medium">
              Phone number
              <input
                type="tel"
                inputMode="numeric"
                maxLength={12}
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                placeholder="e.g. 0712345678"
                className="mt-1.5 w-full max-w-sm rounded-xl border border-sand-mute px-4 py-2.5"
              />
            </label>
            <button disabled={phoneSaving} className="mt-5 rounded-full bg-sage px-5 py-3 text-sm font-semibold text-white disabled:opacity-60">
              {phoneSaving ? "Saving..." : "Save phone number"}
            </button>
            {phoneMessage && <p className="mt-3 text-sm text-moss">{phoneMessage}</p>}
          </form>

          <section className="mt-8 rounded-3xl bg-white p-6 shadow-sm ring-1 ring-sand-line">
            <h2 className="text-xl font-semibold">Relationships</h2>
            <p className="mt-2 text-sm leading-6 text-moss">
              How the people you give for — or ask to give — relate to you. Set them once here and the
              giving form reads them, so no gift asks you the same question again. Anything not listed
              is recorded as Other.
            </p>

            {relationships.length > 0 ? (
              <ul className="mt-5 space-y-3">
                {relationships.map((row, index) => (
                  <li key={`${row.person_id ?? "name"}-${row.name}-${index}`} className="flex flex-wrap items-center gap-3 rounded-2xl bg-sand px-4 py-3">
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                      {row.name}
                      {!row.person_id && <span className="ml-2 text-xs font-normal text-moss">not on the roll</span>}
                    </span>
                    <select
                      value={row.relationship}
                      onChange={(event) => {
                        const next = [...relationships];
                        next[index] = { ...row, relationship: event.target.value };
                        setRelationships(next);
                        setRelMessage("");
                      }}
                      className="rounded-xl border border-sand-mute bg-white px-3 py-2 text-sm outline-none focus:border-ember"
                    >
                      {RELATIONSHIP_CHOICES.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => {
                        setRelationships(relationships.filter((_, i) => i !== index));
                        setRelMessage("");
                      }}
                      aria-label={`Remove ${row.name}`}
                      className="rounded-lg p-1.5 text-moss transition hover:text-ember"
                    >
                      &times;
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-5 rounded-2xl bg-sand px-4 py-3 text-sm text-moss">No relationships yet — add the first below.</p>
            )}

            <div className="mt-5 rounded-2xl border border-sand-line p-4">
              <p className="mb-2 text-sm font-medium">Add a person</p>
              <div className="relative">
                <input
                  type="text"
                  value={pickedForAdd ? pickedForAdd.name : relQuery}
                  onChange={(event) => searchPersonToAdd(event.target.value)}
                  placeholder="Type a name from the church roll…"
                  className="w-full rounded-xl border border-sand-mute px-4 py-2.5 text-sm outline-none focus:border-ember"
                />
                {!pickedForAdd && relMatches.length > 0 && (
                  <div className="absolute left-0 right-0 top-full z-20 mt-1.5 max-h-52 overflow-y-auto rounded-2xl border border-sand-line bg-white p-2 shadow-xl">
                    {relMatches.map((person) => (
                      <button
                        key={person.id}
                        type="button"
                        onClick={() => {
                          setPickedForAdd(person);
                          setRelQuery(person.name);
                          setRelMatches([]);
                        }}
                        className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm text-moss-dark transition hover:bg-sand hover:text-bark"
                      >
                        <span className="min-w-0 truncate">{person.name}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <select
                  value={newRelationship}
                  onChange={(event) => setNewRelationship(event.target.value)}
                  className="rounded-xl border border-sand-mute bg-white px-3 py-2.5 text-sm outline-none focus:border-ember"
                >
                  <option value="">How do they relate?</option>
                  {RELATIONSHIP_CHOICES.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={addRelationship}
                  className="rounded-full bg-bark px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-ember"
                >
                  Add
                </button>
                {!pickedForAdd && relQuery.trim().length >= 2 && relMatches.length === 0 && (
                  <span className="text-xs text-moss">No match — Add writes the name as typed.</span>
                )}
              </div>
            </div>

            <button
              type="button"
              disabled={relSaving}
              onClick={saveRelationships}
              className="mt-5 rounded-full bg-sage px-5 py-3 text-sm font-semibold text-white disabled:opacity-60"
            >
              {relSaving ? "Saving..." : "Save relationships"}
            </button>
            {relMessage && <p className="mt-3 text-sm text-moss">{relMessage}</p>}
          </section>

          {details && (
            <form onSubmit={saveDetails} className="mt-8 rounded-3xl bg-white p-6 shadow-sm ring-1 ring-sand-line">
              <h2 className="text-xl font-semibold">Additional church details</h2>
              <p className="mt-2 text-sm leading-6 text-moss">
                Complete these details when convenient. A church official may also update them, and your national ID will be collected and verified by an official later.
              </p>
              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <label className="block text-sm font-medium">
                  Date of birth
                  <input type="date" value={details.date_of_birth || ""} onChange={(event) => setDetails({ ...details, date_of_birth: event.target.value })} className="mt-1.5 w-full rounded-xl border border-sand-mute px-4 py-2.5" />
                </label>
                <label className="block text-sm font-medium">
                  County of birth
                  <select value={details.county_of_birth || ""} onChange={(event) => setDetails({ ...details, county_of_birth: event.target.value })} className="mt-1.5 w-full rounded-xl border border-sand-mute px-4 py-2.5">
                    <option value="">Select county</option>
                    {kenyaCounties.map((county) => <option key={county} value={county}>{county}</option>)}
                  </select>
                </label>
                <label className="block text-sm font-medium">
                  Level of education
                  <input value={details.education_level || ""} onChange={(event) => setDetails({ ...details, education_level: event.target.value })} className="mt-1.5 w-full rounded-xl border border-sand-mute px-4 py-2.5" />
                </label>
                <label className="block text-sm font-medium">
                  Profession
                  <input value={details.profession || ""} onChange={(event) => setDetails({ ...details, profession: event.target.value })} className="mt-1.5 w-full rounded-xl border border-sand-mute px-4 py-2.5" />
                </label>
                <label className="block text-sm font-medium">
                  Residence
                  <input value={details.residence || ""} placeholder="Estate, street or town" onChange={(event) => setDetails({ ...details, residence: event.target.value })} className="mt-1.5 w-full rounded-xl border border-sand-mute px-4 py-2.5" />
                </label>
                {details.current_church !== undefined && (
                  <label className="block text-sm font-medium sm:col-span-2">
                    Current church
                    <input value={details.current_church || ""} onChange={(event) => setDetails({ ...details, current_church: event.target.value })} className="mt-1.5 w-full rounded-xl border border-sand-mute px-4 py-2.5" />
                  </label>
                )}
              </div>
              <button disabled={savingDetails} className="mt-5 rounded-full bg-sage px-5 py-3 text-sm font-semibold text-white disabled:opacity-60">
                {savingDetails ? "Saving..." : "Save details"}
              </button>
              {detailsMessage && <p className="mt-3 text-sm text-moss">{detailsMessage}</p>}
            </form>
          )}

          <section className="mt-8 rounded-3xl bg-white p-6 shadow-sm ring-1 ring-sand-line">
            <h2 className="text-xl font-semibold">Appearance</h2>
            <p className="mt-2 text-sm leading-6 text-moss">
              How the app is lit. <strong>System</strong> follows your device and keeps following it
              as the device switches between light and dark; Light and Dark hold the app still
              whatever the device does. Resetting the display defaults returns you to System.
            </p>
            <div className="mt-5 grid grid-cols-3 gap-2 sm:max-w-md">
              {(["system", "light", "dark"] as ThemeChoice[]).map((choice) => (
                <button
                  key={choice}
                  type="button"
                  onClick={() => setTheme(choice)}
                  aria-pressed={theme === choice}
                  className={`rounded-xl py-2 text-sm font-semibold capitalize transition ${
                    theme === choice
                      ? "bg-bark text-white shadow-sm"
                      : "border border-sand-line bg-white text-moss hover:border-ember hover:text-bark"
                  }`}
                >
                  {choice}
                </button>
              ))}
            </div>
          </section>

          {announcePrefs && (
            <section className="mt-8 rounded-3xl bg-white p-6 shadow-sm ring-1 ring-sand-line">
              <h2 className="text-xl font-semibold">Notification preferences</h2>
              <p className="mt-2 text-sm leading-6 text-moss">
                Choose how announcements reach you. Requests waiting for the office always notify, whatever you switch off here.
              </p>
              <div className="mt-5 space-y-3">
                <label className="flex items-center justify-between gap-4 rounded-2xl bg-sand px-4 py-3 text-sm font-medium cursor-pointer">
                  <span>
                    Announcements by email
                    <span className="block text-xs font-normal text-moss">The broadcast letters, not receipts — those always come.</span>
                  </span>
                  <input
                    type="checkbox"
                    checked={announcePrefs.email}
                    onChange={(e) => saveAnnouncePref("email", e.target.checked)}
                    className="h-4 w-4 shrink-0 accent-sage"
                  />
                </label>
                {pushSupport?.supported ? (
                  <label className="flex items-center justify-between gap-4 rounded-2xl bg-sand px-4 py-3 text-sm font-medium cursor-pointer">
                    <span>
                      Announcements as notifications
                      <span className="block text-xs font-normal text-moss">A notification on this device when an announcement is posted.</span>
                    </span>
                    <input
                      type="checkbox"
                      checked={announcePrefs.push}
                      onChange={(e) => saveAnnouncePref("push", e.target.checked)}
                      className="h-4 w-4 shrink-0 accent-sage"
                    />
                  </label>
                ) : (
                  <div className="rounded-2xl bg-sand px-4 py-3 text-sm font-medium">
                    Announcements as notifications
                    <span className="mt-0.5 block text-xs font-normal text-moss">
                      Not available in this browser. On iPhone, add the app to your Home Screen first.
                    </span>
                  </div>
                )}
              </div>
              {pushSupport?.supported && !pushSupport.enabled && announcePrefs.push && (
                <p className="mt-3 text-xs text-moss">
                  To receive them on <em>this</em> device, also tap <strong>Turn on notifications</strong> in the bell at the top of the page — that grants the browser permission.
                </p>
              )}
              {prefMessage && <p className="mt-3 text-sm text-moss">{prefMessage}</p>}
            </section>
          )}

          <div className="mt-8 space-y-4">
            {contributions.map((item) => (
              <article key={item.id} className="flex flex-col gap-3 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-sand-line sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-semibold">{item.purpose}</p>
                  <p className="mt-1 text-sm text-moss">{dayFirstTime(item.created_at)}</p>
                </div>
                <div className="sm:text-right">
                  <p className="text-xl font-semibold">{item.currency} {Number(item.amount).toLocaleString()}</p>
                  <p className="mt-1 text-sm capitalize text-moss">{item.status}</p>
                </div>
              </article>
            ))}
            {message && (
              <div className="rounded-2xl bg-white p-6 text-moss shadow-sm ring-1 ring-sand-line">
                {message} {message.includes("Sign in") && <Link href="/login" className="font-semibold text-ember">Sign in &rarr;</Link>}
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
