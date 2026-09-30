"use client";

import React, { useState, useRef, useEffect } from "react";
import { Accessibility, Eye, Type, SunMedium, Focus, Zap, RotateCcw, X } from "lucide-react";
import { useAccessibility, FontSizeOption } from "@/context/accessibility-context";

interface AccessibilityMenuProps {
  buttonClassName?: string;
  style?: React.CSSProperties;
}

export function AccessibilityMenu({ buttonClassName, style }: AccessibilityMenuProps) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const {
    fontSize,
    highContrast,
    dyslexicFont,
    reducedMotion,
    highVisFocus,
    setFontSize,
    setHighContrast,
    setDyslexicFont,
    setReducedMotion,
    setHighVisFocus,
    resetDefaults,
  } = useAccessibility();

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const isAnyActive =
    fontSize !== "normal" || highContrast || dyslexicFont || reducedMotion || highVisFocus;

  return (
    <div ref={menuRef} className="relative inline-flex" style={style}>
      <button
        type="button"
        className={
          buttonClassName ||
          `relative flex h-9 w-9 items-center justify-center rounded-xl border transition-colors focus:outline-none ${
            isAnyActive
              ? "bg-ember text-white border-ember"
              : "bg-white/10 text-white border-white/15 hover:bg-white/20"
          }`
        }
        onClick={() => setOpen((o) => !o)}
        title="Accessibility Settings & Preferences"
        aria-label="Accessibility Options"
        aria-expanded={open}
      >
        <Accessibility size={18} aria-hidden="true" />
        {isAnyActive && (
          <span className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-gold ring-2 ring-bark" />
        )}
      </button>

      {open && (
        <div
          className="a11y-popover-card fixed left-1/2 -translate-x-1/2 top-16 mt-2 w-[calc(100vw-2rem)] max-w-sm sm:absolute sm:left-auto sm:right-0 sm:translate-x-0 sm:top-full sm:w-80 rounded-2xl border border-sand-line bg-white p-4 text-bark shadow-2xl z-50 animate-in fade-in slide-in-from-top-2 duration-150"
          role="dialog"
          aria-label="Accessibility settings menu"
        >
          <div className="flex items-center justify-between border-b border-sand-line pb-2.5 mb-3.5">
            <div className="flex items-center gap-2">
              <Accessibility size={18} className="text-ember" aria-hidden="true" />
              <h4 className="m-0 text-sm font-bold text-bark">Accessibility Options</h4>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close accessibility menu"
              className="rounded p-1 text-moss hover:bg-sand hover:text-bark transition"
            >
              <X size={16} />
            </button>
          </div>

          <div className="grid gap-3.5">
            {/* Font Size Segmented Control */}
            <div>
              <label className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-bark">
                <Type size={14} className="text-ember" /> Text Scaling
              </label>
              <div className="grid grid-cols-3 gap-1.5">
                {(["normal", "large", "xlarge"] as FontSizeOption[]).map((size) => (
                  <button
                    key={size}
                    type="button"
                    onClick={() => setFontSize(size)}
                    aria-pressed={fontSize === size}
                    className={`rounded-xl py-1.5 text-xs font-semibold transition ${
                      fontSize === size
                        ? "bg-bark text-white shadow-xs"
                        : "border border-sand-line bg-white text-moss hover:border-ember hover:text-bark"
                    }`}
                  >
                    {size === "normal" ? "Standard" : size === "large" ? "Large A+" : "XL A++"}
                  </button>
                ))}
              </div>
            </div>

            {/* Toggles */}
            <label className="a11y-toggle-row flex items-center justify-between cursor-pointer rounded-xl p-2 text-xs font-medium hover:bg-sand transition">
              <span className="flex items-center gap-2 text-bark">
                <SunMedium size={15} className="text-ember" /> High Contrast Theme
              </span>
              <input
                type="checkbox"
                checked={highContrast}
                onChange={(e) => setHighContrast(e.target.checked)}
                className="h-4 w-4 rounded border-sand-line accent-ember cursor-pointer"
              />
            </label>

            <label className="a11y-toggle-row flex items-center justify-between cursor-pointer rounded-xl p-2 text-xs font-medium hover:bg-sand transition">
              <span className="flex items-center gap-2 text-bark">
                <Eye size={15} className="text-ember" /> Dyslexia-Friendly Font
              </span>
              <input
                type="checkbox"
                checked={dyslexicFont}
                onChange={(e) => setDyslexicFont(e.target.checked)}
                className="h-4 w-4 rounded border-sand-line accent-ember cursor-pointer"
              />
            </label>

            <label className="a11y-toggle-row flex items-center justify-between cursor-pointer rounded-xl p-2 text-xs font-medium hover:bg-sand transition">
              <span className="flex items-center gap-2 text-bark">
                <Focus size={15} className="text-ember" /> High Visibility Focus Ring
              </span>
              <input
                type="checkbox"
                checked={highVisFocus}
                onChange={(e) => setHighVisFocus(e.target.checked)}
                className="h-4 w-4 rounded border-sand-line accent-ember cursor-pointer"
              />
            </label>

            <label className="a11y-toggle-row flex items-center justify-between cursor-pointer rounded-xl p-2 text-xs font-medium hover:bg-sand transition">
              <span className="flex items-center gap-2 text-bark">
                <Zap size={15} className="text-ember" /> Reduce Animations &amp; Motion
              </span>
              <input
                type="checkbox"
                checked={reducedMotion}
                onChange={(e) => setReducedMotion(e.target.checked)}
                className="h-4 w-4 rounded border-sand-line accent-ember cursor-pointer"
              />
            </label>
          </div>

          <div className="mt-3.5 pt-2.5 border-t border-sand-line flex justify-end">
            <button
              type="button"
              onClick={resetDefaults}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-rose-600 hover:text-rose-700 transition"
            >
              <RotateCcw size={12} /> Reset Defaults
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
