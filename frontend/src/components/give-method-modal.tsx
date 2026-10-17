"use client";

import { useEffect } from "react";
import { Landmark, Package, X } from "lucide-react";

export type GiveMethodModalProps = {
  open: boolean;
  onClose: () => void;
  /** The post the gift is for — named so the giver knows what they are funding. */
  title?: string | null;
  /** Money: M-Pesa, or a bank transfer recorded by the office. */
  onGiveMoney?: () => void;
  /** In kind: goods handed to the church instead of money. */
  onGiveInKind?: () => void;
};

/**
 * The two doors into giving — money or goods — behind the feed's single
 * "Give Now" button. A contribution card used to carry the whole combo
 * inline (Pledge, In-kind, Give Money), which crowded the row; the choice
 * now lives one tap away in this box, so the card keeps three buttons:
 * Give Now, Pledge, Comment.
 *
 * The caller runs the real form from each option — the same money modal or
 * in-kind modal the old inline buttons opened — so nothing about the giving
 * itself changes, only where the choice is made. When the caller does not
 * wire an option in (a card posting a family photo, say), the matching door
 * is hidden rather than shown disabled, so the box only carries real doors.
 */
export function GiveMethodModal({ open, onClose, title, onGiveMoney, onGiveInKind }: GiveMethodModalProps) {
  // Escape closes the box, the same as the X and a tap on the backdrop.
  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [open, onClose]);

  if (!open) return null;

  const options = [
    {
      key: "money",
      icon: Landmark,
      label: "Give Money",
      hint: "Give by M-Pesa or record a bank transfer",
      action: onGiveMoney,
    },
    {
      key: "kind",
      icon: Package,
      label: "Give in Kind",
      hint: "Goods you hand to the church",
      action: onGiveInKind,
    },
  ].filter((option): option is typeof option & { action: () => void } => Boolean(option.action));

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Choose how to give"
        onClick={(event) => event.stopPropagation()}
        className="w-full max-w-md overflow-hidden rounded-3xl border border-sand-line bg-white p-6 shadow-2xl"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-ember">Give Now</p>
            {title && (
              <h2 className="mt-1 line-clamp-2 text-lg font-bold leading-snug text-bark">{title}</h2>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mr-1 shrink-0 rounded-full p-1.5 text-moss transition hover:bg-sand-veil hover:text-ember"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        {options.length > 0 && (
          <div className="mt-4 space-y-3">
            {options.map(({ key, icon: Icon, label, hint, action }) => (
              <button
                key={key}
                type="button"
                onClick={action}
                className="flex w-full items-center gap-3 rounded-2xl border border-sand-mute bg-white px-4 py-4 text-left transition hover:border-ember hover:bg-sand-airy"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-ember/10 text-ember">
                  <Icon size={18} aria-hidden="true" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-bold text-bark">{label}</span>
                  <span className="block text-xs text-moss">{hint}</span>
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
