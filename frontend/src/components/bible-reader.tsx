"use client";

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

/**
 * The Bible, read in the app.
 *
 * The church pointed this shelf at other people's websites. Those sites go
 * down, put a reader behind a sign-in, or answer a phone on a poor connection
 * with nothing at all — and a Bible a member cannot open during a lesson is
 * worse than no shelf. The text now ships with the app: 66 books, one JSON file
 * each under `public/bible/`, fetched only when that book is opened.
 *
 * The translation is the World English Bible (Updated), which its publisher
 * eBible.org dedicates to the public domain — the reason this copy can live in
 * the app at all. Every modern translation a church might prefer is licensed,
 * and a licensed text cannot be bundled.
 *
 * The address carries the passage (`?book=john&chapter=3`), like the hymnbooks,
 * so a lesson leader can send one chapter instead of describing how to find it.
 * It is read through `useSyncExternalStore` because this page is a static
 * export and the query only exists after a real visit.
 */

type BookMeta = {
  slug: string;
  name: string;
  testament: "old" | "new";
  chapters: number;
};

type BibleIndex = {
  translation: string;
  abbreviation: string;
  licence: string;
  source: string;
  books: BookMeta[];
};

type Verse = { v: number; t: string };

type BookText = {
  name: string;
  slug: string;
  testament: "old" | "new";
  /** Index 0 is chapter 1. */
  chapters: Verse[][];
};

const BOOK_PARAM = "book";
const CHAPTER_PARAM = "chapter";
const ADDRESS_EVENT = "bible:address-changed";

/** The passage as the address names it: `book|chapter`. */
function readAddress() {
  if (typeof window === "undefined") return "";
  const params = new URLSearchParams(window.location.search);
  return `${params.get(BOOK_PARAM) ?? ""}|${params.get(CHAPTER_PARAM) ?? ""}`;
}

function subscribeAddress(onChange: () => void) {
  window.addEventListener("popstate", onChange);
  window.addEventListener(ADDRESS_EVENT, onChange);
  return () => {
    window.removeEventListener("popstate", onChange);
    window.removeEventListener(ADDRESS_EVENT, onChange);
  };
}

/** Puts the passage in the address without adding a history entry. */
function writeAddress(book: string, chapter: number) {
  const url = new URL(window.location.href);
  url.searchParams.set(BOOK_PARAM, book);
  url.searchParams.set(CHAPTER_PARAM, String(chapter));
  window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  window.dispatchEvent(new Event(ADDRESS_EVENT));
}

export function BibleReader() {
  const [index, setIndex] = useState<BibleIndex | null>(null);
  const [failed, setFailed] = useState(false);
  const [text, setText] = useState<BookText | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/bible/index.json")
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error("index"))))
      .then((data: BibleIndex) => {
        if (alive) setIndex(data);
      })
      .catch(() => {
        if (alive) setFailed(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  const address = useSyncExternalStore(subscribeAddress, readAddress, () => "");
  const [linkedBook, linkedChapter] = address.split("|");

  // A link naming a book this Bible does not have falls back to the beginning
  // rather than to an empty page.
  const book = useMemo(
    () => index?.books.find((entry) => entry.slug === linkedBook) ?? index?.books[0] ?? null,
    [index, linkedBook],
  );
  const chapter = useMemo(() => {
    const wanted = Number.parseInt(linkedChapter, 10);
    if (!book) return 1;
    return Number.isFinite(wanted) && wanted >= 1 && wanted <= book.chapters ? wanted : 1;
  }, [book, linkedChapter]);

  useEffect(() => {
    if (!book) return;
    let alive = true;
    fetch(`/bible/${book.slug}.json`)
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error("book"))))
      .then((data: BookText) => {
        if (!alive) return;
        setText(data);
        setFailed(false);
      })
      .catch(() => {
        if (alive) setFailed(true);
      });
    return () => {
      alive = false;
    };
  }, [book]);

  const go = useCallback((slug: string, number: number) => writeAddress(slug, number), []);

  const verses = text && book && text.slug === book.slug ? text.chapters[chapter - 1] ?? null : null;
  const oldTestament = index?.books.filter((entry) => entry.testament === "old") ?? [];
  const newTestament = index?.books.filter((entry) => entry.testament === "new") ?? [];

  return (
    <div className="space-y-4">
      {/* The passage picker. Two selects rather than a shelf of 66 books: a
          lesson calls out "John 3" and the reader should answer in two taps. */}
      <div className="flex flex-wrap items-end gap-2 rounded-2xl border border-sand-line bg-white p-3 shadow-sm">
        <label className="min-w-0 flex-1 basis-40 text-[11px] font-semibold text-moss">
          Book
          <select
            value={book?.slug ?? ""}
            onChange={(event) => go(event.target.value, 1)}
            disabled={!index}
            className="mt-1 block w-full rounded-xl border border-sand-line bg-white px-3 py-2 text-sm font-medium text-bark outline-none focus:border-ember"
          >
            <optgroup label="Old Testament">
              {oldTestament.map((entry) => (
                <option key={entry.slug} value={entry.slug}>
                  {entry.name}
                </option>
              ))}
            </optgroup>
            <optgroup label="New Testament">
              {newTestament.map((entry) => (
                <option key={entry.slug} value={entry.slug}>
                  {entry.name}
                </option>
              ))}
            </optgroup>
          </select>
        </label>

        <label className="w-24 text-[11px] font-semibold text-moss">
          Chapter
          <select
            value={chapter}
            onChange={(event) => book && go(book.slug, Number(event.target.value))}
            disabled={!book}
            className="mt-1 block w-full rounded-xl border border-sand-line bg-white px-3 py-2 text-sm font-medium text-bark outline-none focus:border-ember"
          >
            {Array.from({ length: book?.chapters ?? 0 }, (_, i) => i + 1).map((number) => (
              <option key={number} value={number}>
                {number}
              </option>
            ))}
          </select>
        </label>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            disabled={!book || chapter <= 1}
            onClick={() => book && go(book.slug, chapter - 1)}
            aria-label="Previous chapter"
            className="rounded-xl border border-sand-line p-2 text-bark transition hover:border-ember hover:text-ember disabled:opacity-40"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            disabled={!book || chapter >= (book?.chapters ?? 1)}
            onClick={() => book && go(book.slug, chapter + 1)}
            aria-label="Next chapter"
            className="rounded-xl border border-sand-line p-2 text-bark transition hover:border-ember hover:text-ember disabled:opacity-40"
          >
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>

      <article className="rounded-2xl border border-sand-line bg-white p-4 shadow-sm sm:p-7">
        <header className="border-b border-sand-line pb-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-ember">
            {index?.abbreviation ?? "WEB"} · {index?.translation ?? "World English Bible"}
          </p>
          <h2 className="mt-1 text-xl font-semibold tracking-tight text-bark sm:text-2xl">
            {book ? `${book.name} ${chapter}` : "Holy Bible"}
          </h2>
        </header>

        {failed ? (
          <p className="mt-4 rounded-xl bg-sand px-4 py-3 text-sm text-moss">
            This passage could not be loaded. Check the connection and try again.
          </p>
        ) : !verses ? (
          <p className="mt-4 text-sm text-moss">Loading the chapter…</p>
        ) : (
          <p className="mt-4 text-[15px] leading-8 text-bark sm:text-base">
            {verses.map((verse) => (
              <span key={verse.v}>
                <sup className="mr-1 align-super text-[10px] font-bold text-ember">{verse.v}</sup>
                {verse.t}{" "}
              </span>
            ))}
          </p>
        )}
      </article>

      {/* Whose words these are, and why they can ship with the app. */}
      {index && (
        <p className="px-1 text-[10px] leading-4 text-moss">
          {index.licence}{" "}
          <a
            href={index.source}
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-ember underline decoration-ember/30 underline-offset-2 hover:decoration-ember"
          >
            eBible.org
          </a>
        </p>
      )}
    </div>
  );
}
