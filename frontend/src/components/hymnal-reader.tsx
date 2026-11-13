"use client";

import { useCallback, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { ChevronLeft, ChevronRight, Search, Star, X } from "lucide-react";
import type { ReactNode } from "react";

export type HymnVerse = { n: string | null; lines: string[] };
export type Hymn = { n: number; title: string; verses: HymnVerse[]; chorus: string[] };

/** One hymnbook's data file, exactly as it sits in `src/data/*.json`. */
export type HymnalData = {
  hymnal: string;
  language?: string;
  count?: number;
  source?: { name: string; url: string; note?: string };
  hymns: Hymn[];
};

/**
 * One line of a hymn may carry a typographic apostrophe while a member types
 * the plain one — `ving’aavyo` against `ving'aavyo` — so before anything is
 * compared both sides are folded: lower case, no accents, the apostrophes
 * unified and the runs of space collapsed.
 */
function fold(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\u2018\u2019\u02bc`]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

/** The address carries the open hymn as `?hymn=42`, so a hymn can be shared. */
const HYMN_PARAM = "hymn";
/** The address can carry a section filter, such as `?section=extra`. */
const SECTION_PARAM = "section";
/** Fired on this tab when the address changes; `popstate` only reaches us on Back. */
const HYMN_URL_EVENT = "hymnal:hymn-changed";

/** The open hymn as the address names it, or "" when it names none. */
function readHymn() {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.search).get(HYMN_PARAM) ?? "";
}

/** Which part of the book the index is showing. */
type HymnSection = "all" | "standard" | "extra";

/** The English book starts its second collection here; the hymnal ends at 695. */
const EXTRA_START = 696;

/** The active section filter as the address names it, or "" when none. */
function readSection() {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.search).get(SECTION_PARAM) ?? "";
}

function sectionFromUrl(raw: string): HymnSection {
  return raw === "standard" || raw === "extra" ? raw : "all";
}

function subscribeToHymn(onChange: () => void) {
  window.addEventListener("popstate", onChange);
  window.addEventListener(HYMN_URL_EVENT, onChange);
  return () => {
    window.removeEventListener("popstate", onChange);
    window.removeEventListener(HYMN_URL_EVENT, onChange);
  };
}

/**
 * Writes the address once, without adding a history entry.
 *
 * The hymn and the section are written together because they are one piece of
 * state: opening a hymn the current filter hides has to widen the filter in the
 * same write, or two dispatches would leave the page showing a hymn its own
 * index says is not there. `undefined` leaves either one as it is.
 */
function writeAddress({ hymn, section }: { hymn?: number | null; section?: HymnSection }) {
  const url = new URL(window.location.href);
  if (hymn !== undefined) {
    if (hymn === null) url.searchParams.delete(HYMN_PARAM);
    else url.searchParams.set(HYMN_PARAM, String(hymn));
  }
  if (section !== undefined) {
    if (section === "all") url.searchParams.delete(SECTION_PARAM);
    else url.searchParams.set(SECTION_PARAM, section);
  }
  // Replaced rather than pushed: opening a hymn is not a step deeper into the
  // page, so Back still leaves the hymnbook instead of closing one hymn.
  window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  window.dispatchEvent(new Event(HYMN_URL_EVENT));
}

/**
 * The device's own list of marked hymns, per hymnbook.
 *
 * Each book keeps its marks under its own key, so the same number in Dholuo and
 * in Swahili are different hymns and never overwrite each other's stars. The
 * marks live in the device: no account, nothing sent anywhere, and they survive
 * a reload, an offline launch and the app being closed.
 */
function makeFavourites(storageKey: string, numbers: Set<number>) {
  const EMPTY: number[] = [];
  const event = `${storageKey}:changed`;
  let cachedRaw: string | null | undefined;
  let cached: number[] = EMPTY;

  const snapshot = () => {
    let raw: string | null = null;
    try {
      raw = localStorage.getItem(storageKey);
    } catch {
      return EMPTY;
    }
    if (raw === cachedRaw) return cached;
    cachedRaw = raw;
    let parsed: unknown = null;
    try {
      parsed = raw ? JSON.parse(raw) : null;
    } catch {
      parsed = null;
    }
    cached = Array.isArray(parsed)
      ? parsed.filter((value): value is number => typeof value === "number" && numbers.has(value))
      : EMPTY;
    return cached;
  };

  const subscribe = (onChange: () => void) => {
    window.addEventListener("storage", onChange);
    window.addEventListener(event, onChange);
    return () => {
      window.removeEventListener("storage", onChange);
      window.removeEventListener(event, onChange);
    };
  };

  const toggle = (number: number) => {
    const current = snapshot();
    const next = current.includes(number)
      ? current.filter((value) => value !== number)
      : [...current, number].sort((a, b) => a - b);
    try {
      localStorage.setItem(storageKey, JSON.stringify(next));
    } catch {
      // A phone with storage switched off simply keeps no marks; refusing to
      // star a hymn would be worse than forgetting it.
    }
    window.dispatchEvent(new Event(event));
  };

  return { snapshot, subscribe, toggle, empty: () => EMPTY };
}

/**
 * A hymnbook read in the app, for any language whose text lives in a data file.
 *
 * The church used to hand these shelves to other websites; a hymnbook a member
 * cannot open during a song service is not a hymnbook. Each book is a JSON file
 * under `src/data/`, so the index and the reader keep working with no network
 * round trip, no account and no third site in the way — and a book whose file
 * has no hymns yet says so plainly rather than showing an empty list.
 *
 * The shelf is the book's own order — number, then title — because that is how
 * a congregation calls a hymn out, and the search box answers to the same three
 * things a leader knows: the number, the title, or the first line they can hum.
 *
 * A song leader arrives with this week's hymns already chosen, so each hymn
 * carries a star and the index can narrow to the starred ones alone: four taps
 * before the service instead of a search during it.
 */
export function HymnalReader({
  data,
  storageKey,
  credit,
}: {
  data: HymnalData;
  /** Where this book's starred hymns are kept on the device. */
  storageKey: string;
  /** A sentence about this particular book's text, after the source credit. */
  credit?: ReactNode;
}) {
  if (!data.hymns.length) return <HymnalPreparing data={data} />;
  return <HymnalIndex data={data} storageKey={storageKey} credit={credit} />;
}

/** A book whose texts have not been added to the app yet. */
function HymnalPreparing({ data }: { data: HymnalData }) {
  return (
    <div className="rounded-2xl border border-dashed border-sand-line bg-white/60 p-8 text-center">
      <p className="text-sm font-semibold text-bark">{data.hymnal} is still being prepared</p>
      <p className="mx-auto mt-1 max-w-md text-xs leading-5 text-moss">
        The hymns for this book have not been added to the app yet. Until they are, the same hymns can be read at{" "}
        {data.source ? (
          <a
            href={data.source.url}
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-ember underline decoration-ember/30 underline-offset-2 hover:decoration-ember"
          >
            {data.source.name}
          </a>
        ) : (
          "the church's hymnbook"
        )}
        .
      </p>
    </div>
  );
}

function HymnalIndex({ data, storageKey, credit }: { data: HymnalData; storageKey: string; credit?: ReactNode }) {
  const [query, setQuery] = useState("");
  const [favouritesOnly, setFavouritesOnly] = useState(false);
  const readerRef = useRef<HTMLDivElement | null>(null);

  const hymns = data.hymns;
  const numbers = useMemo(() => new Set(hymns.map((hymn) => hymn.n)), [hymns]);
  const store = useMemo(() => makeFavourites(storageKey, numbers), [storageKey, numbers]);

  // The English book is the hymnal's 695 hymns plus a second collection from
  // 696 up, so its index can be narrowed to either part. A book with no extras
  // never shows the strip.
  const hasExtraHymns = useMemo(() => hymns.some((hymn) => hymn.n >= EXTRA_START), [hymns]);
  const linkedSection = useSyncExternalStore(subscribeToHymn, readSection, () => "");
  // The filter is the address, like the open hymn: there is no second copy in
  // React state for the two to disagree about.
  const currentSection = sectionFromUrl(linkedSection);
  const highest = useMemo(() => hymns.reduce((top, hymn) => Math.max(top, hymn.n), 0), [hymns]);

  const selectSection = useCallback((next: HymnSection) => writeAddress({ section: next }), []);

  // A leader sends the hymn they mean rather than "number 42 in Wende Nyasaye",
  // so the address carries the open hymn and the page opens on it. The address
  // is the state itself, read through `useSyncExternalStore` rather than
  // `useSearchParams` because this page is a static export: a hymn opened by a
  // click and one opened by a link then take the same path, and Back closes the
  // hymn instead of the page growing its own parallel idea of where it is.
  const linked = useSyncExternalStore(subscribeToHymn, readHymn, () => "");
  const selected = useMemo(() => {
    const number = Number.parseInt(linked, 10);
    return Number.isFinite(number) && numbers.has(number) ? number : null;
  }, [linked, numbers]);

  // The marks live in the device, not in React state: the page is rendered on
  // the server, where there is no storage to read, so the list starts empty
  // and fills from the device once — no hydration mismatch, and a star tapped
  // in another tab shows here too.
  const favourites = useSyncExternalStore(store.subscribe, store.snapshot, store.empty);

  const toggleFavourite = useCallback((number: number) => store.toggle(number), [store]);

  // What a hymn answers to: its number, its title and its opening line.
  const haystacks = useMemo(
    () =>
      hymns.map((hymn) =>
        fold(`${hymn.n} ${hymn.title} ${hymn.verses[0]?.lines.slice(0, 2).join(" ") ?? ""}`)
      ),
    [hymns]
  );

  const tokens = fold(query).split(" ").filter(Boolean);
  const matches = useMemo(() => {
    const words = fold(query).split(" ").filter(Boolean);
    return hymns.filter((hymn, index) => {
      if (currentSection === "standard" && hymn.n >= EXTRA_START) return false;
      if (currentSection === "extra" && hymn.n < EXTRA_START) return false;
      if (favouritesOnly && !favourites.includes(hymn.n)) return false;
      return words.every((word) => haystacks[index].includes(word));
    });
  }, [query, favouritesOnly, favourites, hymns, haystacks, currentSection]);

  const open = useCallback(
    (number: number) => {
      // A hymn the filter hides — a favourite, or the next hymn in the reader —
      // widens the filter as it opens, so the index keeps showing the hymn that
      // is being read.
      const hidden =
        currentSection === "standard"
          ? number >= EXTRA_START
          : currentSection === "extra"
            ? number < EXTRA_START
            : false;
      writeAddress({ hymn: number, section: hidden ? "all" : undefined });
      // The reader is the other half of the page: on a phone the list is gone by
      // now, and on a desk the hymn has to be in view rather than 200 rows below.
      requestAnimationFrame(() => {
        readerRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
      });
    },
    [currentSection]
  );

  /** Back to the index, and the address stops naming a hymn. */
  const close = useCallback(() => writeAddress({ hymn: null }), []);

  const hymn = selected === null ? null : hymns.find((entry) => entry.n === selected) ?? null;
  const position = hymn ? hymns.findIndex((entry) => entry.n === hymn.n) : -1;
  const previous = position > 0 ? hymns[position - 1] : null;
  const next = position >= 0 && position < hymns.length - 1 ? hymns[position + 1] : null;

  const starOn = (number: number) => favourites.includes(number);

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)] lg:items-start">
      {/* The index. On a phone an opened hymn takes the screen, so the list
          steps aside rather than sitting under it. */}
      <section className={`min-w-0 ${hymn ? "hidden lg:block" : "block"}`} aria-label="Hymn index">
        <div className="sticky top-1 space-y-2 lg:top-4">
          {hasExtraHymns && (
            <div className="flex items-center gap-1 rounded-xl border border-sand-line bg-white/70 p-1 text-[11px] font-semibold">
              <button
                type="button"
                onClick={() => selectSection("all")}
                className={`flex-1 rounded-lg py-1 text-center transition ${
                  currentSection === "all" ? "bg-ember text-white shadow-xs" : "text-moss hover:text-bark"
                }`}
              >
                All ({hymns.length})
              </button>
              <button
                type="button"
                onClick={() => selectSection("standard")}
                className={`flex-1 rounded-lg py-1 text-center transition ${
                  currentSection === "standard" ? "bg-ember text-white shadow-xs" : "text-moss hover:text-bark"
                }`}
              >
                Hymnal (1–{EXTRA_START - 1})
              </button>
              <button
                type="button"
                onClick={() => selectSection("extra")}
                className={`flex-1 rounded-lg py-1 text-center transition ${
                  currentSection === "extra" ? "bg-ember text-white shadow-xs" : "text-moss hover:text-bark"
                }`}
              >
                Extra Hymns ({EXTRA_START}–{highest})
              </button>
            </div>
          )}

          <label className="relative block">
            <span className="sr-only">Search the hymnal</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-sand-mute" aria-hidden="true" />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Number, title or first line…"
              className="w-full rounded-xl border border-sand-line bg-white py-2 pl-9 pr-8 text-sm text-bark shadow-sm outline-none transition placeholder:text-sand-mute focus:border-ember focus:ring-2 focus:ring-ember/20"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label="Clear the search"
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-sand-mute transition hover:text-ember"
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            )}
          </label>

          <div className="flex items-center justify-between gap-2 px-1">
            <p className="text-[11px] font-medium text-moss" aria-live="polite">
              {tokens.length
                ? `${matches.length} of ${hymns.length} hymns`
                : favouritesOnly
                  ? `${matches.length} marked hymn${matches.length === 1 ? "" : "s"}`
                  : hasExtraHymns && currentSection !== "all"
                    ? `${matches.length} ${currentSection === "extra" ? "extra hymns" : "hymns"} · ${data.hymnal}`
                    : `${hymns.length} hymns · ${data.hymnal}`}
            </p>
            <button
              type="button"
              onClick={() => setFavouritesOnly((current) => !current)}
              aria-pressed={favouritesOnly}
              className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold transition ${
                favouritesOnly
                  ? "border-ember bg-ember text-white"
                  : "border-sand-line bg-white text-moss hover:border-ember hover:text-ember"
              }`}
            >
              <Star className={`h-3 w-3 ${favouritesOnly ? "fill-white text-white" : "fill-none"}`} aria-hidden="true" />
              Favourites{favourites.length ? ` (${favourites.length})` : ""}
            </button>
          </div>

          <div className="max-h-[calc(100vh-13rem)] overflow-y-auto rounded-xl border border-sand-line bg-sand/60 shadow-sm">
            {matches.length === 0 ? (
              <p className="p-4 text-xs leading-5 text-moss">
                {favouritesOnly && !favourites.length ? (
                  <>
                    No hymns marked yet. Tap the star beside a hymn — or on the one you have open — to keep it here for
                    the next service.
                  </>
                ) : (
                  <>No hymn answers to “{query}”. Try the number, the title, or the words of its first line.</>
                )}
              </p>
            ) : (
              <ul className="space-y-1.5 p-1.5">
                {matches.map((entry) => {
                  const active = entry.n === selected;
                  const starred = starOn(entry.n);
                  return (
                    <li
                      key={entry.n}
                      className={`flex items-center gap-1 rounded-xl border pr-1 shadow-sm transition ${
                        active
                          ? "border-ember bg-ember/5"
                          : "border-sand-line bg-white hover:-translate-y-px hover:border-ember/50"
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => open(entry.n)}
                        aria-current={active ? "true" : undefined}
                        className="flex min-w-0 flex-1 items-center gap-2.5 rounded-xl px-2 py-2.5 text-left"
                      >
                        <span
                          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[11px] font-semibold tabular-nums ${
                            active ? "bg-ember text-white" : "bg-sand text-bark"
                          }`}
                        >
                          {entry.n}
                        </span>
                        <span
                          className={`min-w-0 flex-1 text-[13px] font-semibold leading-5 ${active ? "text-ember" : "text-bark"}`}
                        >
                          <span className="flex items-center gap-1.5">
                            <span className="truncate">{entry.title}</span>
                            {entry.n >= 696 && (
                              <span className="shrink-0 rounded bg-sand-line/60 px-1 py-0.5 text-[9px] font-medium uppercase tracking-wider text-moss">
                                Extra
                              </span>
                            )}
                          </span>
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleFavourite(entry.n)}
                        aria-pressed={starred}
                        aria-label={`${starred ? "Remove" : "Mark"} hymn ${entry.n}, ${entry.title}`}
                        title={starred ? "Remove from favourites" : "Mark as a favourite"}
                        className={`shrink-0 rounded-full p-1.5 transition ${
                          starred ? "text-ember" : "text-sand-mute hover:text-ember"
                        }`}
                      >
                        <Star className={`h-4 w-4 ${starred ? "fill-ember" : "fill-none"}`} aria-hidden="true" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </section>

      {/* The reader. */}
      <section ref={readerRef} className="min-w-0 scroll-mt-4" aria-label="Hymn">
        {!hymn ? (
          <div className="rounded-2xl border border-dashed border-sand-line bg-white/60 p-8 text-center">
            <p className="text-sm font-semibold text-bark">Choose a hymn from the index</p>
            <p className="mx-auto mt-1 max-w-sm text-xs leading-5 text-moss">
              {hasExtraHymns ? (
                <>
                  All {hymns.length} hymns of {data.hymnal} are here — the standard 1–695 collection and the 257 Extra
                  Hymns (696–952) from Christ in Song. Search by number, title or first line, then read the verses as
                  the congregation sings them.
                </>
              ) : (
                <>
                  All {hymns.length} hymns of {data.hymnal} are here — search by number, title or first line, then read the
                  verses as the congregation sings them. Star the ones this week&apos;s service needs.
                </>
              )}
            </p>
          </div>
        ) : (
          <article className="min-w-0 rounded-2xl border border-sand-line bg-white p-4 shadow-sm sm:p-7">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-ember">
                  {hymn.n >= 696 ? `${data.hymnal} · Extra Hymns` : data.hymnal}
                </p>
                <h2 className="mt-1 flex items-baseline gap-2 text-lg font-semibold tracking-tight text-bark sm:text-2xl">
                  <span className="shrink-0 tabular-nums text-ember">{hymn.n}.</span>
                  <span className="min-w-0 break-words">{hymn.title}</span>
                </h2>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => toggleFavourite(hymn.n)}
                  aria-pressed={starOn(hymn.n)}
                  aria-label={`${starOn(hymn.n) ? "Remove" : "Mark"} hymn ${hymn.n}, ${hymn.title}`}
                  title={starOn(hymn.n) ? "Remove from favourites" : "Mark as a favourite"}
                  className={`rounded-full border p-1.5 transition ${
                    starOn(hymn.n)
                      ? "border-ember bg-ember/10 text-ember"
                      : "border-sand-line text-sand-mute hover:border-ember hover:text-ember"
                  }`}
                >
                  <Star className={`h-4 w-4 ${starOn(hymn.n) ? "fill-ember" : "fill-none"}`} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={close}
                  className="rounded-full border border-sand-line px-3 py-1 text-[11px] font-semibold text-moss transition hover:border-ember hover:text-ember lg:hidden"
                >
                  All hymns
                </button>
              </div>
            </div>

            <div className="mt-5 space-y-5">
              {hymn.verses.map((verse, index) => (
                <div key={`${verse.n ?? "v"}-${index}`} className="flex gap-2 sm:gap-3">
                  <span className="mt-0.5 w-4 shrink-0 text-right text-xs font-semibold tabular-nums text-sand-mute sm:w-5">
                    {verse.n ?? ""}
                  </span>
                  <div className="min-w-0 flex-1 space-y-0.5 break-words text-[15px] leading-7 text-bark">
                    {verse.lines.map((line, lineIndex) => (
                      <p key={lineIndex}>{line}</p>
                    ))}
                  </div>
                </div>
              ))}

              {hymn.chorus.length > 0 && (
                <div className="flex gap-2 border-t border-sand-line pt-4 sm:gap-3">
                  <span className="mt-0.5 w-4 shrink-0 sm:w-5" aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ember">Chorus</p>
                    <div className="mt-1 space-y-0.5 break-words text-[15px] leading-7 text-bark">
                      {hymn.chorus.map((line, lineIndex) => (
                        <p key={lineIndex}>{line}</p>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="mt-6 flex items-center justify-between gap-2 border-t border-sand-line pt-4 sm:gap-3">
              <button
                type="button"
                onClick={() => previous && open(previous.n)}
                disabled={!previous}
                className="inline-flex min-w-0 items-center gap-1.5 rounded-xl border border-sand-line px-3 py-2 text-left text-[11px] font-semibold text-bark transition hover:border-ember hover:text-ember disabled:opacity-40"
              >
                <ChevronLeft className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span className="truncate">{previous ? `${previous.n}. ${previous.title}` : "Start of the hymnal"}</span>
              </button>
              <button
                type="button"
                onClick={() => next && open(next.n)}
                disabled={!next}
                className="inline-flex min-w-0 items-center gap-1.5 rounded-xl border border-sand-line px-3 py-2 text-right text-[11px] font-semibold text-bark transition hover:border-ember hover:text-ember disabled:opacity-40"
              >
                <span className="truncate">{next ? `${next.n}. ${next.title}` : "End of the hymnal"}</span>
                <ChevronRight className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              </button>
            </div>
          </article>
        )}

        {/* Where these words come from, and whose they are. */}
        {data.source && (
          <p className="mt-3 px-1 text-[10px] leading-4 text-moss">
            Texts from{" "}
            <a
              href={data.source.url}
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-ember underline decoration-ember/30 underline-offset-2 hover:decoration-ember"
            >
              {data.source.name}
            </a>
            . {data.source.note} {credit}
          </p>
        )}
      </section>
    </div>
  );
}
