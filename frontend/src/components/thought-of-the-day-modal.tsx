"use client";

import { useCallback, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";

import { useDailyWord } from "@/hooks/use-daily-word";

/** The day a member has already closed, so one word pops once, not once a page. */
const DISMISSED_KEY = "daily_word_dismissed";

/**
 * Whether another dialog owns the screen.
 *
 * The church's announcements pop up on the same visit, and two overlays at
 * once is one too many: the notice the office needs answering is read first,
 * and the day's thought when the screen is free. Rather than reaching into the
 * announcement popup's own state — a component this one has no business
 * knowing — the thought watches the document for any other dialog, the app's
 * or one of SweetAlert's, and steps aside while one is on screen. Its own
 * dialog carries `data-thought-of-the-day`, so it never counts itself.
 *
 * The answer is a plain boolean held here rather than in React state, which is
 * what lets the watcher ignore the document's other traffic: body mutations
 * are constant, and a value that does not change re-renders nothing.
 */
let anotherDialogOpen = true;
const dialogListeners = new Set<() => void>();
let dialogObserver: MutationObserver | null = null;

function refreshDialogState() {
  const next = Boolean(
    document.querySelector('[role="dialog"][aria-modal="true"]:not([data-thought-of-the-day])')
  );
  if (next === anotherDialogOpen) return;
  anotherDialogOpen = next;
  dialogListeners.forEach((listener) => listener());
}

function subscribeToDialogs(listener: () => void) {
  dialogListeners.add(listener);
  if (!dialogObserver) {
    dialogObserver = new MutationObserver(refreshDialogState);
    dialogObserver.observe(document.body, { childList: true, subtree: true });
  }
  // Asked once the watch is already in place, so a popup that was on screen
  // before this mounted cannot slip past between the look and the watching.
  requestAnimationFrame(refreshDialogState);
  return () => {
    dialogListeners.delete(listener);
    if (dialogListeners.size === 0 && dialogObserver) {
      dialogObserver.disconnect();
      dialogObserver = null;
      anotherDialogOpen = true;
    }
  };
}

const serverSaysBlocked = () => true;

/**
 * The day's thought, popped once for a signed-in member.
 *
 * Titled for what it is — the desk calls it the daily word, the church reads
 * it as a thought for the day — and carrying the word itself and who wrote it,
 * nothing more: no reply box, no action to take, just the reading. Closing it
 * records the day, so it does not follow the member from page to page or
 * reappear on the next navigation; tomorrow's word is a new day and pops
 * afresh.
 *
 * It keeps to the announcement popup's own territory: not on the landing page
 * (the website's front door has its own invitation to make), and never over
 * another dialog.
 */
export function ThoughtOfTheDayModal() {
  const pathname = usePathname();
  const word = useDailyWord();
  const blocked = useSyncExternalStore(subscribeToDialogs, () => anotherDialogOpen, serverSaysBlocked);

  const dismiss = useCallback(() => {
    if (!word) return;
    try {
      localStorage.setItem(DISMISSED_KEY, word.date);
    } catch {
      // Storage switched off: the popup simply asks again on the next page.
    }
    // The close is its own event, not a route change: nothing else re-renders.
    window.dispatchEvent(new CustomEvent("daily-word-dismissed"));
  }, [word]);

  // The day the member closed, read straight from storage and re-read when the
  // popup closes itself. A missing reader (storage off) means nothing is
  // remembered, which is the same answer as "no day closed yet".
  const dismissedDay = useSyncExternalStore(
    subscribeToDismissals,
    readDismissedDay,
    () => ""
  );

  if (!word) return null;
  if (pathname === "/") return null;
  if (blocked) return null;
  if (dismissedDay === word.date) return null;

  return (
    <div
      aria-modal="true"
      role="dialog"
      aria-labelledby="thought-of-the-day-title"
      data-thought-of-the-day=""
      className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-black/70 p-4 backdrop-blur-sm"
    >
      <div className="relative w-full max-w-lg rounded-3xl border border-sand-line bg-white p-6 shadow-2xl sm:p-8">
        <h2 id="thought-of-the-day-title" className="text-xl font-bold text-bark sm:text-2xl">
          Thought of the Day
        </h2>
        <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-moss-mid">{word.text}</p>
        {word.author_name && (
          <p className="mt-3 text-xs font-semibold text-ember">— {word.author_name}</p>
        )}

        <div className="mt-6 flex justify-end">
          <button
            type="button"
            onClick={dismiss}
            className="rounded-2xl bg-ember px-6 py-3.5 text-sm font-semibold text-white shadow-md transition hover:bg-ember-dark"
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}

/** Which day the member last closed — one string, so the store never spins. */
function readDismissedDay(): string {
  try {
    return localStorage.getItem(DISMISSED_KEY) ?? "";
  } catch {
    return "";
  }
}

function subscribeToDismissals(onChange: () => void) {
  window.addEventListener("daily-word-dismissed", onChange);
  // Closing it in one tab is closing it everywhere on this device.
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener("daily-word-dismissed", onChange);
    window.removeEventListener("storage", onChange);
  };
}