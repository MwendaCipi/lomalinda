"use client";

import { resolveAttachmentUrl } from "@/components/announcement-attachment";
import { useDailyWord } from "@/hooks/use-daily-word";

/**
 * The day's thought, on the dashboard.
 *
 * The same word the popup carries, for the member who closed the popup — or
 * who opened straight onto a page the popup keeps off — and shaped like the
 * announcement card above it, so the dashboard reads as one body of notices
 * rather than a devotional bolted on beside them. It sits after the four
 * everyday cards: the week's business first, then what the church is
 * thinking on. A day nobody has written for draws nothing at all, which is
 * the one thing this card must never invent.
 */
export function DashboardThoughtOfTheDay() {
  const word = useDailyWord();
  if (!word) return null;

  return (
    <section
      aria-labelledby="thought-of-the-day"
      className="rounded-3xl border border-sand-line bg-white px-6 py-5 shadow-sm sm:px-8"
    >
      {/* The writer's face, where the church has one on file: the thought
          reads as written by a person, and the card is where their picture
          belongs — its top right corner, out of the way of the words. */}
      <div className="flex items-start justify-between gap-4">
        <h2 id="thought-of-the-day" className="text-lg font-bold leading-snug text-bark sm:text-xl">
          Thought of the Day
        </h2>
        {word.author_photo_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={resolveAttachmentUrl(word.author_photo_url)}
            alt={word.author_name ? `${word.author_name}'s profile picture` : ""}
            className="h-11 w-11 shrink-0 rounded-full border border-sand-line object-cover shadow-sm"
          />
        )}
      </div>
      <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-moss-mid">{word.text}</p>
      {word.author_name && (
        <p className="mt-3 text-xs font-semibold text-ember">— {word.author_name}</p>
      )}
    </section>
  );
}
