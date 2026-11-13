"use client";

import { useCallback, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { ChevronLeft, ChevronRight, Search, Star, X } from "lucide-react";

import hymnal from "@/data/nyimbo-za-kristo.json";

type Verse = { n: string | null; lines: string[] };
type Hymn = { n: number; title: string; verses: Verse[]; chorus: string[] };

const hymns = hymnal.hymns as Hymn[];
const source = hymnal.source;

/** The device's own list of marked hymns — the same on the phone in the pew. */
const FAVOURITES_KEY = "nzk:favourites";
/** Fired on this tab when a star changes; `storage` only reaches other tabs. */
const FAVOURITES_EVENT = "nzk:favourites-changed";

const NO_FAVOURITES: number[] = [];
let cachedRaw: string | null | undefined;
let cachedValue: number[] = NO_FAVOURITES;

/** The stored marks, parsed once per stored value rather than per render. */
function snapshotFavourites(): number[] {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(FAVOURITES_KEY);
  } catch {
    return NO_FAVOURITES;
  }
  if (raw === cachedRaw) return cachedValue;
  cachedRaw = raw;
  let parsed: unknown = null;
  try {
    parsed = raw ? JSON.parse(raw) : null;
  } catch {
    parsed = null;
  }
  cachedValue = Array.isArray(parsed)
    ? parsed.filter((value): value is number => typeof value === "number" && value >= 1 && value <= hymns.length)
    : NO_FAVOURITES;
  return cachedValue;
}

function subscribeFavourites(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(FAVOURITES_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(FAVOURITES_EVENT, onChange);
  };
}

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

/** What a hymn answers to: its number, its title and its opening line. */
const haystacks = hymns.map((hymn) => fold(`${hymn.n} ${hymn.title} ${hymn.verses[0]?.lines.slice(0, 2).join(" ") ?? ""}`));

/**
 * The Swahili hymnal, read in the app.
 *
 * The church used to hand this shelf to another website; that site stopped
 * serving, and a hymnbook a member cannot open during a song service is not a
 * hymnbook. The 220 hymns now live in the app as data (`nyimbo-za-kristo.json`),
 * so the index and the reader keep working with no network round trip, no
 * account, and no third site in the way.
 *
 * The shelf is the book's own order — number, then title — because that is how
 * a congregation calls a hymn out ("nyimbo mia moja na arobaini na sita"), and
 * the search box answers to the same three things a leader knows: the number,
 * the title, or the first line they can hum.
 *
 * A song leader arrives with this week's hymns already chosen, so each hymn
 * carries a star and the index can narrow to the starred ones alone: four taps
 * before the service instead of a search during it. The marks are the device's
 * own (localStorage, key `nzk:favourites`) — no account, nothing sent
 * anywhere, and they survive a reload, an offline launch and the app being
 * closed. Another member's phone keeps its own list.
 *
 * Twelve of the hymns came off the online archive cut at the start or end of a
 * line — the short responses of the Maitikio and the doxology among them — and
 * were completed from the printed Nyimbo za Kristo, so what is read here is the
 * book's text rather than a webpage's half-line.
 */
export function NyimboHymnal() {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<number | null>(null);
  const [favouritesOnly, setFavouritesOnly] = useState(false);
  const readerRef = useRef<HTMLDivElement | null>(null);

  // The marks live in the device, not in React state: the page is rendered on
  // the server, where there is no storage to read, so the list starts empty
  // and fills from the device once — no hydration mismatch, and a star tapped
  // in another tab shows here too.
  const favourites = useSyncExternalStore(subscribeFavourites, snapshotFavourites, () => NO_FAVOURITES);

  const toggleFavourite = useCallback((number: number) => {
    const current = snapshotFavourites();
    const next = current.includes(number)
      ? current.filter((value) => value !== number)
      : [...current, number].sort((a, b) => a - b);
    try {
      localStorage.setItem(FAVOURITES_KEY, JSON.stringify(next));
    } catch {
      // A phone with storage switched off simply keeps no marks; refusing to
      // star a hymn would be worse than forgetting it.
    }
    window.dispatchEvent(new Event(FAVOURITES_EVENT));
  }, []);

  const tokens = fold(query).split(" ").filter(Boolean);
  const matches = useMemo(() => {
    const words = fold(query).split(" ").filter(Boolean);
    return hymns.filter((hymn, index) => {
      if (favouritesOnly && !favourites.includes(hymn.n)) return false;
      return words.every((word) => haystacks[index].includes(word));
    });
  }, [query, favouritesOnly, favourites]);

  const open = useCallback((number: number) => {
    setSelected(number);
    // The reader is the other half of the page: on a phone the list is gone by
    // now, and on a desk the hymn has to be in view rather than 200 rows below.
    requestAnimationFrame(() => {
      readerRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
    });
  }, []);

  const hymn = selected === null ? null : hymns.find((entry) => entry.n === selected) ?? null;
  const position = hymn ? hymns.findIndex((entry) => entry.n === hymn.n) : -1;
  const previous = position > 0 ? hymns[position - 1] : null;
  const next = position >= 0 && position < hymns.length - 1 ? hymns[position + 1] : null;

  const starOn = (number: number) => favourites.includes(number);

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)] lg:items-start">
      {/* The index. On a phone an opened hymn takes the screen, so the list
          steps aside rather than sitting under it. */}
      <section className={hymn ? "hidden lg:block" : "block"} aria-label="Hymn index">
        <div className="sticky top-1 space-y-2 lg:top-4">
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
                  : `${hymns.length} hymns · Nyimbo za Kristo`}
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

          <div className="max-h-[calc(100vh-13rem)] overflow-y-auto rounded-xl border border-sand-line bg-white shadow-sm">
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
              <ul className="divide-y divide-sand-line">
                {matches.map((entry) => {
                  const active = entry.n === selected;
                  const starred = starOn(entry.n);
                  return (
                    <li key={entry.n} className="flex items-center">
                      <button
                        type="button"
                        onClick={() => open(entry.n)}
                        aria-current={active ? "true" : undefined}
                        className={`flex min-w-0 flex-1 items-baseline gap-2.5 px-3 py-2 text-left transition ${
                          active ? "bg-ember/10 text-ember" : "text-bark hover:bg-sand"
                        }`}
                      >
                        <span
                          className={`w-8 shrink-0 text-[11px] font-semibold tabular-nums ${active ? "text-ember" : "text-sand-mute"}`}
                        >
                          {entry.n}
                        </span>
                        <span className="min-w-0 flex-1 text-[13px] font-medium leading-5">{entry.title}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleFavourite(entry.n)}
                        aria-pressed={starred}
                        aria-label={`${starred ? "Remove" : "Mark"} hymn ${entry.n}, ${entry.title}`}
                        title={starred ? "Remove from favourites" : "Mark as a favourite"}
                        className={`shrink-0 rounded-full p-2 pr-3 transition ${
                          starred ? "text-ember" : "text-sand-mute hover:text-ember"
                        }`}
                      >
                        <Star className={`h-3.5 w-3.5 ${starred ? "fill-ember" : "fill-none"}`} aria-hidden="true" />
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
      <section ref={readerRef} className="scroll-mt-4" aria-label="Hymn">
        {!hymn ? (
          <div className="rounded-2xl border border-dashed border-sand-line bg-white/60 p-8 text-center">
            <p className="text-sm font-semibold text-bark">Choose a hymn from the index</p>
            <p className="mx-auto mt-1 max-w-sm text-xs leading-5 text-moss">
              All {hymns.length} hymns of Nyimbo za Kristo are here — search by number, title or first line, then read
              the verses as the congregation sings them. Star the ones this week&apos;s service needs.
            </p>
          </div>
        ) : (
          <article className="rounded-2xl border border-sand-line bg-white p-5 shadow-sm sm:p-7">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-ember">Nyimbo za Kristo</p>
                <h2 className="mt-1 flex items-baseline gap-2 text-xl font-semibold tracking-tight text-bark sm:text-2xl">
                  <span className="tabular-nums text-ember">{hymn.n}.</span>
                  <span className="min-w-0">{hymn.title}</span>
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
                  onClick={() => setSelected(null)}
                  className="rounded-full border border-sand-line px-3 py-1 text-[11px] font-semibold text-moss transition hover:border-ember hover:text-ember lg:hidden"
                >
                  All hymns
                </button>
              </div>
            </div>

            <div className="mt-5 space-y-5">
              {hymn.verses.map((verse, index) => (
                <div key={`${verse.n ?? "v"}-${index}`} className="flex gap-3">
                  <span className="mt-0.5 w-5 shrink-0 text-right text-xs font-semibold tabular-nums text-sand-mute">
                    {verse.n ?? ""}
                  </span>
                  <div className="min-w-0 space-y-0.5 text-[15px] leading-7 text-bark">
                    {verse.lines.map((line, lineIndex) => (
                      <p key={lineIndex}>{line}</p>
                    ))}
                  </div>
                </div>
              ))}

              {hymn.chorus.length > 0 && (
                <div className="flex gap-3 border-t border-sand-line pt-4">
                  <span className="mt-0.5 w-5 shrink-0" aria-hidden="true" />
                  <div className="min-w-0">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ember">Chorus</p>
                    <div className="mt-1 space-y-0.5 text-[15px] leading-7 text-bark">
                      {hymn.chorus.map((line, lineIndex) => (
                        <p key={lineIndex}>{line}</p>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="mt-6 flex items-center justify-between gap-3 border-t border-sand-line pt-4">
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
        <p className="mt-3 px-1 text-[10px] leading-4 text-moss">
          Texts from{" "}
          <a
            href={source.url}
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-ember underline decoration-ember/30 underline-offset-2 hover:decoration-ember"
          >
            {source.name}
          </a>
          . {source.note} Twelve hymns — the Maitikio responses of 210–220, the doxology at 12 and 207 — were
          completed from the printed Nyimbo za Kristo, where the archive&apos;s text began or ended mid-line. Provided
          here for the church&apos;s own worship; corrections welcome at the church office.
        </p>
      </section>
    </div>
  );
}
