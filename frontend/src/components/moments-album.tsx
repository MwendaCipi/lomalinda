"use client";

/**
 * Moments, read as albums.
 *
 * A moment is one day the church lived — a baptism, a camp, a Sabbath — and
 * every picture and video of that day sits inside it. The wall therefore
 * shows one card per moment, its first picture as the cover, and the whole
 * album opens when the card is pressed: no page carries every file of every
 * day at once.
 *
 * The album's own dialog is where a desk keeps it: adding more pictures or
 * videos, taking one out, correcting the words, taking the album off the
 * wall, or deleting it. Its buttons live in the fixed foot of the dialog,
 * the pattern every modal in this app follows. The server decides who may —
 * each album arrives carrying `can_manage` — so the buttons are only drawn
 * where the answer would be yes.
 */

import { useEffect, useState } from "react";
import { CalendarDays, Film, Images, Loader2, Pencil, Plus, Trash2, Upload, X } from "lucide-react";

import { isImageAttachment, resolveAttachmentUrl } from "@/components/announcement-attachment";
import { dayFirst } from "@/lib/dates";

/** One picture or video inside a moment's album, as the API serves it. */
export type MomentMedia = {
  id: number;
  url: string;
  file_name: string | null;
  is_video: boolean;
};

/** One documented moment: the day, its words, its files, and who may keep it. */
export type MomentAlbum = {
  id: number;
  title: string;
  description: string;
  happened_on: string | null;
  published: boolean;
  department: string;
  posted_by_name: string | null;
  media_count: number;
  media: MomentMedia[];
  video_links?: string[];
  /** Whether this reader may keep the album; the server's own answer. */
  can_manage?: boolean;
};

/** The picture that stands for the album: its first photograph, else its
    first file whatever that is. */
export function coverOf(album: MomentAlbum): MomentMedia | null {
  return album.media.find((entry) => !entry.is_video) ?? album.media[0] ?? null;
}

/** How many of the album's files play as video. */
const videosIn = (album: MomentAlbum) => album.media.filter((entry) => entry.is_video).length;

const playsAsVideo = (media: MomentMedia) =>
  media.is_video || !isImageAttachment(media.url, media.file_name);

/** A cover image: uploaded files are same-origin, so a plain img is enough. */
function CoverPicture({ media, title, tall }: { media: MomentMedia; title: string; tall?: boolean }) {
  const url = resolveAttachmentUrl(media.url);
  const size = tall ? "h-48 sm:h-56" : "h-40";
  if (playsAsVideo(media)) {
    return (
      <span className="relative block">
        <video src={url} preload="metadata" muted playsInline className={`w-full object-cover ${size}`} />
        <span className="absolute inset-0 flex items-center justify-center bg-black/25">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-black/60 text-white">
            <Film size={18} aria-hidden="true" />
          </span>
        </span>
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt={title} loading="lazy" className={`w-full object-cover ${size}`} />
  );
}

/**
 * The wall: one card per moment. Pressing a card opens that whole album.
 */
export function AlbumGrid({
  albums,
  onOpen,
  columns = "sm:grid-cols-2 lg:grid-cols-3",
}: {
  albums: MomentAlbum[];
  onOpen: (album: MomentAlbum) => void;
  /** The grid's shape; a desk reads two across, the wall three. */
  columns?: string;
}) {
  return (
    <div className={`grid gap-4 ${columns}`}>
      {albums.map((album) => {
        const cover = coverOf(album);
        const videos = videosIn(album);
        return (
          <button
            key={album.id}
            type="button"
            onClick={() => onOpen(album)}
            aria-label={`Open the album ${album.title}`}
            className="group overflow-hidden rounded-2xl border border-sand-soft bg-white text-left shadow-sm transition hover:-translate-y-0.5 hover:border-ember hover:shadow-md"
          >
            <span className="block overflow-hidden bg-sand-card">
              {cover ? (
                <span className="block transition duration-300 group-hover:scale-[1.02]">
                  <CoverPicture media={cover} title={album.title} />
                </span>
              ) : (
                <span className="flex h-40 w-full items-center justify-center text-moss">
                  <Images className="h-6 w-6" aria-hidden="true" />
                </span>
              )}
            </span>
            <span className="block space-y-1.5 p-4">
              <span className="flex items-start justify-between gap-2">
                <span className="min-w-0 text-sm font-bold text-bark">{album.title}</span>
                {album.happened_on && (
                  <span className="shrink-0 text-[11px] font-bold text-bark">
                    {dayFirst(album.happened_on)}
                  </span>
                )}
              </span>
              {album.description && (
                <span className="line-clamp-2 block text-xs text-moss">{album.description}</span>
              )}
              <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-moss">
                <span className="inline-flex items-center gap-1">
                  <Images className="h-3 w-3" aria-hidden="true" />
                  {album.media_count} {album.media_count === 1 ? "file" : "files"}
                </span>
                {videos > 0 && (
                  <span className="inline-flex items-center gap-1">
                    <Film className="h-3 w-3" aria-hidden="true" /> {videos} video{videos === 1 ? "" : "s"}
                  </span>
                )}
                {!album.published && (
                  <span className="rounded-full bg-alert-film px-2 py-0.5 font-semibold text-brick">
                    Not on the wall
                  </span>
                )}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * One album, opened whole: every picture and video of the day, with the desk's
 * own keeping of it in the dialog's fixed foot.
 */
export function AlbumDialog({
  album,
  onClose,
  onAddFiles,
  onRemoveMedia,
  onSaveWords,
  onTogglePublished,
  onDeleteAlbum,
  busy = false,
}: {
  album: MomentAlbum;
  onClose: () => void;
  /** Managers only: open the file picker for this album. */
  onAddFiles?: () => void;
  onRemoveMedia?: (media: MomentMedia) => void;
  /** Managers only: save the corrected title, day and words. */
  onSaveWords?: (values: { title: string; description: string; happened_on: string }) => Promise<boolean>;
  onTogglePublished?: () => void;
  onDeleteAlbum?: () => void;
  busy?: boolean;
}) {
  const canManage = Boolean(album.can_manage);
  const [viewer, setViewer] = useState<{ url: string; name: string; video: boolean } | null>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    title: album.title,
    description: album.description,
    happened_on: album.happened_on ?? "",
  });

  // Escape closes the viewer first, then the album — the way the wall's own
  // lightbox behaves.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (viewer) setViewer(null);
      else if (editing) setEditing(false);
      else onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [viewer, editing, onClose]);

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  const startEditing = () => {
    setForm({
      title: album.title,
      description: album.description,
      happened_on: album.happened_on ?? "",
    });
    setEditing(true);
  };

  const saveWords = async () => {
    if (!onSaveWords || !form.title.trim() || saving) return;
    setSaving(true);
    const written = await onSaveWords({
      title: form.title.trim(),
      description: form.description.trim(),
      happened_on: form.happened_on,
    });
    setSaving(false);
    if (written) setEditing(false);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      role="presentation"
      onClick={(event) => event.target === event.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={album.title}
        className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl ring-1 ring-sand-line"
      >
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-sand-line px-5 pb-3 pt-5 sm:px-6">
          <div className="min-w-0">
            <h3 className="text-lg font-bold text-bark sm:text-xl">{album.title}</h3>
            <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-moss">
              {album.happened_on && (
                <span className="inline-flex items-center gap-1">
                  <CalendarDays className="h-3 w-3" aria-hidden="true" /> {dayFirst(album.happened_on)}
                </span>
              )}
              <span className="inline-flex items-center gap-1">
                <Images className="h-3 w-3" aria-hidden="true" />
                {album.media_count} {album.media_count === 1 ? "file" : "files"}
              </span>
              {album.posted_by_name && <span>Posted by {album.posted_by_name}</span>}
              {!album.published && (
                <span className="rounded-full bg-alert-film px-2 py-0.5 font-semibold text-brick">
                  Not on the wall
                </span>
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close the album"
            className="shrink-0 rounded-full p-1.5 text-moss transition hover:bg-sand hover:text-bark"
          >
            <X size={16} aria-hidden="true" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 sm:px-6">
          {editing ? (
            <div className="space-y-3 rounded-2xl border border-sand-soft bg-sand-card p-4">
              <label className="block text-xs font-semibold text-bark">
                Event title
                <input
                  type="text"
                  value={form.title}
                  onChange={(event) => setForm({ ...form, title: event.target.value })}
                  className="mt-1 w-full rounded-xl border border-sand-mute bg-white px-3 py-1.5 text-xs outline-none focus:border-ember"
                />
              </label>
              <label className="block text-xs font-semibold text-bark">
                The day
                <input
                  type="date"
                  value={form.happened_on}
                  onChange={(event) => setForm({ ...form, happened_on: event.target.value })}
                  className="mt-1 w-full rounded-xl border border-sand-mute bg-white px-3 py-1.5 text-xs outline-none focus:border-ember sm:w-56"
                />
              </label>
              <label className="block text-xs font-semibold text-bark">
                A few words
                <textarea
                  value={form.description}
                  onChange={(event) => setForm({ ...form, description: event.target.value })}
                  rows={3}
                  className="mt-1 w-full rounded-xl border border-sand-mute bg-white px-3 py-1.5 text-xs outline-none focus:border-ember"
                />
              </label>
            </div>
          ) : (
            album.description && <p className="mb-4 text-sm leading-6 text-moss">{album.description}</p>
          )}

          {!editing && (album.video_links?.length ?? 0) > 0 && (
            <ul className="mb-4 space-y-1">
              {album.video_links?.map((link, index) => (
                <li key={`${album.id}-link-${index}`}>
                  <a
                    href={link}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-xs font-semibold text-ember hover:underline"
                  >
                    <Film className="h-3 w-3" aria-hidden="true" />
                    {link.replace(/^https?:\/\//, "").slice(0, 60)}
                  </a>
                </li>
              ))}
            </ul>
          )}

          {album.media.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-sand-mute bg-white p-8 text-center text-xs text-moss">
              This album has no pictures or videos yet.
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {album.media.map((media) => {
                const url = resolveAttachmentUrl(media.url);
                const video = playsAsVideo(media);
                return (
                  <figure
                    key={media.id}
                    className="group relative overflow-hidden rounded-2xl border border-sand-line bg-sand"
                  >
                    <button
                      type="button"
                      onClick={() =>
                        setViewer({ url, name: media.file_name ?? album.title, video })
                      }
                      className="block w-full"
                    >
                      {video ? (
                        <>
                          <video src={url} preload="metadata" muted playsInline className="h-48 w-full object-cover" />
                          <span className="absolute inset-0 flex items-center justify-center bg-black/20">
                            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-black/60 text-white">
                              <Film size={18} aria-hidden="true" />
                            </span>
                          </span>
                        </>
                      ) : (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={url}
                          alt={media.file_name ?? album.title}
                          loading="lazy"
                          className="h-48 w-full object-cover transition duration-300 group-hover:scale-[1.03]"
                        />
                      )}
                    </button>
                    {canManage && onRemoveMedia && (
                      <button
                        type="button"
                        onClick={() => onRemoveMedia(media)}
                        disabled={busy}
                        title={`Remove ${media.file_name ?? "this file"} from the album`}
                        aria-label="Remove this file from the album"
                        className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-full bg-white/95 px-2 py-1 text-[10px] font-bold text-brick shadow-sm transition hover:bg-white hover:text-red-700 disabled:opacity-50"
                      >
                        <Trash2 size={12} aria-hidden="true" /> Remove
                      </button>
                    )}
                  </figure>
                );
              })}
            </div>
          )}
        </div>

        {/* The dialog's fixed foot, as every modal in the app keeps its keys. */}
        <footer className="flex shrink-0 flex-wrap items-center gap-2 border-t border-sand-line bg-sand-linen/40 px-5 pb-4 pt-3 sm:px-6">
          {editing ? (
            <>
              <button
                type="button"
                onClick={() => void saveWords()}
                disabled={saving || !form.title.trim()}
                className="inline-flex items-center gap-2 rounded-xl bg-ember px-4 py-2 text-xs font-bold text-white transition hover:bg-ember-deep disabled:opacity-50"
              >
                {saving && <Loader2 size={13} className="animate-spin" aria-hidden="true" />}
                {saving ? "Saving…" : "Save the words"}
              </button>
              <button
                type="button"
                onClick={() => setEditing(false)}
                disabled={saving}
                className="rounded-xl border border-sand-line bg-white px-4 py-2 text-xs font-semibold text-bark transition hover:border-ember disabled:opacity-50"
              >
                Cancel
              </button>
            </>
          ) : (
            <>
              {canManage && onAddFiles && (
                <button
                  type="button"
                  onClick={onAddFiles}
                  disabled={busy}
                  className="inline-flex items-center gap-2 rounded-xl bg-ember px-4 py-2 text-xs font-bold text-white transition hover:bg-ember-deep disabled:opacity-50"
                >
                  {busy ? (
                    <Loader2 size={13} className="animate-spin" aria-hidden="true" />
                  ) : (
                    <Plus size={13} aria-hidden="true" />
                  )}
                  {busy ? "Adding…" : "Add pictures & videos"}
                </button>
              )}
              {canManage && onSaveWords && (
                <button
                  type="button"
                  onClick={startEditing}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-sand-line bg-white px-3 py-2 text-xs font-semibold text-bark transition hover:border-ember"
                >
                  <Pencil size={13} aria-hidden="true" /> Edit the words
                </button>
              )}
              {canManage && onTogglePublished && (
                <button
                  type="button"
                  onClick={onTogglePublished}
                  disabled={busy}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-sand-line bg-white px-3 py-2 text-xs font-semibold text-bark transition hover:border-ember disabled:opacity-50"
                >
                  <Upload size={13} aria-hidden="true" />
                  {album.published ? "Take off the wall" : "Put on the wall"}
                </button>
              )}
              {canManage && onDeleteAlbum && (
                <button
                  type="button"
                  onClick={onDeleteAlbum}
                  disabled={busy}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-sand-line bg-white px-3 py-2 text-xs font-semibold text-brick transition hover:border-brick disabled:opacity-50"
                >
                  <Trash2 size={13} aria-hidden="true" /> Delete album
                </button>
              )}
              <button
                type="button"
                onClick={onClose}
                className="ml-auto rounded-xl border border-sand-line bg-white px-4 py-2 text-xs font-semibold text-bark transition hover:border-ember"
              >
                Close
              </button>
            </>
          )}
        </footer>
      </div>

      {/* A file at full size: a photograph, or a video with its sound. */}
      {viewer && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/85 p-4"
          role="presentation"
          onClick={(event) => event.target === event.currentTarget && setViewer(null)}
        >
          <div className="max-h-full w-full max-w-4xl">
            <div className="mb-3 flex items-center justify-between text-white/90">
              <p className="truncate text-sm font-semibold">{viewer.name}</p>
              <button
                type="button"
                onClick={() => setViewer(null)}
                aria-label="Close"
                className="rounded-full p-2 hover:bg-white/10"
              >
                <X size={18} aria-hidden="true" />
              </button>
            </div>
            {viewer.video ? (
              <video src={viewer.url} controls autoPlay className="max-h-[80vh] w-full rounded-2xl bg-black" />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={viewer.url} alt={viewer.name} className="max-h-[80vh] w-full rounded-2xl object-contain" />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
