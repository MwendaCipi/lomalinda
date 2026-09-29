"use client";

/**
 * The member pages' own padding and reading width.
 *
 * The rail used to live here; it belongs to the app frame now, so a member
 * page and an office page are wrapped by the same shell and this component is
 * only what a page adds on top — its margins and its measure.
 */
export function MemberWorkspace({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-full bg-sand text-bark">
      <div className="p-4 sm:p-8 lg:p-10">
        <div className="mx-auto max-w-5xl space-y-6">{children}</div>
      </div>
    </main>
  );
}
