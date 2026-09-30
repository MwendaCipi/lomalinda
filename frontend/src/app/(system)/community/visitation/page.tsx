"use client";

import { useEffect, useState } from "react";
import { Home } from "lucide-react";

import { VisitationRequestCard, VisitationRequestForm, type VisitationItem } from "@/components/requests-forms";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

/**
 * Visitation Requests — the member's visitation desk and its ledger.
 *
 * The other half of the old combined prayer & visitation page: its own form
 * (with the map pin for where to come), its own list, and the strip above
 * naming Prayer as the sibling. Everything above the action bar scrolls; the
 * bar with the count and the button holds still.
 */
export default function VisitationRequestsPage() {
  const [visitations, setVisitations] = useState<VisitationItem[]>([]);
  const [fetchingList, setFetchingList] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const fetchAll = async () => {
    setFetchingList(true);
    const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
    const headers: Record<string, string> = {};
    if (token) headers.Authorization = `Bearer ${token}`;

    try {
      const res = await fetch(`${API_URL}/api/members/visitations/`, { headers });
      const data = res.ok ? await res.json().catch(() => []) : [];
      setVisitations(Array.isArray(data) ? data : []);
    } catch {
      setVisitations([]);
    }
    setFetchingList(false);
  };

  useEffect(() => {
    void Promise.resolve().then(fetchAll);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main className="min-h-screen md:h-screen bg-white text-bark md:overflow-hidden">
      <div className="flex h-full md:h-full md:overflow-hidden">
        <div className="flex h-full min-w-0 flex-1 flex-col md:overflow-hidden">
          <div className="min-h-0 flex-1 overflow-y-auto custom-hover-scrollbar">
            <div className="mx-auto max-w-5xl space-y-6 px-5 py-6 sm:px-8 sm:py-8 lg:px-10">
              <div>
                <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Visitation Requests</h1>
                <p className="mt-1 text-sm text-moss">
                  Ask for a pastoral, home or hospital visit — pin where to come on the map in the form.
                </p>
              </div>

              {message && (
                <div
                  className={`rounded-2xl p-4 text-sm font-medium ${
                    message.type === "success" ? "bg-mist-select text-bark" : "bg-red-50 text-red-700"
                  }`}
                >
                  {message.text}
                </div>
              )}

              {fetchingList ? (
                <div className="rounded-3xl border border-sand-line bg-white p-8 text-center text-sm text-moss">
                  Loading requests...
                </div>
              ) : visitations.length === 0 ? (
                <div className="rounded-3xl border border-dashed border-sand-mute bg-white p-8 text-center sm:p-12">
                  <Home size={36} className="text-moss-faint" aria-hidden="true" />
                  <h3 className="mt-3 text-lg font-semibold text-bark">No visitation requests yet</h3>
                  <p className="mt-1 text-sm text-moss">
                    Use the button below to arrange the first visit.
                  </p>
                </div>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2">
                  {visitations.map((item) => (
                    <VisitationRequestCard key={item.id} item={item} />
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* The action bar: the only part of the page that holds still. */}
          <div className="sticky bottom-0 z-10 border-t border-sand-line bg-white/95 px-5 py-3 backdrop-blur">
            <div className="mx-auto flex max-w-5xl items-center justify-between gap-3">
              <p className="min-w-0 truncate text-xs text-moss">
                {fetchingList
                  ? "Loading..."
                  : `${visitations.length} request${visitations.length === 1 ? "" : "s"}`}
              </p>
              <button
                type="button"
                onClick={() => setShowForm(true)}
                className="inline-flex shrink-0 items-center justify-center gap-2 rounded-full bg-sage px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-sage-deep"
              >
                Request Visitation
              </button>
            </div>
          </div>
        </div>
      </div>

      {showForm && (
        <VisitationRequestForm
          onClose={() => setShowForm(false)}
          onSuccess={(text) => {
            setMessage({ type: "success", text });
            setShowForm(false);
            fetchAll();
          }}
        />
      )}
    </main>
  );
}
