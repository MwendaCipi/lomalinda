"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { ComboboxPopover } from "@/components/combobox-popover";

export type AreaOption = {
  code: string;
  label: string;
  group?: "department" | "ministry" | "office";
  description?: string;
};

export function DepartmentPicker({
  legend = "Department",
  options,
  value,
  onChange,
  placeholder = "-- Select Department --",
  allowUnassigned = true,
  disabled = false,
  helpText,
  required,
  compact = false,
}: {
  legend?: string;
  options: AreaOption[];
  value: string;
  onChange: (code: string) => void;
  placeholder?: string;
  allowUnassigned?: boolean;
  disabled?: boolean;
  helpText?: string;
  required?: boolean;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node;
      if (
        containerRef.current &&
        !containerRef.current.contains(target) &&
        !(panelRef.current && panelRef.current.contains(target))
      ) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const selectedOption = options.find((opt) => opt.code === value);
  const summary = selectedOption ? selectedOption.label : placeholder;

  return (
    <div ref={containerRef}>
      {legend && (
        <span
          className={`block font-medium ${
            compact ? "text-xs font-semibold text-bark" : "text-sm"
          }`}
        >
          {legend}
          {required ? " *" : ""}
        </span>
      )}
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={`mt-1.5 flex w-full items-center justify-between gap-3 rounded-xl border ${
          compact
            ? "border-sand-line bg-sand-plate px-3.5 py-2.5 text-xs text-bark focus:border-ember focus:bg-white focus:outline-none"
            : "border-sand-mute bg-white px-4 py-2.5 text-sm text-bark outline-none focus:border-ember"
        } text-left ${disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}
      >
        <span className={`truncate ${!selectedOption ? "text-moss" : "font-medium"}`}>
          {summary}
        </span>
        <span className="flex shrink-0 items-center gap-2 text-moss">
          <span className={`transition-transform ${open ? "rotate-180" : ""}`}>
            <ChevronDown size={compact ? 12 : 14} aria-hidden="true" />
          </span>
        </span>
      </button>

      <ComboboxPopover
        anchorRef={containerRef}
        panelRef={panelRef}
        open={open}
        minW={280}
        panelClassName="max-h-72 overflow-y-auto rounded-xl border border-sand-line bg-white p-2 shadow-lg scrollbar-thin z-50"
      >
        {allowUnassigned && (
          <button
            type="button"
            onClick={() => {
              onChange("");
              setOpen(false);
            }}
            className={`flex w-full cursor-pointer items-center justify-between rounded-lg px-2.5 py-2 text-left text-xs sm:text-sm ${
              !value ? "bg-mist-select font-semibold text-sage-bright" : "hover:bg-sand"
            }`}
          >
            <span>Unassigned</span>
            {!value && <Check size={14} className="text-sage-bright" />}
          </button>
        )}
        {options.map((item) => {
          const isSelected = item.code === value;
          return (
            <button
              type="button"
              key={item.code}
              onClick={() => {
                onChange(item.code);
                setOpen(false);
              }}
              className={`flex w-full cursor-pointer items-start justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-xs sm:text-sm ${
                isSelected ? "bg-mist-select font-semibold text-sage-bright" : "hover:bg-sand"
              }`}
            >
              <div className="min-w-0">
                <div className="font-medium text-bark">{item.label}</div>
                {item.description && (
                  <div className="mt-0.5 line-clamp-1 text-[11px] text-moss sm:text-xs">
                    {item.description}
                  </div>
                )}
              </div>
              {isSelected && <Check size={14} className="mt-0.5 shrink-0 text-sage-bright" />}
            </button>
          );
        })}
      </ComboboxPopover>
      {helpText && <span className="mt-1 block text-xs text-moss">{helpText}</span>}
    </div>
  );
}

export function MinistriesPicker({
  legend = "Ministries",
  options,
  selected,
  onChange,
  placeholder = "-- Select Ministries --",
  disabled = false,
  helpText,
  required,
  compact = false,
}: {
  legend?: string;
  options: AreaOption[];
  selected: string[];
  onChange: (codes: string[]) => void;
  placeholder?: string;
  disabled?: boolean;
  helpText?: string;
  required?: boolean;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node;
      if (
        containerRef.current &&
        !containerRef.current.contains(target) &&
        !(panelRef.current && panelRef.current.contains(target))
      ) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const toggle = (code: string) => {
    if (selected.includes(code)) {
      onChange(selected.filter((item) => item !== code));
    } else {
      onChange([...selected, code]);
    }
  };

  const selectedLabels = selected
    .map((code) => options.find((opt) => opt.code === code)?.label || code)
    .filter(Boolean);

  const summary =
    selectedLabels.length === 0
      ? placeholder
      : selectedLabels.length <= 2
        ? selectedLabels.join(", ")
        : `${selectedLabels.slice(0, 2).join(", ")} +${selectedLabels.length - 2} more`;

  return (
    <div ref={containerRef}>
      {legend && (
        <span
          className={`block font-medium ${
            compact ? "text-xs font-semibold text-bark" : "text-sm"
          }`}
        >
          {legend}
          {required ? " *" : ""}
        </span>
      )}
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={`mt-1.5 flex w-full items-center justify-between gap-3 rounded-xl border ${
          compact
            ? "border-sand-line bg-sand-plate px-3.5 py-2.5 text-xs text-bark focus:border-ember focus:bg-white focus:outline-none"
            : "border-sand-mute bg-white px-4 py-2.5 text-sm text-bark outline-none focus:border-ember"
        } text-left ${disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}
      >
        <span className={`truncate ${selected.length === 0 ? "text-moss" : "font-medium"}`}>
          {summary}
        </span>
        <span className="flex shrink-0 items-center gap-2 text-moss">
          {selected.length > 0 && (
            <span className="rounded-full bg-sage px-1.5 py-0.5 text-[10px] font-bold text-white">
              {selected.length}
            </span>
          )}
          <span className={`transition-transform ${open ? "rotate-180" : ""}`}>
            <ChevronDown size={compact ? 12 : 14} aria-hidden="true" />
          </span>
        </span>
      </button>

      <ComboboxPopover
        anchorRef={containerRef}
        panelRef={panelRef}
        open={open}
        minW={280}
        panelClassName="max-h-72 overflow-y-auto rounded-xl border border-sand-line bg-white p-2 shadow-lg scrollbar-thin z-50"
      >
        {options.map((item) => {
          const checked = selected.includes(item.code);
          return (
            <label
              key={item.code}
              className={`flex cursor-pointer items-start gap-2.5 rounded-lg px-2.5 py-2 text-xs sm:text-sm ${
                checked ? "bg-mist-select font-semibold text-sage-bright" : "hover:bg-sand"
              }`}
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={() => toggle(item.code)}
                className="mt-0.5 h-4 w-4 rounded border-sand-mute accent-sage"
              />
              <div className="min-w-0 flex-1">
                <div className="font-medium text-bark">{item.label}</div>
                {item.description && (
                  <div className="mt-0.5 line-clamp-1 text-[11px] text-moss sm:text-xs">
                    {item.description}
                  </div>
                )}
              </div>
            </label>
          );
        })}
        <div className="sticky bottom-0 -mx-2 mt-1 border-t border-sand-line bg-white px-2 pt-2">
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="w-full rounded-lg bg-bark px-3 py-2 text-xs font-semibold text-white"
          >
            Done
          </button>
        </div>
      </ComboboxPopover>
      {helpText && <span className="mt-1 block text-xs text-moss">{helpText}</span>}
    </div>
  );
}
