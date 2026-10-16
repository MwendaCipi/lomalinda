"use client";

import { useEffect, useState } from "react";
import { useHeaderData } from "@/hooks/use-header-data";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

/** One day's word, as the desk's endpoint reports it. */
export type DailyWord = {
  id: number;
  date: string;
  text: string;
  author_name: string;
};

/** How long an answer is trusted — the same minute the announcement feed gets. */
const WORD_TTL = 60 * 1000;

let cachedWord: { word: DailyWord | null; at: number } | null = null;
let inflight: Promise<DailyWord | null> | null = null;

function cacheIsFresh(): boolean {
  return Boolean(cachedWord && Date.now() - cachedWord.at < WORD_TTL);
}

async function loadWord(): Promise<DailyWord | null> {
  const token = typeof window === "undefined" ? null : localStorage.getItem("access_token");
  // Nothing to ask with, and nothing to show: the reader wants a session, and
  // a signed-out browser has no business reading the day's word.
  if (!token) return null;
  try {
    const res = await fetch(`${API_URL}/api/members/daily-word/`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { today?: DailyWord | null };
    return data.today ?? null;
  } catch {
    // Offline, or the server is restarting: the readers stay quiet rather than
    // showing yesterday's thought under today's name.
    return null;
  }
}

/** One request in the air, however many readers are waiting on it. */
function requestWord(): Promise<DailyWord | null> {
  if (inflight) return inflight;
  inflight = loadWord()
    .then((word) => {
      cachedWord = { word, at: Date.now() };
      return word;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

/**
 * Today's devotional thought, for the surfaces every member reads.
 *
 * The elders write one word a day and the whole church is meant to read it, so
 * the popup and the dashboard's card ask here rather than fetching it twice.
 * The answer is held for a minute — the life the chrome gives the announcement
 * feed — and a fresh thought lands on the next page load, the way a new
 * announcement does. The server's answer is the only thing this holds: a day
 * with no word written comes back empty, and the readers draw nothing.
 *
 * The signed-out case is derived rather than stored, so a member who signs out
 * mid-visit stops showing the word at once, without a call to clear anything.
 */
export function useDailyWord(): DailyWord | null {
  const { hasToken } = useHeaderData();
  const [word, setWord] = useState<DailyWord | null>(() => (cacheIsFresh() ? cachedWord!.word : null));

  useEffect(() => {
    if (!hasToken || cacheIsFresh()) return;
    let alive = true;
    void requestWord().then((next) => {
      if (alive) setWord(next);
    });
    return () => {
      alive = false;
    };
  }, [hasToken]);

  return hasToken ? word : null;
}
