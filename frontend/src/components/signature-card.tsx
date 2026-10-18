"use client";

import { useRef, useState } from "react";
import { showAlert } from "@/lib/alerts";
import { resolveAttachmentUrl } from "@/components/announcement-attachment";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

/** The pad's own resolution: wide enough that a line drawn at phone size
    prints crisply at 45 mm on paper, and fixed so the saved picture never
    depends on the screen it was drawn on. */
const PAD_WIDTH = 900;
const PAD_HEIGHT = 280;

/** The officer's signature, kept on their profile and printed on every
    receipt and report their office signs.

    Two ways in, because officers come to it two ways: upload the slip they
    sign cheques with, or draw it here with a finger or a stylus. Whichever
    arrives, the church keeps one PNG — a drawn signature with its
    transparent page, so it prints as ink on the line — and every receipt
    and report the office signs carries it. Taking it down returns the paper
    to its blank ruled line. */
export function SignatureCard({
  token,
  office,
  signatureUrl: initialUrl,
}: {
  token: string | null;
  office: string;
  signatureUrl: string;
}) {
  // What this card has saved since it opened; until then the profile's own
  // read answers, so the card never starts out disagreeing with /me/.
  const [savedUrl, setSavedUrl] = useState<string | null>(null);
  const signatureUrl = savedUrl ?? initialUrl;
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [padOpen, setPadOpen] = useState(false);
  const [inked, setInked] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);
  const lastPoint = useRef<{ x: number; y: number } | null>(null);

  function pointOn(event: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    // The pad is drawn at a fixed resolution and shown at whatever width the
    // card has, so every point is scaled back into the canvas's own space.
    return {
      x: ((event.clientX - rect.left) / rect.width) * canvas.width,
      y: ((event.clientY - rect.top) / rect.height) * canvas.height,
    };
  }

  function startStroke(event: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    try {
      canvas.setPointerCapture(event.pointerId);
    } catch {
      // A pointer the browser has already let go of cannot be captured;
      // the stroke still draws, it simply stops at the edge of the pad.
    }
    drawing.current = true;
    const point = pointOn(event);
    lastPoint.current = point;
    context.strokeStyle = "#1c2a24";
    context.lineWidth = 3.6;
    context.lineCap = "round";
    context.lineJoin = "round";
    // A dot for a tap, so a flicked pen still leaves its mark.
    context.beginPath();
    context.moveTo(point.x, point.y);
    context.lineTo(point.x + 0.1, point.y + 0.1);
    context.stroke();
    setInked(true);
  }

  function continueStroke(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    const point = pointOn(event);
    const previous = lastPoint.current ?? point;
    context.beginPath();
    context.moveTo(previous.x, previous.y);
    context.lineTo(point.x, point.y);
    context.stroke();
    lastPoint.current = point;
  }

  function endStroke(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    drawing.current = false;
    lastPoint.current = null;
    try {
      canvasRef.current?.releasePointerCapture(event.pointerId);
    } catch {
      // The pointer was already released by the browser — nothing to undo.
    }
  }

  function clearPad() {
    const canvas = canvasRef.current;
    canvas?.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
    setInked(false);
  }

  async function post(body: FormData | string, headers: Record<string, string>) {
    if (!token) return;
    setSaving(true);
    setMessage("");
    try {
      const response = await fetch(`${API_URL}/api/members/me/signature/`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, ...headers },
        body,
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(
          data?.signature || data?.detail || "Your signature could not be saved.",
        );
      }
      const url = typeof data?.signature_url === "string" ? data.signature_url : "";
      setSavedUrl(url);
      setPadOpen(false);
      setInked(false);
      const saved = "Your signature has been saved — the receipts your office signs now carry it.";
      setMessage(saved);
      showAlert("Signature saved", saved, "success");
    } catch (error) {
      const failed = error instanceof Error ? error.message : "Your signature could not be saved.";
      setMessage(failed);
      showAlert("Not saved", failed, "error");
    } finally {
      setSaving(false);
    }
  }

  function saveUpload(file: File | null) {
    if (!file) return;
    const body = new FormData();
    body.append("signature", file);
    void post(body, {});
  }

  function saveDrawing() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (!inked) {
      setMessage("Draw your signature on the line first.");
      return;
    }
    void post(
      JSON.stringify({ signature_data: canvas.toDataURL("image/png") }),
      { "Content-Type": "application/json" },
    );
  }

  async function remove() {
    if (!token) return;
    setSaving(true);
    setMessage("");
    try {
      const response = await fetch(`${API_URL}/api/members/me/signature/`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.detail || "Your signature could not be removed.");
      setSavedUrl("");
      const removed = "Your signature has been removed; the receipts keep their blank line.";
      setMessage(removed);
      showAlert("Signature removed", removed, "success");
    } catch (error) {
      const failed = error instanceof Error ? error.message : "Your signature could not be removed.";
      setMessage(failed);
      showAlert("Not removed", failed, "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-sand-line">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-xl font-semibold">Your signature</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-moss">
            You sign the church&apos;s paper as {office || "an officer"}. Save your signature once
            here and every receipt and report your office signs comes off the printer with it on
            the line.
          </p>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-5">
        {signatureUrl ? (
          <div className="flex h-20 w-full max-w-xs items-end justify-center rounded-2xl border border-sand-line bg-sand/40 px-4 pb-2">
            {/* Plain img: the signature is a same-origin upload, shown the
                way every other picture in the app is. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={resolveAttachmentUrl(signatureUrl)}
              alt="Your saved signature"
              className="max-h-[52px] w-full object-contain object-bottom"
            />
          </div>
        ) : (
          <p className="text-sm text-moss">No signature saved yet.</p>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <label
            className={`cursor-pointer rounded-full bg-sage px-5 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 ${
              saving ? "opacity-60" : ""
            }`}
          >
            {saving ? "Saving..." : signatureUrl ? "Replace" : "Upload"}
            <input
              type="file"
              accept="image/*"
              className="sr-only"
              disabled={saving}
              onChange={(event) => {
                const file = event.target.files?.[0] ?? null;
                // Clearing lets the same picture be re-picked after a failed
                // attempt, instead of the input swallowing the change.
                event.target.value = "";
                saveUpload(file);
              }}
            />
          </label>
          <button
            type="button"
            disabled={saving}
            onClick={() => {
              // Each opening starts on a blank pad: the fresh canvas is empty
              // already, so only the card's own state has to forget the last
              // stroke.
              setPadOpen((open) => !open);
              setInked(false);
              setMessage("");
            }}
            className="rounded-full bg-bark px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-ember disabled:opacity-60"
          >
            {padOpen ? "Close pad" : "Draw it"}
          </button>
          {signatureUrl && (
            <button
              type="button"
              disabled={saving}
              onClick={() => void remove()}
              className="rounded-full border border-sand-line px-5 py-2.5 text-sm font-semibold text-moss transition hover:border-ember hover:text-ember disabled:opacity-60"
            >
              Remove
            </button>
          )}
        </div>
      </div>

      {padOpen && (
        <div className="mt-5">
          <p className="text-sm text-moss">Sign on the line with a finger, stylus or the mouse.</p>
          <div className="mt-2 overflow-hidden rounded-2xl border border-sand-line bg-sand/40">
            <canvas
              ref={canvasRef}
              width={PAD_WIDTH}
              height={PAD_HEIGHT}
              aria-label="Signature pad"
              className="block h-auto w-full touch-none"
              onPointerDown={startStroke}
              onPointerMove={continueStroke}
              onPointerUp={endStroke}
              onPointerLeave={endStroke}
              onPointerCancel={endStroke}
            />
            <div className="mx-6 mb-4 border-t border-dashed border-sand-line" />
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={saving || !inked}
              onClick={saveDrawing}
              className="rounded-full bg-ember px-5 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save signature"}
            </button>
            <button
              type="button"
              disabled={saving || !inked}
              onClick={clearPad}
              className="rounded-full border border-sand-line px-5 py-2.5 text-sm font-semibold text-moss transition hover:border-ember hover:text-ember disabled:opacity-50"
            >
              Clear
            </button>
          </div>
        </div>
      )}

      {message && <p className="mt-3 text-sm text-moss">{message}</p>}
    </section>
  );
}
