import { ChevronRight, Download, FileText } from "lucide-react";

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

/**
 * Renders an announcement attachment the way WhatsApp renders shares:
 * photos show as a visible inline preview, everything else becomes a
 * document card — colored type icon, file name, "PDF · 1.4 MB", and an
 * affordance to open it.
 */
export function AnnouncementAttachment({
  attachment,
  name,
  size,
  compact = false,
  linked = true,
  className = "",
}: AnnouncementAttachmentProps) {
  if (!attachment) return null;

  const url = resolveAttachmentUrl(attachment);
  const fileName = name || decodeURIComponent(url.split("/").pop() || "attachment");

  if (isImageAttachment(fileName, url)) {
    const image = (
      <img
        src={url}
        alt={fileName}
        loading="lazy"
        className={`w-full rounded-2xl border border-[#dfdbd1] bg-[#f7f4ee] object-contain shadow-sm ${
          compact ? "max-h-28" : "max-h-72"
        }`}
      />
    );

    if (!linked) return <span className={`block ${className}`}>{image}</span>;

    return (
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        title="Open full size"
        className={`group relative block ${className}`}
      >
        {image}
        <span className="pointer-events-none absolute bottom-2 right-2 rounded-full bg-black/55 px-2.5 py-1 text-[10px] font-semibold text-white opacity-0 transition group-hover:opacity-100">
          Open
        </span>
      </a>
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
