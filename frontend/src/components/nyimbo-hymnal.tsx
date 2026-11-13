"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Info, Search, X } from "lucide-react";

import hymnal from "@/data/nyimbo-za-kristo.json";

type Verse = { n: string | null; lines: string[] };
type Hymn = { n: number; title: string; verses: Verse[]; chorus: string[]; incomplete: boolean };

const hymns = hymnal.hymns as Hymn[];
const source = hymnal.source;

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
 * A hymn the online archive holds only in part says so above its verses rather
 * than quietly ending mid-line, so a missing verse reads as the source's gap
 * and not as the church's typo.
 */
export function NyimboHymnal() {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<number | null>(null);
  const readerRef = useRef<HTMLDivElement | null>(null);

  const tokens = fold(query).split(" ").filter(Boolean);
  const matches = useMemo(() => {
    const words = fold(query).split(" ").filter(Boolean);
    if (!words.length) return hymns;
    return hymns.filter((_, index) => words.every((word) => haystacks[index].includes(word)));
  }, [query]);

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

          <p className="px-1 text-[11px] font-medium text-moss" aria-live="polite">
            {tokens.length
              ? `${matches.length} of ${hymns.length} hymns`
              : `${hymns.length} hymns · Nyimbo za Kristo`}
          </p>

          <div className="max-h-[calc(100vh-13rem)] overflow-y-auto rounded-xl border border-sand-line bg-white shadow-sm">
            {matches.length === 0 ? (
              <p className="p-4 text-xs leading-5 text-moss">
                No hymn answers to “{query}”. Try the number, the title, or the words of its first line.
              </p>
            ) : (
              <ul className="divide-y divide-sand-line">
                {matches.map((entry) => {
                  const active = entry.n === selected;
                  return (
                    <li key={entry.n}>
                      <button
                        type="button"
                        onClick={() => open(entry.n)}
                        aria-current={active ? "true" : undefined}
                        className={`flex w-full items-baseline gap-2.5 px-3 py-2 text-left transition ${
                          active ? "bg-ember/10 text-ember" : "text-bark hover:bg-sand"
                        }`}
                      >
                        <span
                          className={`w-8 shrink-0 text-[11px] font-semibold tabular-nums ${active ? "text-ember" : "text-sand-mute"}`}
                        >
                          {entry.n}
                        </span>
                        <span className="min-w-0 flex-1 text-[13px] font-medium leading-5">{entry.title}</span>
                        {entry.incomplete && (
                          <span className="shrink-0 text-[10px] font-semibold text-sand-mute" title="The archive holds only part of this hymn">
                            part
                          </span>
                        )}
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
              the verses as the congregation sings them.
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
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="shrink-0 rounded-full border border-sand-line px-3 py-1 text-[11px] font-semibold text-moss transition hover:border-ember hover:text-ember lg:hidden"
              >
                All hymns
              </button>
            </div>

            {hymn.incomplete && (
              <p className="mt-3 flex items-start gap-2 rounded-xl bg-sand px-3 py-2 text-[11px] leading-5 text-moss">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ember" aria-hidden="true" />
                <span>The online archive holds only part of this hymn — the text below is what it has, not all there is.</span>
              </p>
            )}

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
          . {source.note} Provided here for the church&apos;s own worship; corrections welcome at the church office.
        </p>
      </section>
    </div>
  );
}
