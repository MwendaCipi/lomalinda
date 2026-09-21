import Link from "next/link";

import type { SectionLink } from "@/config/site-sections";

/**
 * The public website's section navigation, in the page body rather than beside it.
 *
 * These links were the public sidebars (About, News & Events, Study Materials).
 * The website now runs full width — no sidebar chrome — so the same destinations
 * are offered as cards that read like the rest of the marketing pages.
 *
 * Callers pass the `activeKey` of the page being viewed, so the section you are
 * already on is marked without the component needing to read the route.
 */
export function PublicSectionNav({
  eyebrow,
  title,
  description,
  links,
  activeKey,
  className = "",
}: {
  eyebrow: string;
  title: string;
  description: string;
  links: SectionLink[];
  activeKey?: string;
  className?: string;
}) {
  return (
    <section className={`px-6 py-14 lg:px-8 lg:py-16 ${className}`}>
      <div className="mx-auto max-w-6xl">
        <p className="text-sm font-semibold uppercase tracking-[0.24em] text-[#b36b3c]">{eyebrow}</p>
        <h2 className="mt-3 max-w-3xl text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h2>
        <p className="mt-3 max-w-2xl text-base leading-8 text-[#617068]">{description}</p>

        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {links.map((link) => {
            const Icon = link.icon;
            const isActive = activeKey === link.key;
            return (
              <Link
                key={link.key}
                href={link.href}
                aria-current={isActive ? "page" : undefined}
                className={`group flex items-start gap-4 rounded-[1.5rem] bg-white p-5 shadow-sm ring-1 transition hover:-translate-y-0.5 ${
                  isActive ? "ring-2 ring-[#b36b3c]" : "ring-[#dfdbd1] hover:ring-[#b9b3a6]"
                }`}
              >
                <span
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                    isActive ? "bg-[#b36b3c]/15 text-[#b36b3c]" : "bg-[#f7f4ee] text-[#617068]"
                  }`}
                >
                  <Icon className="h-5 w-5" />
                </span>
                <span className="min-w-0">
                  <span className="block text-base font-semibold tracking-tight">{link.label}</span>
                  <span className="mt-1.5 block text-sm leading-6 text-[#617068]">{link.description}</span>
                  <span className="mt-3 inline-block text-sm font-semibold text-[#b36b3c] group-hover:underline">
                    {isActive ? "You are here" : "Open →"}
                  </span>
                </span>
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}
