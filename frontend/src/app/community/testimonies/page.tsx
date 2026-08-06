"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

interface ApprovedTestimony {
  id: number;
  name: string;
  testimony_text: string;
  created_at: string;
}

export default function TestimoniesPage() {
  const [testimony, setTestimony] = useState("");
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [approvedTestimonies, setApprovedTestimonies] = useState<ApprovedTestimony[]>([]);

  useEffect(() => {
    const token = localStorage.getItem("access_token");
    setIsLoggedIn(Boolean(token));

    fetch(`${API_URL}/api/members/testimonies/`)
      .then((res) => (res.ok ? res.json() : []))
      .then(setApprovedTestimonies)
      .catch(() => setApprovedTestimonies([]));
  }, []);

  async function submitTestimony(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage("");

    const token = localStorage.getItem("access_token");
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    try {
      const response = await fetch(`${API_URL}/api/members/testimonies/`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          testimony_text: testimony,
          name: isLoggedIn ? "" : name,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(Object.values(errorData).flat().join(" ") || "Could not submit your testimony.");
      }

      setMessage("Thank you for sharing your testimony. Your testimony has been submitted for review by church leadership before being published.");
      setTestimony("");
      setName("");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "We could not submit your testimony. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#f7f4ee] px-6 pt-12 pb-10 text-[#26352f] sm:py-16">
      <div className="mx-auto max-w-3xl">
        <Link href="/community" className="text-sm font-semibold text-[#b36b3c] hover:underline">
          &larr; Community
        </Link>
        <h1 className="mt-6 text-3xl font-semibold tracking-tight sm:text-5xl">Testimonies</h1>
        <p className="mt-3 text-base leading-7 text-[#617068] sm:text-lg">
          Share how God has been working in your life to encourage and build up your church family.
        </p>

        <form onSubmit={submitTestimony} className="mt-8 rounded-3xl bg-white p-6 shadow-sm ring-1 ring-[#dfdbd1] sm:p-8">
          <h2 className="text-xl font-semibold sm:text-2xl">Share your testimony</h2>

          {!isLoggedIn && (
            <label className="mt-6 block text-sm font-medium">
              Your Name
              <input
                required
                maxLength={160}
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="mt-2 w-full rounded-xl border border-[#c9c5bb] px-4 py-3 outline-none focus:border-[#b36b3c]"
                placeholder="Enter your name"
              />
            </label>
          )}

          <div className="mt-5">
            <div className="flex items-center justify-between text-sm font-medium">
              <label htmlFor="testimony-text">Your Testimony</label>
              <span className={`text-xs ${testimony.length >= 900 ? "text-[#b36b3c] font-semibold" : "text-[#617068]"}`}>
                {testimony.length} / 1000 characters
              </span>
            </div>
            <textarea
              id="testimony-text"
              required
              maxLength={1000}
              rows={4}
              value={testimony}
              onChange={(event) => setTestimony(event.target.value)}
              className="mt-2 w-full rounded-xl border border-[#c9c5bb] px-4 py-3 outline-none focus:border-[#b36b3c]"
              placeholder="Tell us what God has done in your life..."
            />
          </div>

          <button
            disabled={loading}
            className="mt-6 w-full rounded-full bg-[#b36b3c] px-6 py-3.5 font-semibold text-white transition hover:bg-[#96552e] disabled:opacity-60"
          >
            {loading ? "Submitting testimony..." : "Submit testimony for review"}
          </button>

          {message && (
            <p className="mt-5 rounded-2xl bg-[#f7f4ee] p-4 text-sm leading-6 text-[#617068]">
              {message}
            </p>
          )}
        </form>

        {approvedTestimonies.length > 0 && (
          <section className="mt-12">
            <h2 className="text-2xl font-semibold">Church testimonies</h2>
            <div className="mt-6 space-y-5">
              {approvedTestimonies.map((item) => (
                <article key={item.id} className="rounded-2xl border border-[#dfdbd1] bg-white p-6 shadow-sm">
                  <p className="text-base leading-7 text-[#26352f]">&ldquo;{item.testimony_text}&rdquo;</p>
                  <footer className="mt-4 text-xs font-semibold text-[#b36b3c]">
                    — {item.name || "Church Member"}
                  </footer>
                </article>
              ))}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
