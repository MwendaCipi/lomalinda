"use client";

import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";

interface ComboboxPopoverProps {
  /** The trigger's container — the panel anchors to its bounding rect. */
  anchorRef: RefObject<HTMLElement | null>;
  /** Optional shared ref to the rendered panel, so the owner's
      outside-click handler can tell panel clicks from outside clicks. */
  panelRef?: RefObject<HTMLDivElement | null>;
  open: boolean;
  /** Minimum panel width in px; the panel is never narrower than its trigger. */
  minW?: number;
  /** Chrome (radius, padding, shadow, scrolling) on top of the positioning. */
  panelClassName?: string;
  /** Which edge of the trigger the panel aligns to. */
  align?: "left" | "right";
  children: ReactNode;
}

/**
 * Renders a combobox's dropdown through a portal, anchored to its trigger.
 *
 * The Add/Edit member modals scroll, and an absolutely-positioned panel inside
 * a scrolling ancestor is clipped by that ancestor no matter how high its
 * z-index — "the selection fields are cut off by the small height of the
 * modal". Anchoring to the trigger's bounding rect and rendering through a
 * portal to document.body lifts the panel out of the modal's overflow, without
 * making the modal taller. The panel flips above the trigger when it would run
 * off the bottom of the viewport and there is more room above.
 */
export function ComboboxPopover({
  anchorRef,
  panelRef,
  open,
  minW = 0,
  panelClassName = "",
  align = "left",
  children,
}: ComboboxPopoverProps) {
  const [style, setStyle] = useState<CSSProperties | null>(null);
  const localPanelRef = useRef<HTMLDivElement | null>(null);
  const panel = panelRef ?? localPanelRef;

  useEffect(() => {
    if (!open) {
      setStyle(null);
      return;
    }
    const update = () => {
      const trigger = anchorRef.current;
      if (!trigger) return;
      const rect = trigger.getBoundingClientRect();
      const width = Math.max(rect.width, minW);
      const gap = 6;
      const panelH = panel.current?.offsetHeight ?? 0;
      let top = rect.bottom + gap;
      if (
        panelH &&
        top + panelH > window.innerHeight - 8 &&
        rect.top - panelH - gap > 8
      ) {
        top = rect.top - panelH - gap;
      }
      const left = align === "right" ? rect.right - width : rect.left;
      setStyle({ position: "fixed", top, left, width, zIndex: 70 });
    };
    update();
    // Re-measure once the panel has actually rendered (its height matters).
    const raf = requestAnimationFrame(update);
    // Any scroll — the modal's own overflow pane or the page — or a resize
    // moves the trigger, so the panel tracks it while open.
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    // Panel height changes (a search box, a "specify other" field appearing)
    // and layout shifts reposition through a light poll — cheaper and far
    // simpler than threading resize observers through every caller.
    const poll = window.setInterval(update, 350);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
      window.clearInterval(poll);
    };
  }, [open, anchorRef, panel, minW, align]);

  if (!open || !style) return null;
  return createPortal(
    <div ref={panel} style={style} className={panelClassName}>
      {children}
    </div>,
    document.body,
  );
}
