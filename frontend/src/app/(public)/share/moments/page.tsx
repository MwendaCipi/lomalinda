"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CalendarDays, Sparkles } from "lucide-react";

import { AnnouncementAttachment, isImageAttachment } from "@/components/announcement-attachment";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

/** One announcement that carries a picture or video the church has posted. */
type MomentPost = {
  id: number;
  title: string;
  text: string;
  detail?: string;
  attachment?: string | null;
  attachment_name?: string | null;
  created_at?: string;
};

/**
 * Moments — the church's photo and video wall.
 *
 * A moment is a posted announcement that carries media: an officer shares
 * pictures or video through the announcements desk, and every post with an
 * attachment gathers here in date order, newest first — the same posts the
 * feed shows, seen as the church's album rather than as its notices. Photos
 * open in the same in-app viewer the feed uses; a video or document hands the
 * post itself to the viewer by way of the feed link.
 */
export default function MomentsPage() {
  const [posts, setPosts] = useState<MomentPost[]>([]);
  const [fetching, setFetching] = useState(true);

  useEffect(() => {
    let cancelled = false;
    // Deferred by a microtask: the effect's own body stays setState-free.
    void Promise.resolve().then(async () => {
      try {
        const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
        const res = await fetch(`${API_URL}/api/members/announcements/`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        const data = res.ok ? await res.json().catch(() => []) : [];
        if (!cancelled) {
          const moments = (Array.isArray(data) ? (data as MomentPost[]) : []).filter((post) => Boolean(post.attachment));
          setPosts(moments);
        }
      } catch {
        if (!cancelled) setPosts([]);
      } finally {
        if (!cancelled) setFetching(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="min-h-screen bg-sand text-bark">
      <section className="px-5 pt-10 sm:px-8 sm:pt-14 lg:px-10">
        <div className="mx-auto max-w-6xl">
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-ember">Fellowship</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">Moments</h1>
          <p className="mt-4 max-w-2xl text-lg leading-8 text-moss">
            Pictures and videos posted by the church — worship, fellowship, outreach and the everyday life of the
            family, gathered from the announcements.
          </p>
        </div>
      </section>

      <section className="px-5 py-10 sm:px-8 lg:px-10 lg:py-12">
        <div className="mx-auto max-w-6xl">
          {fetching ? (
            <div className="rounded-3xl border border-sand-line bg-white p-10 text-center text-sm text-moss">
              Loading moments...
            </div>
          ) : posts.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-sand-mute bg-white p-10 text-center sm:p-14">
              <Sparkles size={36} className="mx-auto text-moss-faint" aria-hidden="true" />
              <h2 className="mt-3 text-lg font-semibold text-bark">No moments yet</h2>
              <p className="mx-auto mt-2 max-w-md text-sm text-moss">
                When the church posts pictures or videos with an announcement, they gather here. The
                announcements feed has the notices; the <Link href="/announcements" className="font-semibold text-ember hover:underline">feed is this way</Link>.
              </p>
            </div>
          ) : (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {posts.map((post) => {
                const media = post.attachment ?? null;
                const when = post.created_at ? new Date(post.created_at).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" }) : null;
                return (
                  <article key={post.id} className="flex flex-col overflow-hidden rounded-3xl border border-sand-line bg-white shadow-sm">
                    {media && isImageAttachment(media, post.attachment_name) ? (
                      <div className="px-4 pt-4">
                        <AnnouncementAttachment attachment={media} name={post.attachment_name} linked={false} />
                      </div>
                    ) : (
                      <div className="px-4 pt-4">
                        {/* A video or document keeps its own card — tap it to
                            open or share, exactly as the feed hands it over. */}
                        <AnnouncementAttachment attachment={media} name={post.attachment_name} linked={false} />
                      </div>
                    )}
                    <div className="flex flex-1 flex-col gap-1.5 p-4">
                      <div className="flex items-center gap-2 text-[11px] text-moss">
                        {when && (
                          <span className="inline-flex items-center gap-1">
                            <CalendarDays size={11} aria-hidden="true" /> {when}
                          </span>
                        )}
                      </div>
                      <h2 className="text-sm font-bold text-bark">{post.title}</h2>
                      <p className="line-clamp-3 text-xs leading-5 text-moss">{post.text}</p>
                      {post.detail && (
                        <p className="mt-auto line-clamp-2 pt-1 text-[11px] leading-4 text-moss-mid">{post.detail}</p>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
