"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Loader2, Plus, Sparkles, X } from "lucide-react";

import { useHeaderData } from "@/hooks/use-header-data";
import { AlbumDialog, AlbumGrid, type MomentAlbum, type MomentMedia } from "@/components/moments-album";
import { showAlert } from "@/lib/alerts";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

/** The pictures and videos among what was dragged in, the rest left behind. */
const mediaFrom = (list: FileList | null) =>
  Array.from(list ?? []).filter(
    (file) => file.type.startsWith("image/") || file.type.startsWith("video/"),
  );

/**
 * Moments — the church's photo and video wall, kept as event albums.
 *
 * An album is a church event — "Baptism 3rd October 2026" — and holds every
 * picture and video of that day, not one file per notice. The wall shows one
 * card per album, its first picture as the cover; pressing the card opens the
 * whole day. Anyone may read the published albums; the officers who post
 * announcements open albums here: they post one, add more pictures or videos
 * to it later, correct its words, take one file down without losing the
 * album, or unpublish it. A department's or ministry's own albums live on that
 * area's page, not here.
 */
export default function MomentsPage() {
  const { me } = useHeaderData();
  // The church's wall is the administrators' gallery: only the admin role (or
  // Django staff) posts albums and keeps them; everyone else reads the wall.
  const canManage = Boolean(
    me && (me.is_staff || me.is_superuser || me.roles.includes("admin"))
  );

  const [events, setEvents] = useState<MomentAlbum[]>([]);
  const [fetching, setFetching] = useState(true);
  const [composerOpen, setComposerOpen] = useState(false);
  const [posting, setPosting] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDay, setNewDay] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Dragging files in: the composer's own pad.
  const [draggingComposer, setDraggingComposer] = useState(false);
  // The album opened from the wall, and the picker that adds more of the day
  // to it.
  const [openId, setOpenId] = useState<number | null>(null);
  const addInputRef = useRef<HTMLInputElement>(null);
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
    try {
      // The office reads its unpublished albums too; the wall serves the rest.
      const res = await fetch(`${API_URL}/api/members/church-events/${canManage ? "?include_unpublished=true" : ""}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = res.ok ? await res.json().catch(() => []) : [];
      setEvents(Array.isArray(data) ? (data as MomentAlbum[]) : []);
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

  const openAlbum = events.find((event) => event.id === openId) ?? null;

  // Scroll lock while an album or the composer is up.
  useEffect(() => {
    if (!openId && !composerOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [openId, composerOpen]);

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

  const addMedia = async (event: MomentAlbum, picked: File[]) => {
    if (picked.length === 0) return;
    setAdding(true);
    try {
      const body = new FormData();
      picked.forEach((file) => body.append("media_files", file));
      const token = localStorage.getItem("access_token") ?? "";
      // A FormData body carries its own boundary, so no content type is set.
      const res = await fetch(`${API_URL}/api/members/church-events/${event.id}/`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}` },
        body,
      });
      if (!res.ok) {
        const problem = await res.json().catch(() => ({}));
        throw new Error(Object.values(problem).flat().join(" ") || "The files could not be added.");
      }
      await load();
    } catch (err) {
      showAlert("Could not add the files", err instanceof Error ? err.message : "Please try again.", "error");
    } finally {
      setAdding(false);
      if (addInputRef.current) addInputRef.current.value = "";
    }
  };

  const removeMedia = async (event: MomentAlbum, media: MomentMedia) => {
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
    if (res.ok) {
      await load();
      showAlert("File taken out", `It is out of “${event.title}”; the album stays on the wall.`, "success", {
        toast: true,
        timer: 3500,
        showConfirmButton: false,
      });
    } else {
      showAlert("Could not take it out", "Please try again.", "error");
    }
  };

  const saveWords = async (
    event: MomentAlbum,
    values: { title: string; description: string; happened_on: string },
  ) => {
    const token = localStorage.getItem("access_token") ?? "";
    const res = await fetch(`${API_URL}/api/members/church-events/${event.id}/`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        title: values.title,
        description: values.description,
        happened_on: values.happened_on || null,
      }),
    });
    if (!res.ok) {
      showAlert("Could not save the words", "Please try again.", "error");
      return false;
    }
    await load();
    return true;
  };

  const togglePublished = async (event: MomentAlbum) => {
    const token = localStorage.getItem("access_token") ?? "";
    const res = await fetch(`${API_URL}/api/members/church-events/${event.id}/`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ published: !event.published }),
    });
    if (res.ok) await load();
    else showAlert("Could not change the album", "Please try again.", "error");
  };

  const removeAlbum = async (event: MomentAlbum) => {
    const answer = await showAlert(
      `Delete “${event.title}” and all its files?`,
      "The whole album is gone for good. This cannot be undone.",
      "warning",
      { showCancelButton: true, confirmButtonText: "Delete the album", cancelButtonText: "Keep it" }
    );
    if (!answer.isConfirmed) return;
    const token = localStorage.getItem("access_token") ?? "";
    const res = await fetch(`${API_URL}/api/members/church-events/${event.id}/`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      setOpenId(null);
      await load();
    } else {
      showAlert("Could not delete the album", "Please try again.", "error");
    }
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
                The church&apos;s events, and the pictures and videos of each day, album by album.
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
                {canManage ? " Start with the button above." : ""} The{" "}
                <Link href="/announcements" className="font-semibold text-ember hover:underline">
                  announcements feed
                </Link>{" "}
                carries the notices.
              </p>
            </div>
          ) : (
            <AlbumGrid albums={events} onOpen={(album) => setOpenId(album.id)} />
          )}
        </div>
      </section>

      {/* The one picker the album's own "Add" button opens. */}
      <input
        ref={addInputRef}
        type="file"
        accept="image/*,video/*"
        multiple
        className="hidden"
        aria-hidden="true"
        tabIndex={-1}
        onChange={(e) => {
          if (openAlbum) void addMedia(openAlbum, mediaFrom(e.target.files));
        }}
      />

      {/* ── The album, opened whole. ── */}
      {openAlbum && (
        <AlbumDialog
          album={openAlbum}
          busy={adding}
          onClose={() => setOpenId(null)}
          onAddFiles={() => addInputRef.current?.click()}
          onRemoveMedia={(media) => void removeMedia(openAlbum, media)}
          onSaveWords={(values) => saveWords(openAlbum, values)}
          onTogglePublished={() => void togglePublished(openAlbum)}
          onDeleteAlbum={() => void removeAlbum(openAlbum)}
        />
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
            className="flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-3xl bg-white shadow-2xl ring-1 ring-sand-line"
          >
            <div className="flex shrink-0 items-center justify-between border-b border-sand-line px-6 pb-3 pt-6">
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

            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 pb-4 pt-4">
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
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    if (!posting) setDraggingComposer(true);
                  }}
                  onDragLeave={(e) => {
                    if (e.currentTarget === e.target) setDraggingComposer(false);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDraggingComposer(false);
                    if (posting) return;
                    const picked = mediaFrom(e.dataTransfer.files);
                    if (picked.length === 0) return;
                    setFiles((current) => [...current, ...picked]);
                  }}
                  className={`mt-1.5 rounded-xl border border-dashed px-4 py-6 text-center transition ${
                    draggingComposer
                      ? "border-ember bg-sand"
                      : "border-sand-mute"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="text-sm font-semibold text-moss transition hover:text-bark"
                  >
                    Choose from this device
                  </button>
                  <p className="mt-1 text-xs text-moss">
                    {draggingComposer
                      ? "Let go to add them to the album"
                      : "or drag pictures and videos here"}
                  </p>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,video/*"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    const picked = mediaFrom(e.target.files);
                    if (picked.length > 0) setFiles((current) => [...current, ...picked]);
                    // The picker is emptied so the same file can be chosen again.
                    if (fileInputRef.current) fileInputRef.current.value = "";
                  }}
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

            </div>

            {/* The always-visible post row at the foot — the requests modals' pattern. */}
            <div className="shrink-0 border-t border-sand-line px-6 pb-5 pt-3">
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
