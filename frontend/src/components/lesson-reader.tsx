"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  BookOpen,
  Calendar,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Copy,
  Library,
  NotebookPen,
  RotateCcw,
  Sparkles,
  X,
} from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";
const ADVENTECH_BASE = "https://sabbath-school.adventech.io/api/v2";

/** A day's saved note, readable even with storage switched off. */
function readNote(key: string) {
  if (!key) return "";
  try {
    return localStorage.getItem(key) ?? "";
  } catch {
    return "";
  }
}

export type LessonDay = {
  id: string;
  title: string;
  date: string;
  content: string;
  bible: Array<{
    name?: string;
    verses?: Record<string, string>;
  }>;
};

export type LessonSummary = {
  id: string;
  title: string;
  start_date: string;
  end_date: string;
  cover?: string;
};

export type LessonPayload = {
  quarterly: {
    id: string;
    title: string;
    human_date?: string;
    description?: string;
  };
  lesson: {
    id: string;
    index: string;
    title: string;
    start_date: string;
    end_date: string;
    cover?: string;
    pdf?: string;
  };
  lessons: LessonSummary[];
  days: LessonDay[];
};

/**
 * Standard Sabbath School day names mapped from Day IDs.
 * Sabbath School lessons open on Sabbath afternoon and conclude on Friday.
 */
function getDayMeta(dayId: string): { name: string; short: string; isStudy: boolean } {
  switch (dayId) {
    case "01":
      return { name: "Sabbath", short: "Sab", isStudy: true };
    case "02":
      return { name: "Sunday", short: "Sun", isStudy: true };
    case "03":
      return { name: "Monday", short: "Mon", isStudy: true };
    case "04":
      return { name: "Tuesday", short: "Tue", isStudy: true };
    case "05":
      return { name: "Wednesday", short: "Wed", isStudy: true };
    case "06":
      return { name: "Thursday", short: "Thu", isStudy: true };
    case "07":
      return { name: "Friday", short: "Fri", isStudy: true };
    case "inside-story":
      return { name: "Inside Story", short: "Story", isStudy: false };
    case "teacher-comments":
      return { name: "Teachers", short: "Teachers", isStudy: false };
    case "hope-ss":
      return { name: "Hope SS", short: "Hope", isStudy: false };
    default:
      return { name: dayId, short: dayId, isStudy: true };
  }
}

/** Formats "14/11/2026" or "2026-11-14" into "November 14, 2026". */
function formatHumanDate(raw: string): string {
  if (!raw) return "";
  const parts = raw.split(/[-/]/);
  if (parts.length === 3) {
    let year: number, month: number, day: number;
    if (parts[0].length === 4) {
      year = parseInt(parts[0], 10);
      month = parseInt(parts[1], 10) - 1;
      day = parseInt(parts[2], 10);
    } else {
      day = parseInt(parts[0], 10);
      month = parseInt(parts[1], 10) - 1;
      year = parseInt(parts[2], 10);
    }
    const d = new Date(year, month, day);
    if (!isNaN(d.getTime())) {
      return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    }
  }
  return raw;
}

/** Determines today's day of the week in Sabbath School order (01=Sat, 02=Sun, ... 07=Fri). */
function getDefaultDayId(): string {
  if (typeof window === "undefined") return "01";
  const day = new Date().getDay(); // 0 is Sunday, 6 is Saturday
  if (day === 6) return "01"; // Saturday / Sabbath
  if (day === 0) return "02"; // Sunday
  if (day === 1) return "03"; // Monday
  if (day === 2) return "04"; // Tuesday
  if (day === 3) return "05"; // Wednesday
  if (day === 4) return "06"; // Thursday
  return "07"; // Friday
}

/** Client direct fallback to Adventech if local backend is temporarily unreachable. */
async function fetchDirectFromAdventech(quarterId?: string, lessonId?: string): Promise<LessonPayload> {
  const qListRes = await fetch(`${ADVENTECH_BASE}/en/quarterlies/index.json`);
  const qList = await qListRes.json();
  const adultQ = quarterId
    ? qList.find((item: { id: string }) => item.id === quarterId)
    : qList.find((item: { quarterly_group?: { name?: string } }) => item.quarterly_group?.name === "Standard Adult") || qList[0];

  const qRes = await fetch(`${ADVENTECH_BASE}/en/quarterlies/${adultQ.id}/index.json`);
  const qData = await qRes.json();
  const lessons: LessonSummary[] = qData.lessons || [];

  const targetLesson = lessonId
    ? lessons.find((l) => String(l.id).padStart(2, "0") === String(lessonId).padStart(2, "0")) || lessons[0]
    : lessons[0];

  const lRes = await fetch(`${ADVENTECH_BASE}/en/quarterlies/${adultQ.id}/lessons/${targetLesson.id}/index.json`);
  const lData = await lRes.json();
  const rawDays: Array<{ id: string; title: string; date: string }> = lData.days || [];

  const days: LessonDay[] = await Promise.all(
    rawDays.map(async (d) => {
      try {
        const readRes = await fetch(
          `${ADVENTECH_BASE}/en/quarterlies/${adultQ.id}/lessons/${targetLesson.id}/days/${d.id}/read/index.json`
        );
        const readData = await readRes.json();
        return {
          id: d.id,
          title: d.title || "",
          date: d.date || "",
          content: readData.content || "",
          bible: readData.bible || [],
        };
      } catch {
        return { id: d.id, title: d.title || "", date: d.date || "", content: "", bible: [] };
      }
    })
  );

  return {
    quarterly: {
      id: adultQ.id,
      title: qData.title || adultQ.title || "Sabbath School Lesson",
      human_date: qData.human_date,
      description: qData.description,
    },
    lesson: {
      id: String(targetLesson.id).padStart(2, "0"),
      index: `en-${adultQ.id}-${String(targetLesson.id).padStart(2, "0")}`,
      title: lData.lesson?.title || targetLesson.title,
      start_date: targetLesson.start_date,
      end_date: targetLesson.end_date,
      cover: targetLesson.cover,
      pdf: lData.lesson?.pdf,
    },
    lessons,
    days,
  };
}

export function LessonReader({
  initialLesson,
  initialDay,
}: {
  initialLesson?: string;
  initialDay?: string;
}) {
  const [data, setData] = useState<LessonPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [activeDayId, setActiveDayId] = useState<string>(initialDay || getDefaultDayId());
  const [activeLessonId, setActiveLessonId] = useState<string>(initialLesson || "");
  const [isLessonMenuOpen, setIsLessonMenuOpen] = useState(false);

  // Note-taking state. The draft carries the storage key it was read for, so a
  // newly opened day is read during render instead of being copied into state
  // from an effect — the box never shows yesterday's note for a frame.
  const [note, setNote] = useState<{ key: string; text: string; status: "idle" | "saving" | "saved" }>({
    key: "",
    text: "",
    status: "idle",
  });
  const [copiedNote, setCopiedNote] = useState(false);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Scripture popover state
  const [activeScripture, setActiveScripture] = useState<{
    reference: string;
    html: string;
  } | null>(null);

  // 1. Fetch lesson payload from backend (with Adventech fallback)
  const loadLesson = useCallback(async (lessonId?: string) => {
    setLoading(true);
    setError(null);
    const query = lessonId ? `?lesson=${encodeURIComponent(lessonId)}` : "";
    try {
      const res = await fetch(`${API_URL}/api/members/lesson/weekly/${query}`);
      if (!res.ok) throw new Error(`Server returned ${res.status}`);
      const payload: LessonPayload = await res.json();
      setData(payload);
      setActiveLessonId(payload.lesson.id);

      // Cache for offline resilience
      try {
        localStorage.setItem(`sda-lesson:cache:${payload.lesson.index}`, JSON.stringify(payload));
      } catch {
        // local storage quota or disabled
      }
    } catch {
      // Try local offline cache first
      let cachedLoaded = false;
      try {
        const cachedKey = Object.keys(localStorage).find((k) => k.startsWith("sda-lesson:cache:"));
        if (cachedKey) {
          const cachedJson = localStorage.getItem(cachedKey);
          if (cachedJson) {
            setData(JSON.parse(cachedJson));
            cachedLoaded = true;
          }
        }
      } catch {
        // ignore
      }

      // If no cache, try direct Adventech fallback
      if (!cachedLoaded) {
        try {
          const directData = await fetchDirectFromAdventech(undefined, lessonId);
          setData(directData);
          setActiveLessonId(directData.lesson.id);
        } catch {
          setError("Unable to load the Sabbath School lesson. Please check your internet connection.");
        }
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Deferred by a tick: loadLesson raises the loading flags before it awaits
    // anything, and an effect should not set state on its first pass.
    const timer = setTimeout(() => void loadLesson(initialLesson), 0);
    return () => clearTimeout(timer);
  }, [loadLesson, initialLesson]);

  // Keep URL parameters in sync
  useEffect(() => {
    if (typeof window === "undefined" || !data) return;
    const url = new URL(window.location.href);
    if (activeLessonId) url.searchParams.set("lesson", activeLessonId);
    if (activeDayId) url.searchParams.set("day", activeDayId);
    window.history.replaceState({}, "", url.toString());
  }, [data, activeLessonId, activeDayId]);

  // Selected Day
  const currentDay = useMemo(() => {
    if (!data?.days?.length) return null;
    return data.days.find((d) => d.id === activeDayId) || data.days[0];
  }, [data, activeDayId]);

  // 2. Note Taking: Load saved note whenever day or lesson changes
  const noteStorageKey = useMemo(() => {
    if (!data || !currentDay) return "";
    return `sda-lesson:note:${data.lesson.index}:${currentDay.id}`;
  }, [data, currentDay]);

  if (note.key !== noteStorageKey) {
    setNote({ key: noteStorageKey, text: readNote(noteStorageKey), status: "idle" });
  }
  const noteDraft = note.key === noteStorageKey ? note.text : "";
  const saveStatus = note.status;

  // Handle note change with debounced save & optional server sync
  const handleNoteChange = (text: string) => {
    setNote((previous) => ({ ...previous, text, status: "saving" }));

    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      if (noteStorageKey) {
        try {
          localStorage.setItem(noteStorageKey, text);
        } catch {
          // ignore
        }
      }

      // If user is authenticated, sync to server in background
      if (data && currentDay && typeof window !== "undefined") {
        const token = localStorage.getItem("token") || localStorage.getItem("access_token");
        if (token) {
          fetch(`${API_URL}/api/members/lesson/notes/`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              lesson_index: data.lesson.index,
              day_id: currentDay.id,
              note: text,
            }),
          }).catch(() => {
            // Keep local copy even if network sync fails
          });
        }
      }

      setNote((previous) => ({ ...previous, status: "saved" }));
    }, 400);
  };

  const handleCopyNote = async () => {
    if (!noteDraft.trim()) return;
    try {
      await navigator.clipboard.writeText(noteDraft);
      setCopiedNote(true);
      setTimeout(() => setCopiedNote(false), 2000);
    } catch {
      // ignore
    }
  };

  const handleClearNote = () => {
    handleNoteChange("");
  };

  // 3. Intercept scripture links in HTML to show embedded bible popup
  const handleContentClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    const verseAnchor = target.closest("a.verse") as HTMLAnchorElement | null;
    if (!verseAnchor) return;

    e.preventDefault();
    const verseKey = verseAnchor.getAttribute("verse") || verseAnchor.innerText.trim();
    const reference = verseAnchor.innerText.trim();

    // Search in currentDay.bible
    let scriptureHtml = "";
    if (currentDay?.bible) {
      for (const bGroup of currentDay.bible) {
        if (!bGroup.verses) continue;
        for (const [key, html] of Object.entries(bGroup.verses)) {
          if (key.includes(verseKey) || verseKey.includes(key)) {
            scriptureHtml = html;
            break;
          }
        }
        if (scriptureHtml) break;
      }
    }

    if (!scriptureHtml) {
      // Fallback message with link to Bible Reader
      scriptureHtml = `<p>Read <strong>${reference}</strong> in the church's in-app Bible reader.</p>`;
    }

    setActiveScripture({ reference, html: scriptureHtml });
  };

  // Day navigation helpers
  const dayIndices = data?.days?.map((d) => d.id) || [];
  const currentDayIndex = dayIndices.indexOf(activeDayId);
  const prevDayId = currentDayIndex > 0 ? dayIndices[currentDayIndex - 1] : null;
  const nextDayId = currentDayIndex >= 0 && currentDayIndex < dayIndices.length - 1 ? dayIndices[currentDayIndex + 1] : null;

  if (loading && !data) {
    return (
      <div className="rounded-2xl border border-sand-line bg-white/60 p-12 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-sand text-ember animate-pulse">
          <BookOpen className="h-6 w-6" />
        </div>
        <p className="mt-4 text-base font-semibold text-bark">Opening Sabbath School Lesson...</p>
        <p className="mt-1 text-xs text-moss">Fetching daily studies and scripture texts</p>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="rounded-2xl border border-dashed border-sand-line bg-white p-8 text-center">
        <p className="text-sm font-semibold text-bark">Could not load lesson</p>
        <p className="mt-1 text-xs text-moss">{error}</p>
        <button
          onClick={() => loadLesson(activeLessonId)}
          className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-ember px-4 py-2 text-xs font-semibold text-white hover:bg-ember/90 transition shadow-sm"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          <span>Try Again</span>
        </button>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="space-y-6">
      {/* Top Header Card: Quarter & Lesson Selector */}
      <section className="rounded-2xl border border-sand-line bg-white p-5 sm:p-6 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 flex-1">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-sand px-3 py-1 text-xs font-semibold text-ember">
              <Sparkles className="h-3.5 w-3.5" />
              <span>{data.quarterly.title}</span>
            </span>
            <h1 className="mt-2 text-xl font-bold tracking-tight text-bark sm:text-2xl font-serif">
              Lesson {parseInt(data.lesson.id, 10)}: {data.lesson.title}
            </h1>
            <p className="mt-1 flex items-center gap-1.5 text-xs text-moss">
              <Calendar className="h-3.5 w-3.5 shrink-0" />
              <span>
                {formatHumanDate(data.lesson.start_date)} &ndash; {formatHumanDate(data.lesson.end_date)}
              </span>
            </p>
          </div>

          {/* Lesson Picker Dropdown */}
          <div className="relative shrink-0">
            <button
              onClick={() => setIsLessonMenuOpen((prev) => !prev)}
              className="inline-flex items-center gap-2 rounded-xl border border-sand-line bg-sand/60 px-3.5 py-2 text-xs font-bold text-bark hover:border-ember/50 transition"
              aria-expanded={isLessonMenuOpen}
            >
              <BookOpen className="h-4 w-4 text-ember" />
              <span>Lesson {parseInt(data.lesson.id, 10)} of {data.lessons.length}</span>
              <ChevronDown className="h-3.5 w-3.5 text-moss" />
            </button>

            {isLessonMenuOpen && (
              <div className="absolute right-0 top-full z-30 mt-2 w-72 max-h-80 overflow-y-auto rounded-2xl border border-sand-line bg-white p-2 shadow-xl">
                <p className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-moss">
                  Lessons in this Quarter
                </p>
                <div className="space-y-1">
                  {data.lessons.map((l) => {
                    const isSelected = String(l.id).padStart(2, "0") === data.lesson.id;
                    return (
                      <button
                        key={l.id}
                        onClick={() => {
                          setIsLessonMenuOpen(false);
                          loadLesson(l.id);
                        }}
                        className={`w-full text-left rounded-xl px-3 py-2 text-xs transition ${
                          isSelected
                            ? "bg-sand font-bold text-ember"
                            : "text-bark hover:bg-sand/40"
                        }`}
                      >
                        <span className="block font-semibold">
                          Lesson {parseInt(l.id, 10)}: {l.title}
                        </span>
                        <span className="block text-[10px] text-moss mt-0.5">
                          {formatHumanDate(l.start_date)} &ndash; {formatHumanDate(l.end_date)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Days Navigation Strip */}
        <nav className="mt-6 flex flex-wrap gap-1.5 border-t border-sand-line/70 pt-4" aria-label="Days of the week">
          {data.days.map((day) => {
            const meta = getDayMeta(day.id);
            const isSelected = day.id === activeDayId;
            return (
              <button
                key={day.id}
                onClick={() => setActiveDayId(day.id)}
                className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition ${
                  isSelected
                    ? "bg-bark text-white shadow-sm"
                    : "bg-sand/70 text-moss hover:bg-sand hover:text-bark"
                }`}
              >
                <span>{meta.name}</span>
                {day.date && (
                  <span className={`text-[10px] opacity-75 ${isSelected ? "text-sand" : "text-moss"}`}>
                    {day.date.split(/[-/]/)[0]}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </section>

      {/* Main Study Content Area */}
      {currentDay && (
        <article className="rounded-2xl border border-sand-line bg-white p-6 sm:p-8 shadow-sm">
          {/* Day Title & Header */}
          <div className="border-b border-sand-line pb-4">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-ember">
                {getDayMeta(currentDay.id).name} Study
              </span>
              {currentDay.date && (
                <span className="text-xs text-moss">{formatHumanDate(currentDay.date)}</span>
              )}
            </div>
            <h2 className="mt-1 text-xl font-bold tracking-tight text-bark sm:text-2xl font-serif">
              {currentDay.title}
            </h2>
          </div>

          {/* Formatted HTML Content */}
          <div
            className="lesson-prose mt-6 text-bark"
            onClick={handleContentClick}
            dangerouslySetInnerHTML={{ __html: currentDay.content }}
          />

          {/* Next / Prev Day Footer Buttons */}
          <div className="mt-8 flex items-center justify-between border-t border-sand-line pt-6">
            {prevDayId ? (
              <button
                onClick={() => setActiveDayId(prevDayId)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-sand-line bg-sand/40 px-3.5 py-2 text-xs font-semibold text-bark hover:border-ember/50 hover:bg-sand transition"
              >
                <ChevronLeft className="h-4 w-4" />
                <span>{getDayMeta(prevDayId).name}</span>
              </button>
            ) : <div />}

            {nextDayId ? (
              <button
                onClick={() => setActiveDayId(nextDayId)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-sand-line bg-sand/40 px-3.5 py-2 text-xs font-semibold text-bark hover:border-ember/50 hover:bg-sand transition"
              >
                <span>{getDayMeta(nextDayId).name}</span>
                <ChevronRight className="h-4 w-4" />
              </button>
            ) : <div />}
          </div>
        </article>
      )}

      {/* Per-Day Note Taking Area */}
      {currentDay && (
        <section className="rounded-2xl border border-sand-line bg-sand/30 p-5 sm:p-6 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-sand text-ember">
                <NotebookPen className="h-4 w-4" />
              </span>
              <div>
                <h3 className="text-sm font-bold text-bark">
                  My Study &amp; Discussion Notes &middot; {getDayMeta(currentDay.id).name}
                </h3>
                <p className="text-[11px] text-moss">
                  Personal reflections or questions for Sabbath School class.
                </p>
              </div>
            </div>

            {/* Note Status & Actions */}
            <div className="flex items-center gap-2 text-xs">
              {saveStatus === "saving" && (
                <span className="text-moss italic text-[11px]">Saving...</span>
              )}
              {saveStatus === "saved" && (
                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700">
                  <Check className="h-3 w-3" />
                  <span>Saved on this device</span>
                </span>
              )}
              {noteDraft && (
                <button
                  onClick={handleCopyNote}
                  className="inline-flex items-center gap-1 rounded-lg border border-sand-line bg-white px-2.5 py-1 text-[11px] font-semibold text-bark hover:border-ember/40 transition"
                  title="Copy note"
                >
                  <Copy className="h-3 w-3 text-moss" />
                  <span>{copiedNote ? "Copied!" : "Copy"}</span>
                </button>
              )}
              {noteDraft && (
                <button
                  onClick={handleClearNote}
                  className="text-[11px] text-moss hover:text-ember transition px-1"
                >
                  Clear
                </button>
              )}
            </div>
          </div>

          <div className="mt-3">
            <textarea
              value={noteDraft}
              onChange={(e) => handleNoteChange(e.target.value)}
              placeholder={`Write your thoughts or discussion points for ${getDayMeta(currentDay.id).name}...`}
              rows={4}
              className="w-full resize-y rounded-xl border border-sand-line bg-white p-3.5 text-sm text-bark placeholder:text-moss-faint focus:border-ember focus:outline-none focus:ring-1 focus:ring-ember shadow-sm"
            />
          </div>
        </section>
      )}

      {/* Bible Verse Popover Modal */}
      {activeScripture && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-bark/40 p-4 backdrop-blur-sm animate-in fade-in duration-200"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-lg rounded-2xl border border-sand-line bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-sand-line pb-3">
              <div className="flex items-center gap-2">
                <BookOpen className="h-4 w-4 text-ember" />
                <h4 className="text-sm font-bold text-bark">{activeScripture.reference}</h4>
              </div>
              <button
                onClick={() => setActiveScripture(null)}
                className="rounded-lg p-1 text-moss hover:bg-sand hover:text-bark transition"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div
              className="lesson-prose max-h-72 overflow-y-auto py-4 text-sm text-bark leading-relaxed"
              dangerouslySetInnerHTML={{ __html: activeScripture.html }}
            />

            <div className="flex items-center justify-between border-t border-sand-line pt-3">
              <Link
                href="/materials/bible/read"
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-ember hover:underline"
              >
                <Library className="h-3.5 w-3.5" />
                <span>Open in Bible Reader</span>
              </Link>
              <button
                onClick={() => setActiveScripture(null)}
                className="rounded-xl bg-sand px-3 py-1.5 text-xs font-semibold text-bark hover:bg-sand-deep transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Prose and Callout Styling */}
      <style jsx global>{`
        .lesson-prose blockquote {
          margin: 1.25rem 0;
          padding: 1rem 1.25rem;
          border-left: 4px solid var(--color-ember, #b36b3c);
          background-color: var(--color-sand, #f7f4ee);
          border-radius: 0 0.75rem 0.75rem 0;
          font-style: italic;
          color: var(--color-bark, #26352f);
        }
        .lesson-prose blockquote p {
          margin: 0.25rem 0;
        }
        .lesson-prose h3,
        .lesson-prose h4 {
          font-family: serif;
          font-weight: 700;
          color: var(--color-bark, #26352f);
          margin-top: 1.5rem;
          margin-bottom: 0.5rem;
        }
        .lesson-prose h3 {
          font-size: 1.15rem;
        }
        .lesson-prose h4 {
          font-size: 1rem;
        }
        .lesson-prose p {
          line-height: 1.75;
          margin-top: 0.75rem;
          margin-bottom: 0.75rem;
          font-size: 0.95rem;
          color: var(--color-bark, #26352f);
        }
        .lesson-prose code {
          background-color: var(--color-sand, #f7f4ee);
          padding: 0.125rem 0.375rem;
          border-radius: 0.375rem;
          font-size: 0.9em;
          font-family: inherit;
        }
        .lesson-prose a.verse {
          color: var(--color-ember, #b36b3c);
          font-weight: 600;
          text-decoration: underline;
          text-decoration-color: rgba(179, 107, 60, 0.4);
          text-underline-offset: 3px;
          cursor: pointer;
        }
        .lesson-prose a.verse:hover {
          text-decoration-color: var(--color-ember, #b36b3c);
        }
      `}</style>
    </div>
  );
}
