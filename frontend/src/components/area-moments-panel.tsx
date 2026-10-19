"use client";

/**
 * Moments on a ministry's or department's desk — the church's photo and video
 * wall, read from the area that lived the day.
 *
 * Every area carries this view except the two office record desks (Treasury
 * and Clerkship — see `areaHasMoments` in the navigation registry), because
 * the wall itself is the church's own: one set of event albums, whichever
 * desk opens it. Documenting is the server's gate to keep — administrators
 * and the deaconate may post (`can_manage_moments` on the API) — so the
 * composer only appears for a viewer the server would answer anyway, and a
 * reader never meets a button that comes back refused.
 */

import { useEffect, useState } from "react";
import { ExternalLink, Images, Plus } from "lucide-react";
import { showAlert } from "@/lib/alerts";
import { dayFirst } from "@/lib/dates";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

/** One picture inside a moment's album, as the wall serves it. */
interface MomentMedia {
  id: number;
  url: string;
  file_name: string | null;
  is_video: boolean;
}

/** One documented moment on the Moments wall: the day, its words, its album. */
interface MomentAlbum {
  id: number;
  title: string;
  description: string;
  happened_on: string | null;
  posted_by_name: string | null;
  media_count: number;
  media: MomentMedia[];
  video_links: string[];
}

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
  canManage = false,
}: {
  /** The area's name, used in the empty state and the posting confirmations. */
  departmentLabel: string;
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

  // The wall is read when the view is opened — the list is what most visits
  // are here for. A manager reads what the wall has not let out yet; everyone
  // else is served the published albums only, the same as the public Moments
  // page. State is settled inside the promise's callbacks, and the request is
  // cancelled if the view closes before it lands.
  useEffect(() => {
    let alive = true;
    void (async () => {
      const token = typeof window === "undefined" ? null : localStorage.getItem("access_token");
      const query = canManage ? "?include_unpublished=true" : "";
      try {
        const res = await fetch(`${API_URL}/api/members/church-events/${query}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        const data = res.ok ? await res.json().catch(() => []) : [];
        if (alive) setMoments(Array.isArray(data) ? (data as MomentAlbum[]) : []);
      } catch {
        if (alive) setMoments([]);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [canManage]);

  const closeComposer = () => {
    setComposerOpen(false);
    setTitle("");
    setDay("");
    setNote("");
    setFiles([]);
    setLinks("");
  };

  /**
   * Document a moment: the day, a few words, the pictures, and the address
   * of any video of it. It goes straight out — the desk documents, the wall
   * shows — because a moment is the church's own news.
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
      showAlert("Moment documented", `"${trimmedTitle}" is on the Moments wall.`, "success");
    } catch {
      showAlert("The moment was not documented", "Check your connection and try again.", "error");
    } finally {
      setPosting(false);
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
            The days {departmentLabel} has lived, picture by picture — the same wall the whole church reads.
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
            <label className="block text-xs font-semibold text-bark">
              Pictures and videos
              <input
                type="file"
                multiple
                accept="image/*,video/*"
                onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
                className="mt-1 w-full rounded-xl border border-sand-mute bg-white px-3 py-1.5 text-xs text-moss file:mr-3 file:rounded-lg file:border-0 file:bg-sand file:px-3 file:py-1 file:text-xs file:font-bold file:text-bark"
              />
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
            No moment has been documented yet. The Sabbath that just was — its pictures belong on the wall.
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {moments.map((album) => {
              const cover = album.media.find((picture) => !picture.is_video);
              const videoLinks = album.video_links ?? [];
              return (
                <article
                  key={album.id}
                  className="overflow-hidden rounded-2xl border border-sand-soft bg-white shadow-sm"
                >
                  {cover ? (
                    // The wall's own tiles are plain images: the pictures are
                    // the point, and a next/image proxy adds nothing here.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={cover.url} alt={album.title} className="h-40 w-full object-cover" />
                  ) : (
                    <div className="flex h-40 w-full items-center justify-center bg-sand-card text-moss">
                      <Images className="h-6 w-6" aria-hidden="true" />
                    </div>
                  )}
                  <div className="space-y-2 p-4">
                    <div className="flex items-center justify-between gap-2">
                      <h4 className="text-sm font-bold text-bark">{album.title}</h4>
                      {album.happened_on && (
                        <span className="shrink-0 text-[11px] font-bold text-bark">{dayFirst(album.happened_on)}</span>
                      )}
                    </div>
                    {album.description && <p className="text-xs text-moss">{album.description}</p>}
                    <p className="text-[11px] text-moss">
                      {album.media_count} {album.media_count === 1 ? "picture" : "pictures"}
                      {videoLinks.length > 0 &&
                        ` · ${videoLinks.length} ${videoLinks.length === 1 ? "video" : "videos"}`}
                      {album.posted_by_name && ` · by ${album.posted_by_name}`}
                    </p>
                    {videoLinks.length > 0 && (
                      <ul className="space-y-1">
                        {videoLinks.map((link, idx) => (
                          <li key={`${album.id}-link-${idx}`}>
                            <a
                              href={link}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 text-[11px] font-semibold text-ember hover:underline"
                            >
                              <ExternalLink className="h-3 w-3" aria-hidden="true" />
                              {link.replace(/^https?:\/\//, "").slice(0, 42)}
                            </a>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
