"use client";

import { useEffect, useRef } from "react";

/**
 * The chat composer's emoji set — a small, fixed card, no dependency.
 *
 * The church's talk leans on the usual faces, a few gestures and the faith
 * symbols members actually use, so five short groups cover it; searching a
 * full Unicode catalogue would cost more than the picker earns. The panel
 * opens upward (the composer sits at the foot of the thread), closes on an
 * outside click or Escape, and hands each pick to the caller — which splices
 * it into the draft at the caret.
 */
const GROUPS: { label: string; emojis: string[] }[] = [
  {
    label: "Smileys",
    emojis: [
      "😀", "😄", "😁", "😆", "😅", "😂", "🙂", "😉", "😊", "😍", "😘", "😜",
      "🤗", "🤔", "😐", "😴", "😔", "😢", "😭", "😤", "😡", "😮", "🥳", "😬",
      "🙄", "😷", "🤒", "🤕", "🤩", "🥺",
    ],
  },
  {
    label: "Gestures",
    emojis: [
      "👍", "👎", "👏", "🙌", "🤝", "🙏", "💪", "👋", "🤙", "✌️", "👌", "🤞",
      "☝️", "👆", "👇", "👈", "👉", "✋",
    ],
  },
  {
    label: "Hearts",
    emojis: [
      "❤️", "🧡", "💛", "💚", "💙", "💜", "🖤", "🤍", "💔", "❣️", "💕", "💞",
      "💓", "💗", "💖", "💘", "💝", "💟",
    ],
  },
  {
    label: "Faith",
    emojis: [
      "✝️", "⛪", "🙏", "🕊️", "📖", "🕯️", "✨", "🌟", "🌈", "☀️", "🌙", "⛰️",
      "🌊", "🎶", "🎵", "👑",
    ],
  },
  {
    label: "Church life",
    emojis: [
      "📅", "📎", "✅", "❌", "❓", "❗", "💡", "🎉", "🎁", "🍞", "🍇", "☕",
      "🚌", "🏠", "🛠️", "💰",
    ],
  },
];

export function EmojiPicker({ onPick, onClose }: { onPick: (emoji: string) => void; onClose: () => void }) {
  const panelRef = useRef<HTMLDivElement>(null);

  // Close on an outside click or Escape — but not on the trigger button,
  // whose own click is a toggle (it carries `data-emoji-trigger`).
  useEffect(() => {
    const onPointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      if (target.closest("[data-emoji-trigger]")) return;
      if (panelRef.current && !panelRef.current.contains(target)) onClose();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-label="Choose an emoji"
      className="absolute bottom-full right-0 z-40 mb-2 w-64 rounded-2xl border border-sand-line bg-white p-3 shadow-xl"
    >
      <div className="max-h-56 overflow-y-auto custom-hover-scrollbar">
        {GROUPS.map((group) => (
          <div key={group.label} className="mb-2 last:mb-0">
            <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-moss">{group.label}</p>
            <div className="grid grid-cols-8 gap-0.5">
              {group.emojis.map((emoji, index) => (
                <button
                  key={`${emoji}-${index}`}
                  type="button"
                  onClick={() => onPick(emoji)}
                  aria-label={`Insert ${emoji}`}
                  className="rounded-lg py-0.5 text-lg leading-7 transition hover:bg-sand"
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
