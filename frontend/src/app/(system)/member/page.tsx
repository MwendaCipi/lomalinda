"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { showAlert } from "@/lib/alerts";
import { kenyaCounties } from "@/config/kenya-counties";
import { MemberSidebar } from "@/components/sidebars/member-sidebar";
import { getPushState, PushSupport } from "@/lib/push";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";
type Contribution = { id: string; amount: string; currency: string; purpose: string; status: string; created_at: string };
type Details = { date_of_birth: string; county_of_birth: string; education_level: string; profession: string; residence: string; current_church: string };

export default function MemberPage() {
  const [contributions, setContributions] = useState<Contribution[]>([]);
  const [details, setDetails] = useState<Details | null>(null);
  const [token] = useState(() => typeof window !== "undefined" ? localStorage.getItem("access_token") : null);
  const [message, setMessage] = useState(token ? "Loading your giving history..." : "Sign in to view your giving history.");
  const [detailsMessage, setDetailsMessage] = useState("");
  const [savingDetails, setSavingDetails] = useState(false);
  const [announcePrefs, setAnnouncePrefs] = useState<{ email: boolean; push: boolean } | null>(null);
  const [pushSupport, setPushSupport] = useState<PushSupport | null>(null);
  const [prefMessage, setPrefMessage] = useState("");

  useEffect(() => {
    if (!token) return;
    const headers = { Authorization: `Bearer ${token}` };
    fetch(`${API_URL}/api/members/me/`, { headers })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) setAnnouncePrefs({ email: !!data.announce_email, push: !!data.announce_push });
      })
      .catch(() => {});
    getPushState().then(setPushSupport).catch(() => setPushSupport(null));
  }, [token]);

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
      fetch(`${API_URL}/api/members/contributions/`, { headers }),
      fetch(`${API_URL}/api/members/me/enrollment-details/`, { headers })
    ])
      .then(async ([contributionsResponse, detailsResponse]) => {
        if (!contributionsResponse.ok) throw new Error("Your session may have expired.");
        setContributions(await contributionsResponse.json());
        if (detailsResponse.ok) setDetails(await detailsResponse.json());
      })
      .then(() => setMessage(""))
      .catch((error) => setMessage(error.message));
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
    <main className="min-h-screen md:h-screen bg-sand text-bark md:overflow-hidden">
      <div className="flex h-full md:h-[calc(100vh-4rem)] md:overflow-hidden">
        <MemberSidebar />
        <div className="flex-1 min-w-0 h-full p-4 sm:p-8 lg:p-10 overflow-y-auto custom-hover-scrollbar">
          <div className="max-w-5xl mx-auto space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-ember">Member space</p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Your giving history</h1>
            </div>
            <Link href="/give" className="rounded-full bg-ember px-5 py-2.5 text-xs sm:text-sm font-semibold text-white hover:bg-ember-dark">
              Give now
            </Link>
          </div>

          <div className="mt-4 flex flex-wrap gap-4 text-xs sm:text-sm">
            <Link href="/member/reports" className="font-semibold text-ember">View church financial reports &rarr;</Link>
            <Link href="/community/welfare" className="font-semibold text-ember">Church welfare &rarr;</Link>
            <Link href="/announcements" className="font-semibold text-ember">Member announcements &rarr;</Link>
          </div>

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
                  <p className="mt-1 text-sm text-moss">{new Date(item.created_at).toLocaleDateString()}</p>
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
      </div>
    </main>
  );
}
