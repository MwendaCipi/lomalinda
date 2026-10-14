"use client";

/**
 * The member pages' own padding and reading width.
 *
 * The rail used to live here; it belongs to the app frame now, so a member
 * page and an office page are wrapped by the same shell and this component is
 * only what a page adds on top — its margins and its measure.
 *
 * The wrappers are a flex chain, so a page that owns its scrolling (My
 * Givings) can ask to stretch (`flex-1 min-h-0`) and find a definite height —
 * pinned mode gives the panel one, and the chain passes it down. Block
 * children size to their content exactly as before.
 */
export function MemberWorkspace({
  children,
  flushBottom = false,
}: {
  children: React.ReactNode;
  /** Drop the bottom padding so a full-height card's footer touches the
      phone's tab bar instead of floating on a strip of page. Restored on the
      wider screens, where the bar is gone. */
  flushBottom?: boolean;
}) {
  return (
    <main className="flex min-h-full flex-col bg-sand text-bark">
      <div
        className={`flex min-h-0 flex-1 flex-col p-4 sm:p-8 lg:p-10 ${
          flushBottom ? "pb-0 md:pb-8 lg:pb-10" : ""
        }`}
      >
        <div className="mx-auto flex w-full max-w-5xl min-h-0 flex-1 flex-col space-y-6">{children}</div>
      </div>
    </main>
  );
}
