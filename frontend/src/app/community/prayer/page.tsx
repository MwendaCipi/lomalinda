"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { showAlert } from "@/lib/alerts";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export default function CommunityPrayerPage() {
  const [requestText, setRequestText] = useState("");
  const [name, setName] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [anonymous, setAnonymous] = useState(false);
  const [message, setMessage] = useState("");

  async function submitRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body: Record<string, unknown> = { request_text: requestText, anonymous };
    if (!anonymous) {
      if (name) body.name = name;
      if (phoneNumber) body.phone_number = phoneNumber;
    }
    const response = await fetch(`${API_URL}/api/members/prayer-requests/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const text = response.ok ? "Your prayer request has been received. We will pray with you." : "We could not submit your request. Please try again.";
    setMessage(text); showAlert(response.ok ? "Prayer request received" : "Request error", text, response.ok ? "success" : "error");
    if (response.ok) { setRequestText(""); setName(""); setPhoneNumber(""); }
  }

  return (
    <main className="min-h-screen bg-[#f7f4ee] px-6 pt-10 pb-8 text-[#26352f] sm:py-12">
      <div className="mx-auto max-w-3xl">
        <Link href="/requests" className="inline-flex items-center gap-2 text-sm font-semibold text-[#b36b3c] transition hover:text-[#96552e]">
          <span>&larr;</span>
          <span>Back to Requests</span>
        </Link>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight sm:text-5xl">Prayer</h1>
        <p className="mt-3 text-lg leading-8 text-[#617068]">You do not have to carry it alone.</p>
        <form onSubmit={submitRequest} className="mt-5 rounded-3xl bg-white p-5 shadow-sm ring-1 ring-[#dfdbd1] sm:p-7">
          {/* Anonymous toggle */}
          <label className="flex cursor-pointer items-center gap-3 mb-5">
            <div
              role="checkbox"
              aria-checked={anonymous}
              tabIndex={0}
              onClick={() => setAnonymous(!anonymous)}
              onKeyDown={(e) => e.key === " " && setAnonymous(!anonymous)}
              className={`relative h-6 w-11 rounded-full transition-colors ${anonymous ? "bg-[#b36b3c]" : "bg-[#c9c5bb]"}`}
            >
              <span className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${anonymous ? "translate-x-5" : "translate-x-0"}`} />
            </div>
            <span className="text-sm font-medium">Submit anonymously</span>
          </label>

          {/* Name & phone — hidden when anonymous */}
          {!anonymous && (
            <div className="mb-5 grid gap-4 sm:grid-cols-2">
              <label className="block text-sm font-medium">
                Your name
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="mt-1.5 w-full rounded-xl border border-[#c9c5bb] px-4 py-2.5 outline-none focus:border-[#b36b3c]"
                  placeholder="Optional"
                />
              </label>
              <label className="block text-sm font-medium">
                Phone number
                <input
                  type="tel"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  className="mt-1.5 w-full rounded-xl border border-[#c9c5bb] px-4 py-2.5 outline-none focus:border-[#b36b3c]"
                  placeholder="07XX XXX XXX"
                />
              </label>
            </div>
          )}

          <label className="block text-sm font-medium">
            Your prayer request
            <textarea
              required
              rows={4}
              value={requestText}
              onChange={(event) => setRequestText(event.target.value)}
              className="mt-2 w-full rounded-xl border border-[#c9c5bb] px-4 py-3 outline-none focus:border-[#b36b3c]"
              placeholder="Share what is on your heart..."
            />
          </label>
          <button className="mt-4 w-full rounded-full bg-[#b36b3c] px-6 py-3 font-semibold text-white transition hover:bg-[#96552e]">
            Send prayer request
          </button>
          {message && <p className="mt-4 rounded-xl bg-[#eef2ed] p-4 text-sm">{message}</p>}
        </form>
        <blockquote className="mt-6 border-l-2 border-[#b36b3c] pl-6 text-lg leading-7 text-[#3d5148]">
          "Prayer is the opening of the heart to God as to a friend."
          <footer className="mt-2 text-sm font-semibold text-[#b36b3c]">
            — Ellen G. White, <cite>Steps to Christ</cite>
          </footer>
        </blockquote>
      </div>
    </main>
  );
}
