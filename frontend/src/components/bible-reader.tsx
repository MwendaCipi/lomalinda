"use client";

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { ChevronLeft, ChevronRight, NotebookPen, Trash2, X } from "lucide-react";

/**
 * The Bible, read in the app — English and Kiswahili.
 *
 * The church pointed this shelf at other people's websites. Those sites go
 * down, put a reader behind a sign-in, or answer a phone on a poor connection
 * with nothing at all — and a Bible a member cannot open during a lesson is
 * worse than no shelf. The text now ships with the app: 66 books per
 * translation, one JSON file each under `public/bible/<translation>/`, fetched
 * only when that book is opened.
 *
 * English is the World English Bible (Updated), dedicated to the public domain
 * by eBible.org. Kiswahili is Biblica's Neno (Bibilia Takatifu), shared under
 * the Creative Commons Attribution-ShareAlike licence — both licences allow the
 * copy to live in the app; every other modern translation a church might
 * prefer is licensed in a way that does not.
 *
 * The address carries the passage and the language
 * (`?book=john&chapter=3&version=swhonen`), like the hymnbooks, so a lesson
 * leader can send one chapter instead of describing how to find it. It is read
 * through `useSyncExternalStore` because this page is a static export and the
 * query only exists after a real visit.
 *
 * Verses can be marked: a highlight colour, a note, or both. A member reading
 * on the church's wifi should not need an account for that, so the marks live
 * in the device's own storage — they survive a reload, an offline launch and
 * the app being closed, and nothing is sent anywhere. They are keyed by
 * translation and chapter too, because the same verse sits under a different
 * number in a different translation.
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
  language?: string;
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

type TranslationMeta = {
  code: string;
  label: string;
  name: string;
  abbreviation: string;
};

const BOOK_PARAM = "book";
const CHAPTER_PARAM = "chapter";
const VERSION_PARAM = "version";
const DEFAULT_VERSION = "engwebu";
const ADDRESS_EVENT = "bible:address-changed";

/** The passage as the address names it: `version|book|chapter`. */
function readAddress() {
  if (typeof window === "undefined") return "";
  const params = new URLSearchParams(window.location.search);
  return [
    params.get(VERSION_PARAM) ?? "",
    params.get(BOOK_PARAM) ?? "",
    params.get(CHAPTER_PARAM) ?? "",
  ].join("|");
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
function writeAddress(version: string, book: string, chapter: number) {
  const url = new URL(window.location.href);
  url.searchParams.set(VERSION_PARAM, version);
  url.searchParams.set(BOOK_PARAM, book);
  url.searchParams.set(CHAPTER_PARAM, String(chapter));
  window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  window.dispatchEvent(new Event(ADDRESS_EVENT));
}

/* ------------------------------------------------------------------ marks */

/** The four inks a reader can mark a verse with, all from the app's palette. */
const HIGHLIGHTS = [
  { id: "gold", label: "Amber", verse: "bg-gold-pale", swatch: "bg-gold-pale border-gold" },
  { id: "sage", label: "Green", verse: "bg-sage-tint", swatch: "bg-sage-tint border-sage-line" },
  { id: "mist", label: "Blue", verse: "bg-mist-soft", swatch: "bg-mist-soft border-sand-line" },
  { id: "alert", label: "Rose", verse: "bg-alert-wash", swatch: "bg-alert-wash border-alert-pale" },
] as const;

type HighlightId = (typeof HIGHLIGHTS)[number]["id"];

type Mark = { color?: HighlightId; note?: string };
type Marks = Record<string, Mark>;

const MARKS_KEY = "bible:marks:v1";
const MARKS_EVENT = "bible:marks-changed";
const NO_MARKS: Marks = {};
let marksRaw: string | null | undefined;
let marksCache: Marks = NO_MARKS;

function isHighlight(value: unknown): value is HighlightId {
  return HIGHLIGHTS.some((entry) => entry.id === value);
}

/**
 * Every mark on this device, cached against the raw string in storage so a
 * render does not parse the whole map. A phone with storage switched off simply
 * keeps no marks — refusing to highlight a verse would be worse.
 */
function readMarks(): Marks {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(MARKS_KEY);
  } catch {
    return NO_MARKS;
  }
  if (raw === marksRaw) return marksCache;
  marksRaw = raw;
  let parsed: unknown = null;
  try {
    parsed = raw ? JSON.parse(raw) : null;
  } catch {
    parsed = null;
  }
  const next: Marks = {};
  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (!value || typeof value !== "object") continue;
      const entry = value as { color?: unknown; note?: unknown };
      const mark: Mark = {};
      if (isHighlight(entry.color)) mark.color = entry.color;
      if (typeof entry.note === "string" && entry.note.trim()) mark.note = entry.note;
      if (mark.color || mark.note) next[key] = mark;
    }
  }
  marksCache = next;
  return next;
}

function subscribeMarks(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(MARKS_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(MARKS_EVENT, onChange);
  };
}

function saveMark(key: string, mark: Mark | null) {
  const next: Marks = { ...readMarks() };
  if (!mark || (!mark.color && !mark.note)) delete next[key];
  else next[key] = mark;
  try {
    localStorage.setItem(MARKS_KEY, JSON.stringify(next));
  } catch {
    return;
  }
  marksRaw = undefined;
  marksCache = NO_MARKS;
  window.dispatchEvent(new Event(MARKS_EVENT));
}

/* ----------------------------------------------------------------- reader */

export function BibleReader() {
  const [translations, setTranslations] = useState<TranslationMeta[]>([]);
  const [index, setIndex] = useState<BibleIndex | null>(null);
  const [failed, setFailed] = useState(false);
  const [bookText, setBookText] = useState<{ version: string; slug: string; data: BookText } | null>(null);
  const [selection, setSelection] = useState<{ chapter: string; verse: number } | null>(null);
  const [draft, setDraft] = useState("");
  const [writing, setWriting] = useState(false);

  const marks = useSyncExternalStore(subscribeMarks, readMarks, () => NO_MARKS);

  useEffect(() => {
    let alive = true;
    fetch("/bible/translations.json")
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error("translations"))))
      .then((data: { translations: TranslationMeta[] }) => {
        if (alive && Array.isArray(data.translations)) setTranslations(data.translations);
      })
      .catch(() => {
        // The reader still opens in English: a missing list must not cost a
        // member the Bible.
      });
    return () => {
      alive = false;
    };
  }, []);

  const address = useSyncExternalStore(subscribeAddress, readAddress, () => "");
  const [linkedVersion, linkedBook, linkedChapter] = address.split("|");

  const version = useMemo(() => {
    if (linkedVersion) return linkedVersion;
    return translations[0]?.code ?? DEFAULT_VERSION;
  }, [linkedVersion, translations]);

  // The index is per translation: Kiswahili names its books Mwanzo, Yohana and
  // Ufunuo, and a reader should see the names of the Bible in their hand.
  useEffect(() => {
    let alive = true;
    fetch(`/bible/${version}/index.json`)
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
  }, [version]);

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
    fetch(`/bible/${version}/${book.slug}.json`)
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error("book"))))
      .then((data: BookText) => {
        if (!alive) return;
        setBookText({ version, slug: book.slug, data });
        setFailed(false);
      })
      .catch(() => {
        if (alive) setFailed(true);
      });
    return () => {
      alive = false;
    };
  }, [version, book]);

  const go = useCallback(
    (slug: string, number: number, language = version) => writeAddress(language, slug, number),
    [version],
  );

  const text =
    bookText && bookText.version === version && bookText.slug === book?.slug ? bookText.data : null;
  const verses = text && book ? text.chapters[chapter - 1] ?? null : null;

  /** `engwebu|john|3` — the marks of one chapter, and one translation. */
  const chapterKey = book ? `${version}|${book.slug}|${chapter}` : "";
  const activeVerse = selection && selection.chapter === chapterKey ? selection.verse : null;
  const activeMark = activeVerse !== null ? marks[`${chapterKey}|${activeVerse}`] : undefined;

  const selectVerse = (number: number) => {
    if (activeVerse === number) {
      setSelection(null);
      setWriting(false);
      return;
    }
    setSelection({ chapter: chapterKey, verse: number });
    setDraft(marks[`${chapterKey}|${number}`]?.note ?? "");
    setWriting(false);
  };

  const paint = (color: HighlightId) => {
    if (activeVerse === null) return;
    const key = `${chapterKey}|${activeVerse}`;
    const current = marks[key];
    const note = current?.note;
    if (current?.color === color) saveMark(key, note ? { note } : null);
    else saveMark(key, { color, ...(note ? { note } : {}) });
  };

  const clearVerse = () => {
    if (activeVerse === null) return;
    saveMark(`${chapterKey}|${activeVerse}`, null);
    setDraft("");
    setWriting(false);
  };

  const saveNote = () => {
    if (activeVerse === null) return;
    const key = `${chapterKey}|${activeVerse}`;
    const note = draft.trim();
    const color = marks[key]?.color;
    saveMark(key, note || color ? { ...(color ? { color } : {}), ...(note ? { note } : {}) } : null);
    setWriting(false);
  };

  const oldTestament = index?.books.filter((entry) => entry.testament === "old") ?? [];
  const newTestament = index?.books.filter((entry) => entry.testament === "new") ?? [];
  const chapterNotes = (verses ?? [])
    .map((verse) => ({ verse: verse.v, note: marks[`${chapterKey}|${verse.v}`]?.note }))
    .filter((entry): entry is { verse: number; note: string } => Boolean(entry.note));

  return (
    <div className="space-y-4">
      {/* The passage picker. Selects rather than a shelf of 66 books: a lesson
          calls out "John 3" and the reader should answer in two taps. */}
      <div className="flex flex-wrap items-end gap-2 rounded-2xl border border-sand-line bg-white p-3 shadow-sm">
        {translations.length > 1 && (
          <label className="min-w-0 flex-1 basis-32 text-[11px] font-semibold text-moss">
            Language
            <select
              value={version}
              onChange={(event) => go(book?.slug ?? "genesis", chapter, event.target.value)}
              disabled={!book}
              className="mt-1 block w-full rounded-xl border border-sand-line bg-white px-3 py-2 text-sm font-medium text-bark outline-none focus:border-ember"
            >
              {translations.map((entry) => (
                <option key={entry.code} value={entry.code}>
                  {entry.label} · {entry.abbreviation}
                </option>
              ))}
            </select>
          </label>
        )}

        <label className="min-w-0 flex-1 basis-36 text-[11px] font-semibold text-moss">
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
          <p className="mt-1 text-[11px] text-moss">
            Tap a verse to highlight it or write a note. Your marks stay on this device.
          </p>
        </header>

        {failed ? (
          <p className="mt-4 rounded-xl bg-sand px-4 py-3 text-sm text-moss">
            This passage could not be loaded. Check the connection and try again.
          </p>
        ) : !verses ? (
          <p className="mt-4 text-sm text-moss">Loading the chapter…</p>
        ) : (
          <p className="mt-4 text-[15px] leading-8 text-bark sm:text-base">
            {verses.map((verse) => {
              const mark = marks[`${chapterKey}|${verse.v}`];
              const ink = HIGHLIGHTS.find((entry) => entry.id === mark?.color);
              const selected = activeVerse === verse.v;
              return (
                <button
                  key={verse.v}
                  type="button"
                  onClick={() => selectVerse(verse.v)}
                  aria-pressed={selected}
                  aria-label={`Verse ${verse.v}`}
                  className={`inline max-w-full rounded px-0.5 text-left align-baseline transition ${
                    ink ? ink.verse : ""
                  } ${selected ? "ring-1 ring-ember/60" : "hover:bg-sand"}`}
                >
                  <sup className="mr-1 align-super text-[10px] font-bold text-ember">{verse.v}</sup>
                  {verse.t}
                  {mark?.note && (
                    <NotebookPen
                      className="ml-1 inline h-3 w-3 align-baseline text-ember"
                      aria-label={`Note on verse ${verse.v}`}
                    />
                  )}{" "}
                </button>
              );
            })}
          </p>
        )}

        {chapterNotes.length > 0 && (
          <section className="mt-5 border-t border-sand-line pt-4">
            <h3 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-moss">
              Notes in this chapter
            </h3>
            <ul className="mt-2 space-y-2">
              {chapterNotes.map((entry) => (
                <li key={entry.verse} className="rounded-xl bg-sand px-3 py-2 text-sm leading-6 text-bark">
                  <button
                    type="button"
                    onClick={() => {
                      setSelection({ chapter: chapterKey, verse: entry.verse });
                      setDraft(entry.note);
                      setWriting(true);
                    }}
                    className="font-semibold text-ember hover:underline"
                  >
                    Verse {entry.verse}
                  </button>
                  <p className="mt-0.5 whitespace-pre-wrap text-moss">{entry.note}</p>
                </li>
              ))}
            </ul>
          </section>
        )}
      </article>

      {/* The verse tools. Kept in reach of the thumb, because a member marks a
          verse while reading on a phone, not while sitting at a desk. */}
      {activeVerse !== null && (
        <div className="sticky bottom-3 z-10 rounded-2xl border border-sand-line bg-white p-3 shadow-lg">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold text-bark">
              {book?.name} {chapter}:{activeVerse}
            </p>
            <button
              type="button"
              onClick={() => {
                setSelection(null);
                setWriting(false);
              }}
              aria-label="Close verse tools"
              className="rounded-lg p-1 text-moss transition hover:bg-sand hover:text-bark"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-semibold text-moss">Highlight</span>
            {HIGHLIGHTS.map((entry) => (
              <button
                key={entry.id}
                type="button"
                onClick={() => paint(entry.id)}
                aria-label={entry.label}
                aria-pressed={activeMark?.color === entry.id}
                className={`h-6 w-6 rounded-full border-2 transition ${entry.swatch} ${
                  activeMark?.color === entry.id ? "ring-2 ring-ember ring-offset-1" : ""
                }`}
              />
            ))}
            <button
              type="button"
              onClick={() => {
                setWriting((open) => !open);
                setDraft(activeMark?.note ?? "");
              }}
              className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-sand-line px-3 py-1 text-[11px] font-semibold text-bark transition hover:border-ember hover:text-ember"
            >
              <NotebookPen className="h-3.5 w-3.5" aria-hidden="true" />
              {activeMark?.note ? "Edit note" : "Add note"}
            </button>
            {(activeMark?.color || activeMark?.note) && (
              <button
                type="button"
                onClick={clearVerse}
                className="inline-flex items-center gap-1.5 rounded-full border border-sand-line px-3 py-1 text-[11px] font-semibold text-moss transition hover:border-alert hover:text-alert"
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                Clear
              </button>
            )}
          </div>

          {writing && (
            <div className="mt-2 space-y-2">
              <textarea
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                rows={3}
                placeholder="What struck you in this verse?"
                className="block w-full rounded-xl border border-sand-line bg-sand-plate px-3 py-2 text-sm leading-6 text-bark outline-none focus:border-ember"
              />
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setWriting(false);
                    setDraft(activeMark?.note ?? "");
                  }}
                  className="rounded-full border border-sand-line px-3 py-1 text-[11px] font-semibold text-moss transition hover:text-bark"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={saveNote}
                  className="rounded-full bg-bark px-3.5 py-1 text-[11px] font-semibold text-white transition hover:bg-ember"
                >
                  Save note
                </button>
              </div>
            </div>
          )}
        </div>
      )}

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
