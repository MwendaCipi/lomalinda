"use client";

/**
 * A signed letter's public reading room — the page a recipient's link opens.
 *
 * The site exports statically, so the page is one file and the token rides
 * the URL's `?t=` query — the same shape the reset-password page reads.
 *
 * Anyone holding the link reads the letter in full, without an account,
 * sees it the way the paper prints it (letterhead-style sheet with the
 * reader's own address block), and answers the request: Accept it or turn
 * it down, with a comment for the desk. They can also open the signed PDF
 * itself. Nothing here identifies them except what they type.
 *
 * The token is the bearer: the server hands out only a letter that was
 * fully signed, and every endpoint here accepts it without an account.
 * Once they answer, the answer locks in — the desk reads it on the
 * letter's row in the register — and any member of that department sees it
 * the next time they open the letter.
 */

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CheckCheck, FileText } from "lucide-react";

import { showAlert } from "@/lib/alerts";
import { dayFirst } from "@/lib/dates";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

/** The letter as the reading endpoint hands it over, by token alone. */
type PublicLetter = {
  title: string;
  content: string;
  letter_date: string | null;
  department_name: string;
  requested_by_name: string;
  church_name: string;
  pastor_name: string | null;
  clerk_name: string | null;
  pastor_phone: string;
  clerk_phone: string;
  recipient_name: string;
  recipient_town: string;
  recipient_response: null | "accepted" | "turned_down";
  recipient_comment: string;
  responded_at: string | null;
};

function LetterReadingRoom() {
  const params = useSearchParams();
  const token = params.get("t") ?? "";
  const [letter, setLetter] = useState<PublicLetter | null>(null);
  const [error, setError] = useState("");
  // The answer being written: which way it goes, and any comment the
  // recipient adds for the desk to read.
  const [choice, setChoice] = useState<"accepted" | "turned_down" | "">("");
  const [comment, setComment] = useState("");
  const [sending, setSending] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void Promise.resolve().then(async () => {
      if (!token) {
        if (!cancelled) setError("No letter link was given. Open the link exactly as it was shared.");
        return;
      }
      try {
        const response = await fetch(`${API_URL}/api/members/department-letters/shared/${token}/`);
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          if (!cancelled) setError(data.detail || "This letter link is not open.");
          return;
        }
        if (!cancelled) {
          setLetter(data as PublicLetter);
          if (data.recipient_comment) setComment(data.recipient_comment);
        }
      } catch {
        if (!cancelled) setError("The letter could not be read right now. Try again.");
      }
    });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const openPdf = () => {
    if (pdfBusy || !token) return;
    setPdfBusy(true);
    window.open(`${API_URL}/api/members/department-letters/shared/${token}/pdf/`, "_blank", "noopener");
    setTimeout(() => setPdfBusy(false), 1200);
  };

  const respond = async (nextChoice: "accepted" | "turned_down") => {
    if (sending || !token || !letter) return;
    setSending(true);
    setChoice(nextChoice);
    try {
      const response = await fetch(`${API_URL}/api/members/department-letters/shared/${token}/respond/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ response: nextChoice, comment }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.response || data.detail || "The answer could not be recorded.");
      setLetter({ ...letter, recipient_response: nextChoice, recipient_comment: comment });
      showAlert(
        "Answer sent",
        `Your ${nextChoice === "accepted" ? "acceptance" : "response"} is with the desk that sent the letter.`,
        "success"
      );
    } catch (err) {
      setChoice("");
      showAlert("Could not send the answer", err instanceof Error ? err.message : "Try again.", "error");
    } finally {
      setSending(false);
    }
  };

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 sm:py-12">
      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-center">
          <h1 className="text-lg font-bold text-red-800">Letter not open</h1>
          <p className="mt-1 text-sm text-red-700">{error}</p>
          <p className="mt-3 text-xs text-red-600/80">
            Check the link you were sent, or ask the desk that shared the letter for a fresh one.
          </p>
        </div>
      ) : !letter ? (
        <div className="animate-pulse space-y-3 rounded-2xl border border-sand-line bg-white p-6">
          <div className="h-4 w-40 rounded bg-sand" />
          <div className="h-3 w-full rounded bg-sand" />
          <div className="h-3 w-5/6 rounded bg-sand" />
          <div className="h-3 w-4/6 rounded bg-sand" />
        </div>
      ) : (
        <>
          {/* The sheet itself: the church's name, the letter as written. */}
          <article className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-sand-line sm:p-10">
            <header className="border-b border-sand-line pb-4 text-center">
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-ember">{letter.church_name}</p>
            </header>

            {letter.recipient_name && (
              <p className="mt-4 text-sm text-bark">
                To:&nbsp;<span className="font-semibold">{letter.recipient_name}</span>
                {letter.recipient_town && <span className="text-moss"> · {letter.recipient_town}</span>}
              </p>
            )}

            <h1 className="mt-3 text-base font-bold uppercase text-bark">{letter.title}</h1>
            <p className="mt-0.5 text-xs text-moss">
              From {letter.department_name} · {letter.requested_by_name}
              {letter.letter_date ? ` · ${dayFirst(letter.letter_date)}` : ""}
            </p>

            <div className="mt-5 whitespace-pre-line text-sm leading-relaxed text-bark">{letter.content}</div>

            {/* The two pens, the way the paper closes: name, the signing gap
                between it and the office, and the office's own number. The
                printer lays the same block — clerk left, pastor right. */}
            <footer className="mt-8 border-t border-sand-line pt-4">
              <div className="grid grid-cols-1 gap-4 text-xs sm:grid-cols-2">
                {letter.clerk_name && (
                  <div>
                    <p className="font-semibold text-bark">{letter.clerk_name}</p>
                    <div className="h-10" aria-hidden="true" />
                    <p>Church Clerk</p>
                    {letter.clerk_phone && <p className="text-moss">{letter.clerk_phone}</p>}
                  </div>
                )}
                <div>
                  <p className="font-semibold text-bark">
                    {letter.pastor_name
                      ? /^(pr\.|pastor)/i.test(letter.pastor_name)
                        ? letter.pastor_name
                        : `Pr. ${letter.pastor_name}`
                      : "The church"}
                  </p>
                  <div className="h-10" aria-hidden="true" />
                  <p>{letter.pastor_name ? "Church Pastor" : "On behalf of the church"}</p>
                  {letter.pastor_phone && <p className="text-moss">{letter.pastor_phone}</p>}
                </div>
              </div>
            </footer>

            {/* Carry the sheet out as a signed PDF — printable, readable offline. */}
            <button
              type="button"
              onClick={openPdf}
              disabled={pdfBusy}
              className="mt-6 inline-flex items-center gap-1.5 rounded-xl border border-sand-mute px-4 py-2 text-xs font-semibold text-bark transition hover:border-ember hover:text-ember disabled:opacity-60"
            >
              <FileText className="h-4 w-4" />
              {pdfBusy ? "Opening…" : "Open / print the letter"}
            </button>
          </article>

          {/* The answer — read-only once given, editable until sent. */}
          <section className="mt-6 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-sand-line sm:p-6">
            {letter.recipient_response ? (
              <>
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-wide ${
                      letter.recipient_response === "accepted" ? "bg-green-100 text-green-800" : "bg-red-100 text-red-700"
                    }`}
                  >
                    <CheckCheck className="h-3.5 w-3.5" />
                    {letter.recipient_response === "accepted" ? "Request accepted" : "Request turned down"}
                  </span>
                  <span className="text-xs text-moss">
                    {letter.responded_at ? `· answered ${dayFirst(letter.responded_at)}` : ""}
                  </span>
                </div>
                {letter.recipient_comment && (
                  <p className="mt-3 whitespace-pre-line text-sm text-bark">
                    <span className="font-semibold">Your comment:</span> {letter.recipient_comment}
                  </p>
                )}
                <p className="mt-3 text-xs text-moss">
                  Your answer is with the desk that sent the letter. To change it, contact them — the desk can share a
                  fresh link if that is ever needed.
                </p>
              </>
            ) : (
              <>
                <h2 className="text-sm font-bold text-bark">Answer this request</h2>
                <p className="mt-0.5 text-xs text-moss">
                  The desk that sent this letter sees your answer — tell them yes or no, and anything they should know.
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => void respond("accepted")}
                    disabled={sending}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-green-700 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-green-800 disabled:opacity-60"
                  >
                    <CheckCheck className="h-4 w-4" />
                    {sending && choice === "accepted" ? "Sending…" : "Accept the request"}
                  </button>
                  <button
                    type="button"
                    onClick={() => void respond("turned_down")}
                    disabled={sending}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-ember px-4 py-2.5 text-sm font-bold text-white transition hover:bg-ember-deep disabled:opacity-60"
                  >
                    {sending && choice === "turned_down" ? "Sending…" : choice === "turned_down" ? "Sending…" : "Turn down the request"}
                  </button>
                </div>
                {choice !== "" && (
                  <textarea
                    value={comment}
                    onChange={(event) => setComment(event.target.value)}
                    rows={3}
                    placeholder="Anything the desk should know (optional)…"
                    className="mt-3 w-full rounded-xl border border-sand-mute px-3 py-2 text-sm outline-none focus:border-ember"
                    aria-label="Comment for the desk"
                  />
                )}
              </>
            )}
          </section>

          <p className="mt-4 text-center text-[11px] text-moss-faint">
            This link was shared by {letter.department_name} at {letter.church_name} — the letter above is the
            church&apos;s official word.
          </p>
        </>
      )}
    </main>
  );
}

export default function PublicLetterPage() {
  return (
    <Suspense fallback={<main className="px-4 py-8" />}>
      <LetterReadingRoom />
    </Suspense>
  );
}
