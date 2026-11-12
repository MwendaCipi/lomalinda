"use client";

/**
 * Moments on a ministry's or department's desk — the days that area lived,
 * kept as albums of their own.
 *
 * The desk reads only its own area's albums (the API is asked for them by the
 * area's code), so a ministry never carries another's pictures, and it keeps
 * them from here: opening an album, adding the day's pictures or videos,
 * taking one out, correcting the words, taking the album off the wall. The
 * church-wide wall — the office's and the deaconate's albums — stays on the
 * public Moments page; what an area documents is the area's own record.
 *
 * Every area carries this view except the two office record desks (Treasury
 * and Clerkship — see `areaHasMoments`); the server's `can_manage` on each
 * album decides whose hand sees the keeping buttons.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Images, Plus } from "lucide-react";

import { AlbumDialog, AlbumGrid, type MomentAlbum, type MomentMedia } from "@/components/moments-album";
import { showAlert } from "@/lib/alerts";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

/** Authenticated call against the members API. */
async function apiFetch(path: string, init?: RequestInit) {
  const token = typeof window === "undefined" ? null : localStorage.getItem("access_token");
  // A FormData body brings its own boundary; a content type laid over it
  // would misdescribe the encoding and the upload would arrive unreadable.
  const isFormData = typeof FormData !== "undefined" && init?.body instanceof FormData;
  return fetch(`${API_URL}/api/members${path}`, {
    ...init,
    headers: {
      ...(isFormData ? {} : { "Content-Type": "application/json" }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
  });
}

/** The pictures and videos among what was chosen, the rest left behind. */
function mediaFrom(list: FileList | null): File[] {
  return Array.from(list ?? []).filter(
    (file) => file.type.startsWith("image/") || file.type.startsWith("video/"),
  );
}

/** The first validation message in a DRF error body, so alerts say what broke. */
function firstErrorMessage(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "";
  for (const value of Object.values(payload as Record<string, unknown>)) {
    if (typeof value === "string") return value;
    if (Array.isArray(value) && value.length > 0) return String(value[0]);
  }
  return "";
}

export function AreaMomentsPanel({
  departmentLabel,
  department,
  canManage = false,
}: {
  /** The area's name, used in the empty state and the posting confirmations. */
  departmentLabel: string;
  /** The area whose albums this page reads and writes; blank is the church's
      own wall, which only the office and the deaconate keep. */
  department?: string;
  /**
   * May this viewer document a moment? The server decides the same question
   * on the POST; the desk only hides the button where the answer would be no.
   */
  canManage?: boolean;
}) {
  const [moments, setMoments] = useState<MomentAlbum[]>([]);
  const [loading, setLoading] = useState(true);
  const [composerOpen, setComposerOpen] = useState(false);
  const [posting, setPosting] = useState(false);
  const [title, setTitle] = useState("");
  const [day, setDay] = useState("");
  const [note, setNote] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [links, setLinks] = useState("");
  // The pad lights up while files are dragged over it.
  const [dragging, setDragging] = useState(false);
  // The album opened from the wall, and the file picker that adds to it.
  const [openId, setOpenId] = useState<number | null>(null);
  const addInputRef = useRef<HTMLInputElement>(null);
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    if (canManage) params.set("include_unpublished", "true");
    if (department) params.set("department", department);
    const query = params.toString();
    try {
      const res = await apiFetch(`/church-events/${query ? `?${query}` : ""}`);
      const data = res.ok ? await res.json().catch(() => []) : [];
      setMoments(Array.isArray(data) ? (data as MomentAlbum[]) : []);
    } catch {
      setMoments([]);
    } finally {
      setLoading(false);
    }
  }, [canManage, department]);

  useEffect(() => {
    // Deferred by a microtask: the effect body itself stays setState-free.
    void Promise.resolve().then(load);
  }, [load]);

  // The album stays as the last read of it — a save replaces the list, and
  // the open dialog follows the row it is showing.
  const openAlbum = moments.find((album) => album.id === openId) ?? null;

  const closeComposer = () => {
    setComposerOpen(false);
    setTitle("");
    setDay("");
    setNote("");
    setFiles([]);
    setLinks("");
  };

  /**
   * Document a moment: the day, a few words, the pictures and videos, and the
   * address of any video kept elsewhere. It goes into this area's albums.
   */
  const documentMoment = async (event: React.FormEvent) => {
    event.preventDefault();
    const trimmedTitle = title.trim();
    const videoLinks = links
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    if (!trimmedTitle || posting) return;

    setPosting(true);
    try {
      const body = new FormData();
      body.append("title", trimmedTitle);
      if (note.trim()) body.append("description", note.trim());
      if (day) body.append("happened_on", day);
      if (department) body.append("department", department);
      files.forEach((file) => body.append("media_files", file));
      videoLinks.forEach((link) => body.append("video_links", link));

      const res = await apiFetch("/church-events/", { method: "POST", body });
      if (!res.ok) {
        showAlert(
          "The moment was not documented",
          firstErrorMessage(await res.json().catch(() => null)) || "Nothing was posted. Try again.",
          "error",
        );
        return;
      }
      const album = (await res.json()) as MomentAlbum;
      setMoments((prev) => [album, ...prev]);
      closeComposer();
      showAlert("Moment documented", `"${trimmedTitle}" is on ${departmentLabel}'s Moments.`, "success");
    } catch {
      showAlert("The moment was not documented", "Check your connection and try again.", "error");
    } finally {
      setPosting(false);
    }
  };

  /** More of the day: files added to an album already on the wall. */
  const addMedia = async (album: MomentAlbum, picked: File[]) => {
    if (picked.length === 0) return;
    setAdding(true);
    try {
      const body = new FormData();
      picked.forEach((file) => body.append("media_files", file));
      const res = await apiFetch(`/church-events/${album.id}/`, { method: "PATCH", body });
      if (!res.ok) {
        showAlert(
          "The files were not added",
          firstErrorMessage(await res.json().catch(() => null)) || "Please try again.",
          "error",
        );
        return;
      }
      await load();
    } catch {
      showAlert("The files were not added", "Check your connection and try again.", "error");
    } finally {
      setAdding(false);
      if (addInputRef.current) addInputRef.current.value = "";
    }
  };

  const removeMedia = async (album: MomentAlbum, media: MomentMedia) => {
    const answer = await showAlert(
      "Take this file out of the album?",
      "It disappears from Moments. This cannot be undone.",
      "warning",
      { showCancelButton: true, confirmButtonText: "Take it out", cancelButtonText: "Keep it" },
    );
    if (!answer.isConfirmed) return;
    const res = await apiFetch(`/church-events/${album.id}/`, {
      method: "PATCH",
      body: JSON.stringify({ remove_media_ids: [media.id] }),
    });
    if (res.ok) await load();
    else showAlert("Could not take it out", "Please try again.", "error");
  };

  const saveWords = async (
    album: MomentAlbum,
    values: { title: string; description: string; happened_on: string },
  ) => {
    const res = await apiFetch(`/church-events/${album.id}/`, {
      method: "PATCH",
      body: JSON.stringify({
        title: values.title,
        description: values.description,
        happened_on: values.happened_on || null,
      }),
    });
    if (!res.ok) {
      showAlert("Could not save the words", firstErrorMessage(await res.json().catch(() => null)) || "Please try again.", "error");
      return false;
    }
    await load();
    return true;
  };

  const togglePublished = async (album: MomentAlbum) => {
    const res = await apiFetch(`/church-events/${album.id}/`, {
      method: "PATCH",
      body: JSON.stringify({ published: !album.published }),
    });
    if (res.ok) await load();
    else showAlert("Could not change the album", "Please try again.", "error");
  };

  const deleteAlbum = async (album: MomentAlbum) => {
    const answer = await showAlert(
      `Delete “${album.title}” and all its files?`,
      "The whole album is gone for good. This cannot be undone.",
      "warning",
      { showCancelButton: true, confirmButtonText: "Delete the album", cancelButtonText: "Keep it" },
    );
    if (!answer.isConfirmed) return;
    const res = await apiFetch(`/church-events/${album.id}/`, { method: "DELETE" });
    if (res.ok) {
      setOpenId(null);
      await load();
    } else {
      showAlert("Could not delete the album", "Please try again.", "error");
    }
  };

  return (
    <div className="rounded-2xl border border-sand-line bg-white p-5 shadow-sm sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-bold text-bark">
            <Images className="h-4 w-4 text-ember" aria-hidden="true" /> Moments
          </h3>
          <p className="mt-0.5 text-xs text-moss">
            The days {departmentLabel} has lived, album by album — {departmentLabel}&apos;s own pictures and videos.
          </p>
        </div>
        {canManage && (
          <button
            type="button"
            onClick={() => (composerOpen ? closeComposer() : setComposerOpen(true))}
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-bark px-4 py-2 text-xs font-bold text-white transition hover:bg-bark-950"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            {composerOpen ? "Close" : "Document a moment"}
          </button>
        )}
      </div>

      {composerOpen && canManage && (
        <form onSubmit={documentMoment} className="mt-4 space-y-3 rounded-2xl border border-sand-soft bg-sand-card p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-xs font-semibold text-bark">
              Event title
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Baptism 3rd October 2026"
                className="mt-1 w-full rounded-xl border border-sand-mute bg-white px-3 py-1.5 text-xs outline-none focus:border-ember"
              />
            </label>
            <label className="block text-xs font-semibold text-bark">
              The day
              <input
                type="date"
                value={day}
                onChange={(e) => setDay(e.target.value)}
                className="mt-1 w-full rounded-xl border border-sand-mute bg-white px-3 py-1.5 text-xs outline-none focus:border-ember"
              />
            </label>
          </div>
          <label className="block text-xs font-semibold text-bark">
            A few words
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              placeholder="What the day was, in a line or two."
              className="mt-1 w-full rounded-xl border border-sand-mute bg-white px-3 py-1.5 text-xs outline-none focus:border-ember"
            />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label
              className={`block rounded-xl text-xs font-semibold text-bark transition ${
                dragging ? "ring-2 ring-ember/50" : ""
              }`}
              onDragOver={(e) => {
                e.preventDefault();
                if (!posting) setDragging(true);
              }}
              onDragLeave={(e) => {
                if (e.currentTarget === e.target) setDragging(false);
              }}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                if (posting) return;
                const picked = mediaFrom(e.dataTransfer.files);
                if (picked.length > 0) setFiles((current) => [...current, ...picked]);
              }}
            >
              Pictures and videos
              <input
                type="file"
                multiple
                accept="image/*,video/*"
                onChange={(e) => {
                  const picked = mediaFrom(e.target.files);
                  if (picked.length > 0) setFiles((current) => [...current, ...picked]);
                  e.target.value = "";
                }}
                className="mt-1 w-full rounded-xl border border-sand-mute bg-white px-3 py-1.5 text-xs text-moss file:mr-3 file:rounded-lg file:border-0 file:bg-sand file:px-3 file:py-1 file:text-xs file:font-bold file:text-bark"
              />
              <span className="mt-1 block text-[10px] font-normal text-moss">
                {dragging ? "Let go to add them to the album" : "or drag pictures and videos here"}
              </span>
            </label>
            <label className="block text-xs font-semibold text-bark">
              Video links (one per line)
              <textarea
                value={links}
                onChange={(e) => setLinks(e.target.value)}
                rows={2}
                placeholder="https://youtube.com/…"
                className="mt-1 w-full rounded-xl border border-sand-mute bg-white px-3 py-1.5 text-xs outline-none focus:border-ember"
              />
            </label>
          </div>
          {files.length > 0 && (
            <ul className="space-y-1.5">
              {files.map((file, index) => (
                <li key={`${file.name}-${index}`} className="flex items-center justify-between rounded-xl bg-white px-3 py-1.5 text-xs">
                  <span className="min-w-0 truncate font-semibold text-bark">{file.name}</span>
                  <button
                    type="button"
                    onClick={() => setFiles((current) => current.filter((_, i) => i !== index))}
                    aria-label={`Remove ${file.name}`}
                    className="shrink-0 text-moss hover:text-brick"
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
          <button
            type="submit"
            disabled={posting || !title.trim()}
            className="inline-flex items-center gap-2 rounded-xl bg-ember px-4 py-2 text-xs font-bold text-white transition hover:bg-ember-deep disabled:opacity-50"
          >
            {posting ? "Posting…" : "Post to Moments"}
          </button>
        </form>
      )}

      <div className="mt-4">
        {loading ? (
          <div className="rounded-2xl border border-sand-soft bg-white p-8 text-center text-xs text-moss">
            Loading moments…
          </div>
        ) : moments.length === 0 ? (
          <div className="rounded-2xl border border-sand-soft bg-white p-8 text-center text-xs text-moss">
            No moment has been documented here yet. The Sabbath that just was — its pictures belong on {departmentLabel}&apos;s wall.
          </div>
        ) : (
          <AlbumGrid albums={moments} onOpen={(album) => setOpenId(album.id)} />
        )}
      </div>

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

      {openAlbum && (
        <AlbumDialog
          album={openAlbum}
          busy={adding}
          onClose={() => setOpenId(null)}
          onAddFiles={() => addInputRef.current?.click()}
          onRemoveMedia={(media) => void removeMedia(openAlbum, media)}
          onSaveWords={(values) => saveWords(openAlbum, values)}
          onTogglePublished={() => void togglePublished(openAlbum)}
          onDeleteAlbum={() => void deleteAlbum(openAlbum)}
        />
      )}
    </div>
  );
}
