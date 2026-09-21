"use client";

import { FormEvent, Suspense, useEffect, useState } from "react";
import { showAlert } from "@/lib/alerts";
import { RequestsSidebar } from "@/components/sidebars/requests-sidebar";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

type PrayerItem = {
  id: number;
  name?: string;
  anonymous?: boolean;
  request_text: string;
  created_at: string;
  status?: string;
};

function PrayerContent() {
  const [prayerRequests, setPrayerRequests] = useState<PrayerItem[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [requestText, setRequestText] = useState("");
  const [profileName, setProfileName] = useState("");
  const [optionalName, setOptionalName] = useState("");
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [anonymous, setAnonymous] = useState(false);

  const [loading, setLoading] = useState(false);
  const [fetchingList, setFetchingList] = useState(true);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const fetchRequests = async () => {
    setFetchingList(true);
    const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
    const headers: Record<string, string> = {};
    if (token) headers.Authorization = `Bearer ${token}`;

    try {
      const res = await fetch(`${API_URL}/api/members/prayer-requests/`, { headers });
      if (res.ok) {
        const data = await res.json();
        setPrayerRequests(Array.isArray(data) ? data : []);
      } else {
        setPrayerRequests([]);
      }
    } catch {
      setPrayerRequests([]);
    } finally {
      setFetchingList(false);
    }
  };

  useEffect(() => {
    fetchRequests();
    const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
    if (token) {
      setIsLoggedIn(true);
      fetch(`${API_URL}/api/members/me/`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data) {
            const name =
              data.full_name ||
              `${data.first_name || ""} ${data.last_name || ""}`.trim() ||
              data.name ||
              data.username ||
              "";
            setProfileName(name);
          }
        })
        .catch(() => {});
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function submitPrayerRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const token = localStorage.getItem("access_token");
    setLoading(true);
    setMessage(null);

    let isAnonymous = false;
    let senderName = "";

    if (isLoggedIn) {
      isAnonymous = anonymous;
      if (!isAnonymous && profileName) {
        senderName = profileName;
      }
    } else {
      if (optionalName.trim()) {
        isAnonymous = false;
        senderName = optionalName.trim();
      } else {
        isAnonymous = true;
      }
    }

    const body: Record<string, unknown> = {
      request_text: requestText,
      anonymous: isAnonymous,
    };
    if (senderName) {
      body.name = senderName;
    }

    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers.Authorization = `Bearer ${token}`;
      const response = await fetch(`${API_URL}/api/members/prayer-requests/`, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      });

      if (response.ok) {
        await response.json().catch(() => ({}));
        const text =
          "Your prayer request has been received. Our pastoral prayer team will pray with and for you.";
        setMessage({ type: "success", text });
        showAlert("Prayer Request Received", text, "success");
        setRequestText("");
        setOptionalName("");
        setAnonymous(false);
        setShowForm(false);
        fetchRequests();
      } else {
        const errorData = await response.json().catch(() => ({}));
        const text =
          errorData.detail || "We could not submit your prayer request. Please check the form.";
        setMessage({ type: "error", text });
        showAlert("Request Error", text, "error");
      }
    } catch {
      const text = "Network error. Please try again.";
      setMessage({ type: "error", text });
      showAlert("Network Error", text, "error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen md:h-screen bg-white text-[#26352f] md:overflow-hidden">
      <div className="flex h-full md:h-[calc(100vh-4rem)] md:overflow-hidden">
        <RequestsSidebar />
        <div className="flex-1 min-w-0 h-full md:h-[calc(100vh-4rem)] bg-white p-5 sm:p-8 lg:p-10 md:overflow-y-auto custom-hover-scrollbar">
          <div className="max-w-5xl mx-auto space-y-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Prayer Requests</h1>
                <p className="mt-1 text-sm text-[#617068]">
                  Share your burdens or praises with our prayer team. You can also view existing requests.
                </p>
              </div>
              {!showForm && (
                <button
                  type="button"
                  onClick={() => {
                    setShowForm(true);
                    setMessage(null);
                  }}
                  className="inline-flex shrink-0 items-center justify-center gap-2 rounded-full bg-[#b36b3c] px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-[#96552e]"
                >
                  + Submit Prayer Request
                </button>
              )}
            </div>

            {message && (
              <div
                className={`rounded-2xl p-4 text-sm font-medium ${
                  message.type === "success" ? "bg-[#eef2ed] text-[#26352f]" : "bg-red-50 text-red-700"
                }`}
              >
                {message.text}
              </div>
            )}

            {showForm && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm animate-in fade-in duration-150">
                <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-3xl border border-[#dfdbd1] bg-white p-6 shadow-2xl sm:p-8">
                  <div className="flex items-center justify-between border-b border-[#dfdbd1] pb-4 mb-6">
                    <h2 className="text-xl font-semibold text-[#26352f]">Submit a Prayer Request</h2>
                    <button
                      type="button"
                      onClick={() => setShowForm(false)}
                      className="rounded-lg p-1.5 text-[#617068] hover:bg-[#f7f4ee] hover:text-[#26352f] transition"
                    >
                      ✕
                    </button>
                  </div>

                  <form onSubmit={submitPrayerRequest} className="space-y-5">
                    {isLoggedIn && (
                      <label className="flex cursor-pointer items-center gap-3">
                        <div
                          role="checkbox"
                          aria-checked={anonymous}
                          tabIndex={0}
                          onClick={() => setAnonymous(!anonymous)}
                          onKeyDown={(e) => e.key === " " && setAnonymous(!anonymous)}
                          className={`relative h-6 w-11 rounded-full transition-colors ${
                            anonymous ? "bg-[#b36b3c]" : "bg-[#c9c5bb]"
                          }`}
                        >
                          <span
                            className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                              anonymous ? "translate-x-5" : "translate-x-0"
                            }`}
                          />
                        </div>
                        <span className="text-sm font-medium">Submit anonymously</span>
                      </label>
                    )}

                    {isLoggedIn && !anonymous && profileName && (
                      <p className="text-xs text-[#617068] bg-[#f7f4ee] rounded-xl px-4 py-2.5">
                        Submitting as{" "}
                        <span className="font-semibold text-[#26352f]">{profileName}</span>
                      </p>
                    )}

                    {!isLoggedIn && (
                      <div className="space-y-1.5">
                        <label className="block text-xs font-medium text-[#26352f]">
                          Your Name <span className="text-[#617068] font-normal">(optional &mdash; leave blank to submit anonymously)</span>
                          <input
                            type="text"
                            value={optionalName}
                            onChange={(e) => setOptionalName(e.target.value)}
                            placeholder="e.g. John Doe (or leave blank)"
                            className="mt-1 w-full rounded-xl border border-[#c9c5bb] px-4 py-2 text-sm outline-none focus:border-[#b36b3c]"
                          />
                        </label>
                      </div>
                    )}

                    <label className="block text-sm font-medium">
                      Your prayer request
                      <textarea
                        required
                        rows={5}
                        value={requestText}
                        onChange={(event) => setRequestText(event.target.value)}
                        className="mt-2 w-full rounded-xl border border-[#c9c5bb] px-4 py-3 outline-none focus:border-[#b36b3c]"
                        placeholder="Share what is on your heart..."
                      />
                    </label>

                    <div className="flex items-center gap-3">
                      <button
                        type="submit"
                        disabled={loading}
                        className="flex-1 rounded-full bg-[#b36b3c] px-6 py-3.5 font-semibold text-white transition hover:bg-[#96552e] disabled:opacity-60"
                      >
                        {loading ? "Sending..." : "Send Prayer Request"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowForm(false)}
                        className="rounded-full border border-[#c9c5bb] px-6 py-3.5 font-semibold text-[#26352f] transition hover:bg-[#f7f4ee]"
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}

            <section>
              {fetchingList ? (
                <div className="rounded-3xl border border-[#dfdbd1] bg-white p-8 text-center text-sm text-[#617068]">
                  Loading prayer requests...
                </div>
              ) : prayerRequests.length === 0 ? (
                <div className="rounded-3xl border border-dashed border-[#c9c5bb] bg-white p-8 sm:p-12 text-center">
                  <span className="text-4xl" aria-hidden="true">🙏</span>
                  <h3 className="mt-3 text-lg font-semibold text-[#26352f]">No prayer requests added yet</h3>
                  <p className="mt-1 text-sm text-[#617068]">
                    Be the first to submit a prayer request for our pastoral prayer team to pray with and for you.
                  </p>
                  <button
                    type="button"
                    onClick={() => setShowForm(true)}
                    className="mt-5 rounded-full bg-[#b36b3c] px-6 py-3 text-sm font-semibold text-white transition hover:bg-[#96552e]"
                  >
                    + Submit Prayer Request
                  </button>
                </div>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2">
                  {prayerRequests.map((item) => (
                    <div
                      key={item.id}
                      className="flex flex-col justify-between rounded-2xl border border-[#dfdbd1] bg-white p-5 shadow-sm space-y-3"
                    >
                      <div>
                        <div className="flex items-center justify-between text-xs text-[#617068]">
                          <span className="font-semibold text-[#b36b3c]">
                            {item.anonymous ? "Anonymous Request" : item.name || "Church Member"}
                          </span>
                          {item.created_at && (
                            <span>{new Date(item.created_at).toLocaleDateString()}</span>
                          )}
                        </div>
                        <p className="mt-2 text-sm leading-6 text-[#26352f]">{item.request_text}</p>
                      </div>
                      <div className="flex items-center justify-between text-xs text-[#617068] pt-2 border-t border-[#dfdbd1]">
                        <span>
                          Status:{" "}
                          <strong className="capitalize text-[#5f8067]">{item.status || "Received"}</strong>
                        </span>
                        <span>🙏 Praying</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <blockquote className="border-l-2 border-[#b36b3c] pl-6 text-lg leading-7 text-[#3d5148]">
              &ldquo;Prayer is the opening of the heart to God as to a friend.&rdquo;
              <footer className="mt-2 text-sm font-semibold text-[#b36b3c]">
                &mdash; Ellen G. White, <cite>Steps to Christ</cite>
              </footer>
            </blockquote>
          </div>
        </div>
      </div>
    </main>
  );
}

export default function CommunityPrayerPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-white px-6 py-16 text-center text-[#617068]">
          Loading prayer requests...
        </main>
      }
    >
      <PrayerContent />
    </Suspense>
  );
}
