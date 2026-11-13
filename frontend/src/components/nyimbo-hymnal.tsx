"use client";

import hymnal from "@/data/nyimbo-za-kristo.json";

import { HymnalReader } from "@/components/hymnal-reader";

/**
 * The Swahili hymnbook, read in the app.
 *
 * The church used to hand this shelf to another website; that site stopped
 * serving, and a hymnbook a member cannot open during a song service is not a
 * hymnbook. The 220 hymns live in the app as data (`nyimbo-za-kristo.json`) and
 * are read by the shared `HymnalReader`, the same one every other language's
 * book uses.
 *
 * The marks are the device's own (localStorage, key `nzk:favourites`) — the key
 * predates the shared reader and stays as it was, so the stars a member kept
 * before are still theirs.
 */
export function NyimboHymnal() {
  return (
    <HymnalReader
      data={hymnal}
      storageKey="nzk:favourites"
      credit={
        <>
          Twelve hymns — the Maitikio responses of 210–220, the doxology at 12 and 207 — were completed from the
          printed Nyimbo za Kristo, where the archive&apos;s text began or ended mid-line. Provided here for the
          church&apos;s own worship; corrections welcome at the church office.
        </>
      }
    />
  );
}
