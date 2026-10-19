"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { SlidersHorizontal, X } from "lucide-react";
import { ComboboxPopover } from "./combobox-popover";

/**
 * A desk's filters, behind one button beside the search on a phone.
 *
 * Laid out in the open, a desk's filter controls cost a phone a second — and
 * sometimes a third — row of a screen that has none to spare, and when they
 * did not fit at all the search itself was cut off at the edge. The wider
 * screens keep those controls in the open, exactly as they were; on a phone
 * this stands where they would: one button that opens the same controls, with
 * `summary` naming the choice that is standing, so the desk is told what is
 * filtered without opening anything.
 *
 * The panel is the shell's own popover (`ComboboxPopover`), so it is anchored
 * to the button and rendered through a portal like every other panel in the
 * app, whatever the header does around it.
 *
 * Keyboard: opening hands the panel the focus (it is portalled to the end of
 * the document, so a keyboard left on the button would tab the whole page
 * before reaching a filter), and Escape — or the panel's own close and Done
 * buttons — closes it and returns focus to the button that opened it, so the
 * key is never left on a panel that has unmounted.
 */
export function FilterPopover({
  summary,
  active = false,
  title = "Filters",
  minW = 264,
  align = "left",
  children,
}: {
  /** The standing choice, short enough for a phone's button. */
  summary: string;
  /** Whether something other than the default is standing. */
  active?: boolean;
  title?: string;
  minW?: number;
  align?: "left" | "right";
  /** The controls themselves, exactly as the wide screens show them. */
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  /**
   * Close the panel, handing focus back to the button that opened it when the
   * close came from inside the panel — the panel unmounts through its portal,
   * so without this the key would drop onto the page body.
   */
  const closeFromPanel = () => {
    setOpen(false);
    triggerRef.current?.focus();
  };

  // The keyboard joins the panel itself as soon as it has rendered: the first
  // filter control, or the panel's own close button when a desk's panel holds
  // none — so Tab and the arrow keys answer to the filters, not the page.
  useEffect(() => {
    if (!open) return;
    // The panel is positioned after paint (its height matters), so it can
    // take a few frames to exist — keep looking for it, the way
    // ComboboxPopover keeps re-measuring, and hand it the focus the moment
    // it does. Bounded so a panel that never appears cannot spin.
    let frame = 0;
    let tries = 0;
    const handOver = () => {
      const panel = panelRef.current;
      if (panel) {
        (
          panel.querySelector<HTMLElement>("select, input, textarea") ??
          panel.querySelector<HTMLElement>("button")
        )?.focus();
        return;
      }
      if (++tries < 60) frame = requestAnimationFrame(handOver);
    };
    frame = requestAnimationFrame(handOver);
    return () => cancelAnimationFrame(frame);
  }, [open]);

  // Escape closes the panel from wherever the keyboard stands in it, and
  // focus goes back to the button that opened it.
  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setOpen(false);
      triggerRef.current?.focus();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  // A press anywhere else — the other controls in the header, or the list
  // under the panel — closes it, the way the desks' own menus do.
  useEffect(() => {
    if (!open) return;
    function onPress(event: MouseEvent) {
      const target = event.target as Node | null;
      if (!target) return;
      if (anchorRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", onPress);
    return () => document.removeEventListener("mousedown", onPress);
  }, [open]);

  return (
    <div ref={anchorRef} className="shrink-0 sm:hidden">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((standing) => !standing)}
        aria-expanded={open}
        aria-label={title}
        title={title}
        className={`relative inline-flex h-8 items-center gap-1.5 rounded-xl border px-2.5 text-xs font-semibold transition ${
          open || active
            ? "border-ember bg-ember/10 text-ember"
            : "border-sand-mute bg-white text-moss hover:text-bark"
        }`}
      >
        <SlidersHorizontal size={15} aria-hidden="true" />
        <span className="max-w-[6.5rem] truncate">{summary}</span>
        {active && (
          <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-ember ring-2 ring-white" />
        )}
      </button>
      <ComboboxPopover
        anchorRef={anchorRef}
        panelRef={panelRef}
        open={open}
        minW={minW}
        align={align}
        panelClassName="rounded-2xl border border-sand-line bg-white p-3 shadow-2xl"
      >
        <div className="space-y-2.5">
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs font-bold text-bark">{title}</span>
            <button
              type="button"
              onClick={closeFromPanel}
              aria-label={`Close ${title.toLowerCase()}`}
              className="rounded p-0.5 text-moss transition hover:text-bark"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>
          {children}
          <button
            type="button"
            onClick={closeFromPanel}
            className="w-full rounded-xl bg-ember px-3 py-2 text-xs font-semibold text-white transition hover:bg-ember-dark"
          >
            Done
          </button>
        </div>
      </ComboboxPopover>
    </div>
  );
}

/** One named control inside the panel — the same name the wide screen's label carries. */
export function FilterSet({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[10px] font-bold uppercase tracking-wide text-moss">{label}</span>
      <span className="mt-1 block">{children}</span>
    </label>
  );
}

/** The panel's own select: full width, so a long category name still reads. */
export const FILTER_SELECT_CLASS =
  "w-full rounded-xl border border-sand-mute bg-white px-2.5 py-1.5 text-xs font-semibold text-bark outline-none focus:border-ember";
