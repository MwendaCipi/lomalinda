"use client";

import { useEffect, useState } from "react";
import { ChevronRight, Download, FileText, Maximize2, Share2, X } from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

const IMAGE_PATTERN = /\.(png|jpe?g|gif|webp|avif|svg|bmp|heic|heif)$/i;

export function resolveAttachmentUrl(attachment: string): string {
  return attachment.startsWith("/") ? `${API_URL}${attachment}` : attachment;
}

export function isImageAttachment(...values: Array<string | null | undefined>): boolean {
  return values.some((value) => Boolean(value && IMAGE_PATTERN.test(value)));
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const DOCUMENT_TILES: Array<{ pattern: RegExp; tile: string }> = [
  { pattern: /^pdf$/i, tile: "bg-red-500" },
  { pattern: /^(doc|docx|rtf|odt)$/i, tile: "bg-blue-600" },
  { pattern: /^(xls|xlsx|csv|ods)$/i, tile: "bg-emerald-600" },
  { pattern: /^(ppt|pptx|odp)$/i, tile: "bg-orange-500" },
  { pattern: /^(zip|rar|7z|tar|gz)$/i, tile: "bg-slate-600" },
  { pattern: /^(txt|md)$/i, tile: "bg-teal-600" },
];

interface AnnouncementAttachmentProps {
  attachment?: string | null;
  name?: string | null;
  size?: number | null;
  /** Smaller preview for dense surfaces like tables and list rows. */
  compact?: boolean;
  /** Set false when the block already sits inside a parent link. */
  linked?: boolean;
  className?: string;
}

function nativeShareAvailable(): boolean {
  return (
    typeof navigator !== "undefined" &&
    typeof navigator.share === "function" &&
    typeof navigator.canShare === "function"
  );
}

/**
 * Renders an announcement attachment the way WhatsApp renders shares:
 * photos show as a visible inline preview that opens in an in-app
 * full-screen viewer (never a new tab — closing the viewer never exits
 * the app), with a Share button that hands the file to the device's
 * native share sheet so it can land in the photo gallery. Everything
 * else becomes a document card — colored type icon, file name,
 * "PDF · 1.4 MB", tap to open.
 */
export function AnnouncementAttachment({
  attachment,
  name,
  size,
  compact = false,
  linked = true,
  className = "",
}: AnnouncementAttachmentProps) {
  const [viewerOpen, setViewerOpen] = useState(false);

  // Scroll lock + Escape while the viewer is open. (Hooks must run before
  // any early return, so this lives above the `!attachment` guard.)
  useEffect(() => {
    if (!viewerOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setViewerOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [viewerOpen]);

  if (!attachment) return null;

  const url = resolveAttachmentUrl(attachment);
  const fileName = name || decodeURIComponent(url.split("/").pop() || "attachment");

  const openViewer = () => setViewerOpen(true);
  const closeViewer = () => setViewerOpen(false);

  const handleViewerKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      setViewerOpen(true);
    }
  };

  const shareTo = async () => {
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const file = new File([blob], fileName, { type: blob.type || "image/jpeg" });
      if (nativeShareAvailable() && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: fileName });
        return;
      }
    } catch (error) {
      // The user dismissed the native sheet — do nothing else.
      if (error instanceof DOMException && error.name === "AbortError") return;
    }
    // Fallback: media is same-origin, so a plain download works everywhere.
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  };

  if (isImageAttachment(fileName, url)) {
    const viewer = viewerOpen ? (
      <div
        role="dialog"
        aria-modal="true"
        aria-label={fileName}
        className="fixed inset-0 z-[200] flex flex-col items-center justify-center bg-black/90 p-4"
        onClick={closeViewer}
      >
        <img
          src={url}
          alt={fileName}
          className="max-h-[76vh] w-auto max-w-full rounded-2xl object-contain shadow-2xl"
          onClick={(event) => event.stopPropagation()}
        />
        <div
          className="mt-5 flex flex-wrap items-center justify-center gap-3"
          onClick={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            onClick={shareTo}
            className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-[#26352f] transition hover:bg-[#f7f4ee]"
          >
            {nativeShareAvailable() ? (
              <>
                <Share2 className="h-4 w-4" aria-hidden />
                Share
              </>
            ) : (
              <>
                <Download className="h-4 w-4" aria-hidden />
                Download
              </>
            )}
          </button>
          <button
            type="button"
            onClick={closeViewer}
            className="inline-flex items-center gap-2 rounded-full border border-white/40 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-white/10"
          >
            <X className="h-4 w-4" aria-hidden />
            Close
          </button>
        </div>
      </div>
    ) : null;

    return (
      <>
        <span
          role="button"
          tabIndex={0}
          title="Tap to enlarge"
          onClick={(event) => {
            // Inside a parent link (dashboard rows), open the viewer
            // instead of navigating away.
            event.preventDefault();
            event.stopPropagation();
            openViewer();
          }}
          onKeyDown={handleViewerKeyDown}
          className={`group relative block cursor-zoom-in ${className}`}
        >
          <img
            src={url}
            alt={fileName}
            loading="lazy"
            className={`w-full rounded-2xl border border-[#dfdbd1] bg-[#f7f4ee] object-contain shadow-sm ${
              compact ? "max-h-28" : "max-h-72"
            }`}
          />
          <span className="pointer-events-none absolute bottom-2 right-2 rounded-full bg-black/55 p-1.5 text-white opacity-70 transition group-hover:opacity-100">
            <Maximize2 className="h-3.5 w-3.5" aria-hidden />
          </span>
        </span>
        {viewer}
      </>
    );
  }

  const extension = (fileName.split(".").pop() || "file").toUpperCase();
  const tile = DOCUMENT_TILES.find((entry) => entry.pattern.test(extension))?.tile ?? "bg-[#3d5148]";
  const sizeLabel = typeof size === "number" && size > 0 ? ` \u00b7 ${formatSize(size)}` : "";

  const card = (
    <span
      className={`flex items-center gap-3 rounded-2xl border border-[#dfdbd1] bg-[#f7f4ee] p-3 transition ${
        linked ? "hover:border-[#b36b3c] hover:bg-white" : ""
      } ${compact ? "max-w-[17rem]" : "max-w-sm"}`}
    >
      <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-white ${tile}`}>
        <FileText className="h-5 w-5" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-[#26352f]">{fileName}</span>
        <span className="mt-0.5 block text-xs font-bold uppercase tracking-wide text-[#617068]">
          {extension}
          {sizeLabel}
        </span>
      </span>
      {linked ? (
        <Download className="h-4 w-4 shrink-0 text-[#b36b3c]" aria-hidden />
      ) : (
        <ChevronRight className="h-4 w-4 shrink-0 text-[#b36b3c]" aria-hidden />
      )}
    </span>
  );

  if (!linked) return <span className={`block ${className}`}>{card}</span>;

  return (
    <a href={url} target="_blank" rel="noreferrer" className={`block ${className}`}>
      {card}
    </a>
  );
}
