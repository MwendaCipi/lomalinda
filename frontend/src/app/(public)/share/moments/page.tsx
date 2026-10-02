"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { CalendarDays, Film, Images, Loader2, Plus, Sparkles, Trash2, X } from "lucide-react";

import { useHeaderData } from "@/hooks/use-header-data";
import { isImageAttachment, resolveAttachmentUrl } from "@/components/announcement-attachment";
import { dayFirst } from "@/lib/dates";
import { showAlert } from "@/lib/alerts";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

/** One picture or video of an event's album, as the API serves it. */
type MomentMedia = {
  id: number;
  url: string;
  file_name: string | null;
  is_video: boolean;
};

/** One church event — the day, its words, and everything the camera kept. */
type MomentEvent = {
  id: number;
  title: string;
  description: string;
  happened_on: string | null;
  published: boolean;
  posted_by_name: string | null;
  media_count: number;
  media: MomentMedia[];
};

const dayLabel = (iso: string | null) =>
  iso ? dayFirst(iso, "") || null : null;

/**
 * Moments — the church's photo and video wall, kept as event albums.
 *
 * An album is a church event — "Baptism 3rd October 2026" — and holds every
 * picture and video of that day, not one file per notice. Anyone may read
 * the published albums; the officers who post announcements open albums
 * here: they post one, add to it, take a file down, or unpublish it. Photos
 * open in the in-app viewer's full lightbox; a video plays right on the
 * wall, with sound, the way a family album would.
 */
export default function MomentsPage() {
  const { me } = useHeaderData();
  // Moments is the administrators' gallery: only the admin role (or Django
  // staff) posts albums and keeps them; everyone else reads the wall.
  const canManage = Boolean(
    me && (me.is_staff || me.is_superuser || me.roles.includes("admin"))
  );

  const [events, setEvents] = useState<MomentEvent[]>([]);
  const [fetching, setFetching] = useState(true);
  const [lightbox, setLightbox] = useState<{ url: string; name: string; video: boolean } | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [posting, setPosting] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDay, setNewDay] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
    try {
      // The desk reads its unpublished albums too; the wall serves the rest.
      const res = await fetch(`${API_URL}/api/members/church-events/${canManage ? "?include_unpublished=true" : ""}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = res.ok ? await res.json().catch(() => []) : [];
      setEvents(Array.isArray(data) ? (data as MomentEvent[]) : []);
    } catch {
      setEvents([]);
    } finally {
      setFetching(false);
    }
  }, [canManage]);

  useEffect(() => {
    // Deferred by a microtask: the effect's own body stays setState-free.
    void Promise.resolve().then(load);
  }, [load]);

  // Scroll lock while the lightbox or the composer is up.
  useEffect(() => {
    if (!lightbox && !composerOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setLightbox(null);
        setComposerOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [lightbox, composerOpen]);

  const openComposer = () => {
    setNewTitle("");
    setNewDay("");
    setNewDescription("");
    setFiles([]);
    setComposerOpen(true);
  };

  const postAlbum = async () => {
    if (!newTitle.trim()) {
      showAlert("Missing title", "Give the event a title, e.g. Baptism 3rd October 2026.", "error");
      return;
    }
    if (files.length === 0) {
      showAlert("No pictures yet", "Pick at least one picture or video for the album.", "error");
      return;
    }
    setPosting(true);
    try {
      const body = new FormData();
      body.append("title", newTitle.trim());
      if (newDay) body.append("happened_on", newDay);
      if (newDescription.trim()) body.append("description", newDescription.trim());
      files.forEach((file) => body.append("media_files", file));
      const token = localStorage.getItem("access_token") ?? "";
      const res = await fetch(`${API_URL}/api/members/church-events/`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body,
      });
      if (!res.ok) {
        const problem = await res.json().catch(() => ({}));
        throw new Error(Object.values(problem).flat().join(" ") || "The album could not be posted.");
      }
      setComposerOpen(false);
      await load();
    } catch (err) {
      showAlert("Could not post the album", err instanceof Error ? err.message : "Please try again.", "error");
    } finally {
      setPosting(false);
    }
  };

  const removeMedia = async (event: MomentEvent, media: MomentMedia) => {
    const answer = await showAlert(
      "Take this file out of the album?",
      "It disappears from Moments. This cannot be undone.",
      "warning",
      { showCancelButton: true, confirmButtonText: "Take it out", cancelButtonText: "Keep it" }
    );
    if (!answer.isConfirmed) return;
    const token = localStorage.getItem("access_token") ?? "";
    const res = await fetch(`${API_URL}/api/members/church-events/${event.id}/`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ remove_media_ids: [media.id] }),
    });
    if (res.ok) await load();
  };

  const unpublish = async (event: MomentEvent) => {
    const answer = await showAlert(
      `Take “${event.title}” off the wall?`,
      "The album stays in the desk (published again any time) but members no longer see it.",
      "warning",
      { showCancelButton: true, confirmButtonText: "Take it off", cancelButtonText: "Leave it" }
    );
    if (!answer.isConfirmed) return;
    const token = localStorage.getItem("access_token") ?? "";
    const res = await fetch(`${API_URL}/api/members/church-events/${event.id}/`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ published: false }),
    });
    if (res.ok) await load();
  };

  const removeAlbum = async (event: MomentEvent) => {
    const answer = await showAlert(
      `Delete “${event.title}” and all its files?`,
      "The whole album — every picture and video — is gone for good. This cannot be undone.",
      "warning",
      { showCancelButton: true, confirmButtonText: "Delete the album", cancelButtonText: "Keep it" }
    );
    if (!answer.isConfirmed) return;
    const token = localStorage.getItem("access_token") ?? "";
    const res = await fetch(`${API_URL}/api/members/church-events/${event.id}/`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) await load();
  };

  return (
    <main className="min-h-screen bg-sand text-bark">
      <section className="px-5 pt-10 sm:px-8 sm:pt-14 lg:px-10">
        <div className="mx-auto max-w-6xl">
          {/* A signed-in member reads the name from the shell's page heading;
              a visitor keeps the hero. The Add button stays either way. */}
          {!me && (
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-ember">Fellowship</p>
          )}
          <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
            {!me && (
            <div>
              <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Moments</h1>
              <p className="mt-4 max-w-2xl text-lg leading-8 text-moss">
                The church&apos;s events, and the pictures and videos of each day — baptisms, choir sabbaths,
                camporees, the life of the family, album by album.
              </p>
            </div>
            )}
            {canManage && (
              <button
                type="button"
                onClick={openComposer}
                className="inline-flex h-11 items-center gap-2 rounded-full bg-bark px-5 text-sm font-semibold text-white transition hover:bg-ember"
              >
                <Plus size={16} aria-hidden="true" /> Post an event album
              </button>
            )}
          </div>
        </div>
      </section>

      <section className="px-5 py-10 sm:px-8 lg:px-10 lg:py-12">
        <div className="mx-auto max-w-6xl">
          {fetching ? (
            <div className="rounded-3xl border border-sand-line bg-white p-10 text-center text-sm text-moss">
              Loading moments...
            </div>
          ) : events.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-sand-mute bg-white p-10 text-center sm:p-14">
              <Sparkles size={36} className="mx-auto text-moss-faint" aria-hidden="true" />
              <h2 className="mt-3 text-lg font-semibold text-bark">No moments yet</h2>
              <p className="mx-auto mt-2 max-w-md text-sm text-moss">
                When the church posts an event&apos;s pictures and videos, they gather here album by album.
                {canManage ? " Start with the button above — the day, its title, and its pictures." : ""} The{" "}
                <Link href="/announcements" className="font-semibold text-ember hover:underline">
                  announcements feed
                </Link>{" "}
                carries the notices.
              </p>
            </div>
          ) : (
            <div className="space-y-12">
              {events.map((event) => (
                <article key={event.id} className="rounded-3xl border border-sand-line bg-white shadow-sm">
                  <header className="flex flex-wrap items-start justify-between gap-3 border-b border-sand-line p-5 sm:p-6">
                    <div className="min-w-0">
                      <h2 className="text-lg font-bold text-bark sm:text-xl">{event.title}</h2>
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-moss">
                        {dayLabel(event.happened_on) && (
                          <span className="inline-flex items-center gap-1">
                            <CalendarDays size={11} aria-hidden="true" /> {dayLabel(event.happened_on)}
                          </span>
                        )}
                        <span className="inline-flex items-center gap-1">
                          <Images size={11} aria-hidden="true" /> {event.media_count} {event.media_count === 1 ? "moment" : "moments"}
                        </span>
                        {event.posted_by_name && <span>Posted by {event.posted_by_name}</span>}
                        {!event.published && (
                          <span className="rounded-full bg-alert-film px-2 py-0.5 font-semibold text-brick">Unpublished — only the desk sees this</span>
                        )}
                      </div>
                      {event.description && <p className="mt-2 max-w-2xl text-sm leading-6 text-moss">{event.description}</p>}
                    </div>
                    {canManage && (
                      <div className="flex shrink-0 items-center gap-2">
                        {!event.published && (
                          <button
                            type="button"
                            onClick={async () => {
                              const token = localStorage.getItem("access_token") ?? "";
                              await fetch(`${API_URL}/api/members/church-events/${event.id}/`, {
                                method: "PATCH",
                                headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
                                body: JSON.stringify({ published: true }),
                              });
                              await load();
                            }}
                            className="rounded-xl border border-sand-line px-3 py-1.5 text-xs font-semibold text-bark hover:border-ember"
                          >
                            Publish
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => unpublish(event)}
                          className="rounded-xl border border-sand-line px-3 py-1.5 text-xs font-semibold text-bark hover:border-ember"
                        >
                          Unpublish
                        </button>
                        <button
                          type="button"
                          onClick={() => removeAlbum(event)}
                          aria-label={`Delete ${event.title}`}
                          className="inline-flex items-center gap-1.5 rounded-xl border border-sand-line px-3 py-1.5 text-xs font-semibold text-brick hover:border-brick"
                        >
                          <Trash2 size={13} aria-hidden="true" /> Delete
                        </button>
                      </div>
                    )}
                  </header>

                  <div className="grid gap-3 p-5 sm:grid-cols-2 sm:p-6 lg:grid-cols-3">
                    {event.media.map((media) => {
                      const url = resolveAttachmentUrl(media.url);
                      const looksVideo = media.is_video || !isImageAttachment(media.url, media.file_name);
                      return (
                        <figure key={media.id} className="group relative overflow-hidden rounded-2xl border border-sand-line bg-sand">
                          {looksVideo ? (
                            <button type="button" onClick={() => setLightbox({ url, name: media.file_name ?? "Video", video: true })} className="block w-full">
                              <video src={url} preload="metadata" controls={false} className="h-48 w-full object-cover sm:h-56" />
                              <span className="absolute inset-0 flex items-center justify-center">
                                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-black/60 text-white">
                                  <Film size={20} aria-hidden="true" />
                                </span>
                              </span>
                            </button>
                          ) : (
                            <button type="button" onClick={() => setLightbox({ url, name: media.file_name ?? "Photo", video: false })} className="block w-full">
                              {/* Plain img: album files are same-origin uploads
                                  and next/image adds nothing to a cover tile. */}
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={url} alt={media.file_name ?? event.title} loading="lazy" className="h-48 w-full object-cover transition duration-300 group-hover:scale-[1.03] sm:h-56" />
                            </button>
                          )}
                          {canManage && (
                            <button
                              type="button"
                              onClick={() => removeMedia(event, media)}
                              aria-label="Remove this file from the album"
                              className="absolute right-2 top-2 rounded-full bg-white/90 p-1.5 text-brick opacity-0 shadow-sm transition group-hover:opacity-100 focus:opacity-100"
                            >
                              <Trash2 size={13} aria-hidden="true" />
                            </button>
                          )}
                        </figure>
                      );
                    })}
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ── Lightbox: a photo at full size, a video with its sound. ── */}
      {lightbox && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4"
          role="presentation"
          onClick={(e) => e.target === e.currentTarget && setLightbox(null)}
        >
          <div className="max-h-full w-full max-w-4xl">
            <div className="mb-3 flex items-center justify-between text-white/90">
              <p className="truncate text-sm font-semibold">{lightbox.name}</p>
              <button type="button" onClick={() => setLightbox(null)} aria-label="Close" className="rounded-full p-2 hover:bg-white/10">
                <X size={18} aria-hidden="true" />
              </button>
            </div>
            {lightbox.video ? (
              <video src={lightbox.url} controls autoPlay className="max-h-[80vh] w-full rounded-2xl bg-black" />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={lightbox.url} alt={lightbox.name} className="max-h-[80vh] w-full rounded-2xl object-contain" />
            )}
          </div>
        </div>
      )}

      {/* ── Composer: the day, its words, its files. ── */}
      {composerOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
          role="presentation"
          onClick={(e) => e.target === e.currentTarget && !posting && setComposerOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="moments-compose-title"
            className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl ring-1 ring-sand-line"
          >
            <div className="flex items-center justify-between border-b border-sand-line pb-3">
              <h3 id="moments-compose-title" className="text-lg font-bold text-bark">Post an event album</h3>
              <button
                type="button"
                onClick={() => setComposerOpen(false)}
                disabled={posting}
                className="rounded-full p-1.5 text-moss transition hover:bg-sand hover:text-bark"
                aria-label="Close"
              >
                <X size={16} aria-hidden="true" />
              </button>
            </div>

            <div className="mt-4 space-y-4">
              <label className="block text-sm font-medium text-bark">
                Event title *
                <input
                  type="text"
                  required
                  placeholder="e.g. Baptism 3rd October 2026"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  className="mt-1.5 w-full rounded-xl border border-sand-mute px-4 py-2.5 text-sm outline-none focus:border-ember"
                />
              </label>

              <label className="block text-sm font-medium text-bark">
                The day it happened <span className="font-normal text-moss">(orders the albums, newest first)</span>
                <input
                  type="date"
                  value={newDay}
                  onChange={(e) => setNewDay(e.target.value)}
                  className="mt-1.5 w-full rounded-xl border border-sand-mute px-4 py-2.5 text-sm outline-none focus:border-ember"
                />
              </label>

              <label className="block text-sm font-medium text-bark">
                A few words <span className="font-normal text-moss">(optional)</span>
                <textarea
                  rows={3}
                  placeholder="What the day was, for whoever opens the album…"
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  className="mt-1.5 w-full rounded-xl border border-sand-mute px-4 py-2.5 text-sm outline-none focus:border-ember"
                />
              </label>

              <div>
                <p className="text-sm font-medium text-bark">
                  Pictures and videos * <span className="font-normal text-moss">(up to 30 at once)</span>
                </p>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="mt-1.5 w-full rounded-xl border border-dashed border-sand-mute px-4 py-6 text-center text-sm font-semibold text-moss transition hover:border-ember hover:text-bark"
                >
                  Choose from this device
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,video/*"
                  multiple
                  className="hidden"
                  onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
                />
                {files.length > 0 && (
                  <ul className="mt-2 space-y-1.5">
                    {files.map((file, index) => (
                      <li key={`${file.name}-${index}`} className="flex items-center justify-between rounded-xl bg-sand px-3 py-2 text-xs">
                        <span className="min-w-0 truncate font-semibold text-bark">{file.name}</span>
                        <button
                          type="button"
                          onClick={() => setFiles((current) => current.filter((_, i) => i !== index))}
                          aria-label={`Remove ${file.name}`}
                          className="shrink-0 text-moss hover:text-brick"
                        >
                          <X size={13} aria-hidden="true" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <button
                type="button"
                onClick={postAlbum}
                disabled={posting}
                className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-sage px-8 text-sm font-semibold text-white transition hover:bg-sage-deep disabled:opacity-60"
              >
                {posting && <Loader2 size={15} className="animate-spin" aria-hidden="true" />}
                {posting ? "Posting the album…" : "Post the album"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
