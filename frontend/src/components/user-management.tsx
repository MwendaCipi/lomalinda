"use client";

import { useEffect, useRef, useState } from "react";
import {
  AccountTypeCombobox,
  accountTypeOf,
  accountTypeLabel,
  type AccountTypeOption,
  RolesCombobox,
  refreshRoleRegister,
  formatRoles,
  heldSystemRoles,
  SYSTEM_ROLE_HELP,
} from "./roles-combobox";
import { showAlert } from "@/lib/alerts";
import { RecordList } from "./record-list";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

/**
 * Column widths, declared once and applied to both the header and the cells.
 *
 * Left to itself the browser handed the surplus width to whichever column sat
 * next to the widest content, so Role and Type drifted apart by a hand's width
 * depending on how long a name or a phone number happened to be. Pinning the
 * columns keeps the same grid for every roster.
 */
const COL_INDEX = "w-8";
const COL_NAME = "w-[14rem]";
const COL_CONTACT = "w-[12rem]";
const COL_ROLE = "w-[13rem]";
const COL_TYPE = "w-[9rem]";
const COL_SEX = "w-[4rem]";

export type MemberUser = {
  id: number;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  role: string;
  roles?: string[];
  /** Roles this member shares as an assistant (a subset of ``roles``). */
  assistant_roles?: string[];
  current_church?: string;
  baptismal_status?: string;
  phone_number?: string;
  whatsapp_number?: string;
  account_type?: string;
  profession?: string;
  residence?: string;
  gender?: string;
  date_of_birth?: string;
  gifts?: string;
  disability?: string;
  is_disfellowshipped?: boolean;
  /** False while leadership has not yet approved a friend/Sabbath School joining. */
  is_active?: boolean;
  /** True only for the installation's owner account, which is not a member. */
  is_superuser?: boolean;
};

type MemberFilter = "all" | "members" | "friends" | "ex_members";
type InvitationFilter = "confirmed" | "pending";

export const AVAILABLE_GIFTS = [
  "Preaching",
  "Ushering",
  "Children Teacher",
  "Lesson Facilitation",
  "Choir Teaching",
  "Singing / Music",
  "Evangelism & Outreach",
  "Prayer Ministry",
  "Visitation & Pastoral Care",
  "Hospitality & Welfare",
  "Health Ministry",
  "Sound & Media Tech",
  "Deaconry & Maintenance",
  "Treasury & Stewardship",
  "Youth Mentorship",
  "Administration & Organizing",
];

interface GiftsComboboxProps {
  selectedGifts: string[];
  onChange: (gifts: string[]) => void;
  placeholder?: string;
}

export function GiftsCombobox({
  selectedGifts,
  onChange,
  placeholder = "Select gifts & talents...",
}: GiftsComboboxProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [customGift, setCustomGift] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  const toggleGift = (gift: string) => {
    if (selectedGifts.includes(gift)) {
      onChange(selectedGifts.filter((g) => g !== gift));
    } else {
      onChange([...selectedGifts, gift]);
    }
  };

  const handleAddCustomGift = () => {
    const trimmed = customGift.trim();
    if (!trimmed) return;
    if (!selectedGifts.includes(trimmed)) {
      onChange([...selectedGifts, trimmed]);
    }
    setCustomGift("");
  };

  const allGifts = Array.from(new Set([...AVAILABLE_GIFTS, ...selectedGifts]));
  const filteredGifts = allGifts.filter((g) =>
    g.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div ref={containerRef} className="relative mt-1">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex min-h-[38px] w-full items-center justify-between gap-2 rounded-xl border border-[#dfdbd1] bg-[#fcfbf9] px-3.5 py-2 text-xs text-[#26352f] transition hover:bg-white focus:border-[#b36b3c] focus:bg-white focus:outline-none"
      >
        <div className="flex flex-1 flex-wrap items-center gap-1.5 overflow-hidden text-left">
          {selectedGifts.length === 0 ? (
            <span className="text-[#617068]">{placeholder}</span>
          ) : (
            <>
              {selectedGifts.slice(0, 2).map((gift) => (
                <span
                  key={gift}
                  className="inline-flex items-center gap-1 rounded-md bg-[#eef2ed] px-2 py-0.5 text-[11px] font-semibold text-[#2d5d39]"
                >
                  <span>{gift}</span>
                </span>
              ))}
              {selectedGifts.length > 2 && (
                <span className="rounded-md bg-[#f7f4ee] px-1.5 py-0.5 text-[10px] font-bold text-[#b36b3c] border border-[#dfdbd1]">
                  +{selectedGifts.length - 2} more
                </span>
              )}
            </>
          )}
        </div>
        <div className="flex items-center gap-1.5 text-[#617068]">
          {selectedGifts.length > 0 && (
            <span className="rounded-full bg-[#5f8067] px-1.5 py-0.5 text-[10px] font-bold text-white">
              {selectedGifts.length}
            </span>
          )}
          <span className={`text-[10px] transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}>
            ▼
          </span>
        </div>
      </button>

      {isOpen && (
        <div className="absolute left-0 bottom-full z-50 mb-1.5 w-full min-w-[280px] rounded-2xl border border-[#dfdbd1] bg-white p-3 shadow-2xl ring-1 ring-black/5 sm:min-w-[320px]">
          <div className="flex items-center justify-between border-b border-[#dfdbd1] pb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-[#b36b3c]">
              Select Member Gifts ({selectedGifts.length})
            </span>
            <div className="flex items-center gap-2">
              {selectedGifts.length > 0 && (
                <button
                  type="button"
                  onClick={() => onChange([])}
                  className="text-[11px] text-[#8c2e2e] hover:underline"
                >
                  Clear all
                </button>
              )}
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="rounded-md bg-[#26352f] px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-[#b36b3c]"
              >
                Done
              </button>
            </div>
          </div>

          <div className="mt-2">
            <input
              type="text"
              placeholder="Search or filter gifts..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-lg border border-[#dfdbd1] bg-[#fcfbf9] px-2.5 py-1.5 text-xs text-[#26352f] outline-none focus:border-[#b36b3c] focus:bg-white"
            />
          </div>

          <div className="mt-2 max-h-48 space-y-1 overflow-y-auto pr-1 scrollbar-thin">
            {filteredGifts.map((gift) => {
              const isChecked = selectedGifts.includes(gift);
              return (
                <label
                  key={gift}
                  className={`flex items-center justify-between gap-2 rounded-xl px-2.5 py-1.5 text-xs cursor-pointer transition select-none ${
                    isChecked
                      ? "bg-[#eef2ed] text-[#2d5d39] font-semibold"
                      : "text-[#26352f] hover:bg-[#f7f4ee]"
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => toggleGift(gift)}
                      className="h-4 w-4 rounded accent-[#5f8067] cursor-pointer"
                    />
                    <span>{gift}</span>
                  </div>
                  {isChecked && <span className="text-xs text-[#5f8067]">✓</span>}
                </label>
              );
            })}
            {filteredGifts.length === 0 && (
              <p className="py-2 text-center text-xs text-[#617068]">No matching gifts found.</p>
            )}
          </div>

          <div className="mt-3 border-t border-[#dfdbd1] pt-2">
            <div className="flex items-center gap-1.5">
              <input
                type="text"
                placeholder="Add other gift / talent..."
                value={customGift}
                onChange={(e) => setCustomGift(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleAddCustomGift();
                  }
                }}
                className="flex-1 rounded-lg border border-[#dfdbd1] bg-[#fcfbf9] px-2.5 py-1 text-xs text-[#26352f] outline-none focus:border-[#b36b3c]"
              />
              <button
                type="button"
                onClick={handleAddCustomGift}
                className="rounded-lg bg-[#5f8067] px-2.5 py-1 text-xs font-semibold text-white hover:bg-[#4d6d55]"
              >
                + Add
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export const AVAILABLE_DISABILITIES = [
  "Visual Impairment (Blind / Low Vision)",
  "Hearing Impairment (Deaf / Hard of Hearing)",
  "Physical / Mobility Impairment",
  "Speech / Communication Difficulty",
  "Intellectual / Learning Disability",
  "Mental Health / Psychosocial Condition",
  "Autism Spectrum Disorder",
  "Albinism",
  "Chronic Health Condition",
  "Other Special Need",
];

interface DisabilityComboboxProps {
  selectedDisabilities: string[];
  onChange: (disabilities: string[]) => void;
  placeholder?: string;
}

export function DisabilityCombobox({
  selectedDisabilities,
  onChange,
  placeholder = "Select disability (optional)...",
}: DisabilityComboboxProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [customDisability, setCustomDisability] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  const toggleDisability = (item: string) => {
    if (selectedDisabilities.includes(item)) {
      onChange(selectedDisabilities.filter((d) => d !== item));
    } else {
      onChange([...selectedDisabilities, item]);
    }
  };

  const handleAddCustom = () => {
    const trimmed = customDisability.trim();
    if (!trimmed) return;
    if (!selectedDisabilities.includes(trimmed)) {
      onChange([...selectedDisabilities, trimmed]);
    }
    setCustomDisability("");
  };

  const allDisabilities = Array.from(new Set([...AVAILABLE_DISABILITIES, ...selectedDisabilities]));
  const filteredDisabilities = allDisabilities.filter((d) =>
    d.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div ref={containerRef} className="relative mt-1">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex min-h-[38px] w-full items-center justify-between gap-2 rounded-xl border border-[#dfdbd1] bg-[#fcfbf9] px-3.5 py-2 text-xs text-[#26352f] transition hover:bg-white focus:border-[#b36b3c] focus:bg-white focus:outline-none"
      >
        <div className="flex flex-1 flex-wrap items-center gap-1.5 overflow-hidden text-left">
          {selectedDisabilities.length === 0 ? (
            <span className="text-[#617068]">{placeholder}</span>
          ) : (
            <>
              {selectedDisabilities.slice(0, 2).map((item) => (
                <span
                  key={item}
                  className="inline-flex items-center gap-1 rounded-md bg-[#fdf3eb] px-2 py-0.5 text-[11px] font-semibold text-[#a35622] border border-[#f3ddcc]"
                >
                  <span>♿ {item}</span>
                </span>
              ))}
              {selectedDisabilities.length > 2 && (
                <span className="rounded-md bg-[#f7f4ee] px-1.5 py-0.5 text-[10px] font-bold text-[#b36b3c] border border-[#dfdbd1]">
                  +{selectedDisabilities.length - 2} more
                </span>
              )}
            </>
          )}
        </div>
        <div className="flex items-center gap-1.5 text-[#617068]">
          {selectedDisabilities.length > 0 && (
            <span className="rounded-full bg-[#b36b3c] px-1.5 py-0.5 text-[10px] font-bold text-white">
              {selectedDisabilities.length}
            </span>
          )}
          <span className={`text-[10px] transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}>
            ▼
          </span>
        </div>
      </button>

      {isOpen && (
        <div className="absolute left-0 bottom-full z-50 mb-1.5 w-full min-w-[280px] rounded-2xl border border-[#dfdbd1] bg-white p-3 shadow-2xl ring-1 ring-black/5 sm:min-w-[320px]">
          <div className="flex items-center justify-between border-b border-[#dfdbd1] pb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-[#b36b3c]">
              Select Disability ({selectedDisabilities.length})
            </span>
            <div className="flex items-center gap-2">
              {selectedDisabilities.length > 0 && (
                <button
                  type="button"
                  onClick={() => onChange([])}
                  className="text-[11px] text-[#8c2e2e] hover:underline"
                >
                  Clear all
                </button>
              )}
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="rounded-lg bg-[#26352f] px-2.5 py-0.5 text-[11px] font-medium text-white hover:bg-[#b36b3c]"
              >
                Done
              </button>
            </div>
          </div>

          <div className="mt-2">
            <input
              type="text"
              placeholder="Search disability..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-lg border border-[#dfdbd1] bg-[#fcfbf9] px-2.5 py-1.5 text-xs text-[#26352f] outline-none focus:border-[#b36b3c]"
            />
          </div>

          <div className="mt-2 max-h-48 space-y-1 overflow-y-auto pr-1">
            {filteredDisabilities.length === 0 ? (
              <p className="py-2 text-center text-xs text-[#617068]">No matching categories found</p>
            ) : (
              filteredDisabilities.map((item) => {
                const isChecked = selectedDisabilities.includes(item);
                return (
                  <label
                    key={item}
                    className={`flex cursor-pointer items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-xs transition ${
                      isChecked
                        ? "bg-[#fdf3eb] font-semibold text-[#a35622]"
                        : "text-[#26352f] hover:bg-[#f7f4ee]"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleDisability(item)}
                        className="h-4 w-4 rounded accent-[#b36b3c] cursor-pointer"
                      />
                      <span>{item}</span>
                    </div>
                    {isChecked && <span className="text-xs text-[#b36b3c]">✓</span>}
                  </label>
                );
              })
            )}
          </div>

          <div className="mt-3 border-t border-[#dfdbd1] pt-2">
            <div className="flex items-center gap-1.5">
              <input
                type="text"
                placeholder="Add other disability / condition..."
                value={customDisability}
                onChange={(e) => setCustomDisability(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleAddCustom();
                  }
                }}
                className="flex-1 rounded-lg border border-[#dfdbd1] bg-[#fcfbf9] px-2.5 py-1 text-xs text-[#26352f] outline-none focus:border-[#b36b3c]"
              />
              <button
                type="button"
                onClick={handleAddCustom}
                disabled={!customDisability.trim()}
                className="rounded-lg bg-[#b36b3c] px-2.5 py-1 text-xs font-semibold text-white hover:bg-[#8c4b18] disabled:opacity-50"
              >
                + Add
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export const DEFAULT_PROFESSIONS = [
  "Accountant / Finance / Banking",
  "Architect / Interior Designer",
  "Business Owner / Entrepreneur",
  "Civil Servant / Public Officer",
  "Driver / Logistics / Transport",
  "Electrician / Technician / Artisan",
  "Engineer / IT / Software Developer",
  "Farmer / Agriculture / Agribusiness",
  "Healthcare / Doctor / Clinical Officer",
  "Healthcare / Nurse / Midwife",
  "Homemaker",
  "Human Resources / Administration",
  "Lawyer / Legal Practitioner",
  "Marketing / Sales / PR",
  "Mason / Builder / Contractor",
  "Media / Journalist / Photographer",
  "Pastor / Evangelist / Church Minister",
  "Pharmacist / Lab Technologist",
  "Security Officer / Police / Military",
  "Student / Scholar",
  "Tailor / Fashion Designer",
  "Teacher / Lecturer / Educator",
  "Other",
];

interface ProfessionComboboxProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export function ProfessionCombobox({
  value,
  onChange,
  placeholder = "Select or specify profession...",
}: ProfessionComboboxProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [customProfession, setCustomProfession] = useState("");
  const [professionsList, setProfessionsList] = useState<string[]>(DEFAULT_PROFESSIONS);
  const [specifyingOther, setSpecifyingOther] = useState(false);
  const [otherText, setOtherText] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch(`${API_URL}/api/members/professions/`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data: Array<{ id: number; name: string }> | null) => {
        if (data && Array.isArray(data) && data.length > 0) {
          const names = data.map((p) => p.name);
          if (!names.includes("Other")) {
            names.push("Other");
          }
          setProfessionsList(names);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setSpecifyingOther(false);
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  const filteredProfessions = professionsList.filter((item) =>
    item.toLowerCase().includes(search.toLowerCase())
  );

  const handleSelect = (prof: string) => {
    if (prof === "Other") {
      setSpecifyingOther(true);
      onChange("Other");
    } else {
      onChange(prof);
      setSpecifyingOther(false);
      setIsOpen(false);
    }
  };

  const handleSaveOther = () => {
    const trimmed = otherText.trim();
    if (trimmed) {
      onChange(`Other: ${trimmed}`);
    } else {
      onChange("Other");
    }
    setSpecifyingOther(false);
    setIsOpen(false);
    setOtherText("");
  };

  const handleAddCustom = async () => {
    const trimmed = customProfession.trim();
    if (!trimmed) return;
    onChange(trimmed);
    if (!professionsList.includes(trimmed)) {
      setProfessionsList((prev) => [trimmed, ...prev]);
      try {
        await fetch(`${API_URL}/api/members/professions/`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: trimmed }),
        });
      } catch {}
    }
    setCustomProfession("");
    setIsOpen(false);
  };

  return (
    <div ref={containerRef} className="relative w-full">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="mt-1 flex w-full items-center justify-between gap-2 rounded-xl border border-[#dfdbd1] bg-[#fcfbf9] px-3.5 py-2.5 text-left text-xs text-[#26352f] transition hover:border-[#b36b3c] focus:border-[#b36b3c] focus:bg-white focus:outline-none"
      >
        <div className="flex flex-1 items-center gap-2 truncate">
          {value ? (
            <span className="truncate font-semibold text-[#26352f]">
              💼 {value}
            </span>
          ) : (
            <span className="text-[#8b9790]">{placeholder}</span>
          )}
        </div>
        <div className="flex items-center gap-1.5 text-[#617068]">
          {value && (
            <span
              onClick={(e) => {
                e.stopPropagation();
                onChange("");
              }}
              className="rounded-full p-0.5 text-slate-400 hover:bg-slate-200 hover:text-[#26352f]"
              title="Clear profession"
            >
              ✕
            </span>
          )}
          <span className={`text-[10px] transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}>
            ▼
          </span>
        </div>
      </button>

      {isOpen && (
        <div className="absolute left-0 top-full z-50 mt-1.5 w-full min-w-[280px] rounded-2xl border border-[#dfdbd1] bg-white p-3 shadow-2xl ring-1 ring-black/5 sm:min-w-[340px]">
          <div className="flex items-center justify-between border-b border-[#dfdbd1] pb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-[#b36b3c]">
              Select Profession / Occupation
            </span>
            <div className="flex items-center gap-2">
              {value && (
                <button
                  type="button"
                  onClick={() => onChange("")}
                  className="text-[11px] text-[#8c2e2e] hover:underline"
                >
                  Clear
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  setIsOpen(false);
                  setSpecifyingOther(false);
                }}
                className="rounded-md bg-[#26352f] px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-[#b36b3c]"
              >
                Done
              </button>
            </div>
          </div>

          <div className="mt-2">
            <input
              type="text"
              placeholder="Search or filter professions..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-lg border border-[#dfdbd1] bg-[#fcfbf9] px-2.5 py-1.5 text-xs text-[#26352f] outline-none focus:border-[#b36b3c] focus:bg-white"
            />
          </div>

          <div className="mt-2 max-h-48 space-y-1 overflow-y-auto pr-1 scrollbar-thin">
            {filteredProfessions.map((item) => {
              const isSelected = value === item || (item === "Other" && value.startsWith("Other"));
              return (
                <div
                  key={item}
                  onClick={() => handleSelect(item)}
                  className={`flex cursor-pointer items-center justify-between gap-2 rounded-xl px-2.5 py-1.5 text-xs select-none transition ${
                    isSelected
                      ? "bg-[#fdf3eb] font-semibold text-[#a35622]"
                      : "text-[#26352f] hover:bg-[#f7f4ee]"
                  }`}
                >
                  <div className="flex items-center gap-2 truncate">
                    <span className="text-sm">{item === "Other" ? "✨" : "💼"}</span>
                    <span className="truncate">{item}</span>
                  </div>
                  {isSelected && <span className="text-xs font-bold text-[#b36b3c]">✓</span>}
                </div>
              );
            })}
            {filteredProfessions.length === 0 && (
              <p className="py-2 text-center text-xs text-[#617068]">No matching professions found.</p>
            )}
          </div>

          {specifyingOther && (
            <div className="mt-2.5 rounded-xl border border-[#b36b3c]/40 bg-[#fdf3eb]/60 p-2.5">
              <label className="block text-[11px] font-semibold text-[#a35622]">
                Specify &quot;Other&quot; Profession:
              </label>
              <div className="mt-1 flex items-center gap-1.5">
                <input
                  type="text"
                  placeholder="e.g. Graphic Designer, Plumber, Pilot..."
                  value={otherText}
                  onChange={(e) => setOtherText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleSaveOther();
                    }
                  }}
                  className="flex-1 rounded-lg border border-[#dfdbd1] bg-white px-2.5 py-1 text-xs text-[#26352f] outline-none focus:border-[#b36b3c]"
                />
                <button
                  type="button"
                  onClick={handleSaveOther}
                  className="rounded-lg bg-[#b36b3c] px-3 py-1 text-xs font-semibold text-white hover:bg-[#8c4b18]"
                >
                  Set
                </button>
              </div>
            </div>
          )}

          <div className="mt-3 border-t border-[#dfdbd1] pt-2">
            <div className="flex items-center gap-1.5">
              <input
                type="text"
                placeholder="Or type custom profession..."
                value={customProfession}
                onChange={(e) => setCustomProfession(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleAddCustom();
                  }
                }}
                className="flex-1 rounded-lg border border-[#dfdbd1] bg-[#fcfbf9] px-2.5 py-1 text-xs text-[#26352f] outline-none focus:border-[#b36b3c]"
              />
              <button
                type="button"
                onClick={handleAddCustom}
                disabled={!customProfession.trim()}
                className="rounded-lg bg-[#b36b3c] px-2.5 py-1 text-xs font-semibold text-white hover:bg-[#8c4b18] disabled:opacity-50"
              >
                + Set
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const MINISTRIES = [
  { value: "", label: "-- Select Ministry --" },
  { value: "youth_leader", label: "Adventist Youth" },
  { value: "women_ministry", label: "Adventist Women" },
  { value: "men_ministry", label: "Adventist Men" },
];

interface InvitationRow {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
  account_type: string;
  account_type_display: string;
  roles: string;
  role_codes: string[];
  status: "pending" | "accepted" | "revoked" | "expired";
  invited_by_name: string;
  sent_at: string | null;
  expires_at: string;
  created_at: string;
  // The raw link exists only right after create/resend; older rows carry no
  // link because tokens are stored hashed, so the copy button stays hidden.
  invite_url: string | null;
}

const inviteFormInitial = {
  email: "",
  first_name: "",
  last_name: "",
  phone_number: "",
  account_type: "member",
  // Account type determines member/friend status; roles are permission assignments only.
  roles: [] as string[],
};

const DEFAULT_MANUAL_PASSWORD = "Welcome@2026";

const initialForm = {
  name: "",
  username: "",
  password: DEFAULT_MANUAL_PASSWORD,
  gender: "",
  email: "",
  phone_number: "",
  whatsapp_number: "",
  role: "",
  gifts: [] as string[],
  disability: [] as string[],
  profession: "",
  date_of_birth: "",
};

function calculateAgeFromDob(dobStr: string): string {
  if (!dobStr) return "";
  const parts = dobStr.split("-");
  if (parts.length !== 3) return "";
  const [year, month, day] = parts.map(Number);
  if (!year || !month || !day) return "";

  const today = new Date();
  let calculatedAge = today.getFullYear() - year;
  const m = today.getMonth() + 1 - month;
  if (m < 0 || (m === 0 && today.getDate() < day)) {
    calculatedAge--;
  }
  return calculatedAge >= 0 ? String(calculatedAge) : "";
}

function calculateDobFromAge(ageStr: string): string {
  if (ageStr === "" || isNaN(Number(ageStr))) return "";
  const ageNum = parseInt(ageStr, 10);
  if (ageNum < 0 || ageNum > 130) return "";

  const today = new Date();
  const birthYear = today.getFullYear() - ageNum;
  return `${birthYear}-01-01`;
}

/** Invitation name with the email as the fallback when no name was captured. */
function invitationName(invitation: InvitationRow): string {
  return [invitation.first_name, invitation.last_name].filter(Boolean).join(" ") || invitation.email;
}

/** One status label + tone, so the table row and the phone card can never disagree. */
function invitationStatusBadge(invitation: InvitationRow) {
  const label =
    invitation.status === "pending"
      ? `Pending · expires ${new Date(invitation.expires_at).toLocaleDateString()}`
      : invitation.status === "accepted"
        ? "Confirmed"
        : invitation.status === "expired"
          ? "Expired"
          : "Withdrawn";
  const tone =
    invitation.status === "pending"
      ? "bg-[#eef2ed] text-[#3d5148]"
      : invitation.status === "accepted"
        ? "bg-[#26352f] text-white"
        : "bg-[#f0e6dc] text-[#96552c]";
  return <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${tone}`}>{label}</span>;
}

/** Copy link / Resend / Withdraw — identical in the table row and in the phone card. */
function InvitationActions({
  invitation,
  onAction,
}: {
  invitation: InvitationRow;
  onAction: (id: number, action: "resend" | "revoke") => void;
}) {
  return (
    <>
      {invitation.invite_url && (
        <button
          type="button"
          onClick={() => navigator.clipboard?.writeText(invitation.invite_url ?? "")}
          className="rounded-lg border border-[#c9c5bb] bg-white px-2.5 py-1.5 text-[11px] font-semibold text-[#26352f] hover:border-[#b36b3c]"
        >
          Copy link
        </button>
      )}
      <button
        type="button"
        onClick={() => onAction(invitation.id, "resend")}
        className="rounded-lg border border-[#c9c5bb] bg-white px-2.5 py-1.5 text-[11px] font-semibold text-[#26352f] hover:border-[#b36b3c]"
      >
        Resend
      </button>
      <button
        type="button"
        onClick={() => onAction(invitation.id, "revoke")}
        className="rounded-lg border border-[#c9c5bb] bg-white px-2.5 py-1.5 text-[11px] font-semibold text-[#96552c] hover:border-[#96552c]"
      >
        Withdraw
      </button>
    </>
  );
}

export function UserManagement() {
  const [members, setMembers] = useState<MemberUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [memberFilter, setMemberFilter] = useState<MemberFilter>("all");
  const [invitationFilter, setInvitationFilter] = useState<InvitationFilter>("confirmed");
  const [churchName, setChurchName] = useState("this church");
  const [showAddForm, setShowAddForm] = useState(false);
  const [addStep, setAddStep] = useState<1 | 2>(1);
  const [addAccountType, setAddAccountType] = useState<"member" | "friend">("member");
  const [editingMember, setEditingMember] = useState<MemberUser | null>(null);
  // Members with a profile edit waiting for their own approval, by user id.
  const [pendingChangeIds, setPendingChangeIds] = useState<number[]>([]);
  const fetchProfileChanges = async () => {
    try {
      const token = localStorage.getItem("access_token");
      const res = await fetch(`${API_URL}/api/members/users/`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const rows = await res.json();
      setPendingChangeIds(
        (Array.isArray(rows) ? rows : [])
          .filter((row: MemberUser & { pending_profile_change?: boolean }) => row.pending_profile_change)
          .map((row: MemberUser) => row.id),
      );
    } catch {
      // The badge is a nicety; never let it break the roster.
    }
  };

  const [formData, setFormData] = useState(initialForm);
  const [age, setAge] = useState("");
  const [editFormData, setEditFormData] = useState<Partial<MemberUser>>({});
  const [editAge, setEditAge] = useState("");
  const [editGifts, setEditGifts] = useState<string[]>([]);
  const [editDisability, setEditDisability] = useState<string[]>([]);

  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string; credentials?: string } | null>(null);
  const [updatingRoleId, setUpdatingRoleId] = useState<number | null>(null);
  const [updatingTypeId, setUpdatingTypeId] = useState<number | null>(null);
  const [showAddFriendForm, setShowAddFriendForm] = useState(false);
  const [invitations, setInvitations] = useState<InvitationRow[]>([]);
  const [showInviteForm, setShowInviteForm] = useState(false);
  const [inviteFormData, setInviteFormData] = useState(inviteFormInitial);
  const [inviteSubmitting, setInviteSubmitting] = useState(false);
  const [lastInviteLink, setLastInviteLink] = useState("");

  const friendFormInitial = {
    name: "",
    phone_number: "",
    email: "",
    current_church: "",
    baptismal_status: "baptised",
    gender: "",
    date_of_birth: "",
    disability: "",
  };
  const [friendFormData, setFriendFormData] = useState(friendFormInitial);

  const getFilteredMinistries = (gender: string | undefined) => {
    const lower = (gender || "").toLowerCase();
    return MINISTRIES.filter((m) => {
      if (!m.value) return true;
      if (lower === "male" && m.value === "women_ministry") return false;
      if (lower === "female" && m.value === "men_ministry") return false;
      return true;
    });
  };

  const handleGenderChange = (selectedGender: string) => {
    setFormData((prev) => {
      let newRole = prev.role;
      const lower = selectedGender.toLowerCase();
      if (lower === "male" && newRole === "women_ministry") {
        newRole = "";
      } else if (lower === "female" && newRole === "men_ministry") {
        newRole = "";
      }
      return { ...prev, gender: selectedGender, role: newRole };
    });
  };

  const handleEditGenderChange = (selectedGender: string) => {
    setEditFormData((prev) => {
      let newRole = prev.role;
      const lower = selectedGender.toLowerCase();
      if (lower === "male" && newRole === "women_ministry") {
        newRole = "";
      } else if (lower === "female" && newRole === "men_ministry") {
        newRole = "";
      }
      return { ...prev, gender: selectedGender, role: newRole };
    });
  };

  const handleDobChange = (dob: string) => {
    setFormData((prev) => ({ ...prev, date_of_birth: dob }));
    setAge(calculateAgeFromDob(dob));
  };

  const handleAgeChange = (newAge: string) => {
    setAge(newAge);
    if (newAge === "") {
      setFormData((prev) => ({ ...prev, date_of_birth: "" }));
    } else {
      const calculatedDob = calculateDobFromAge(newAge);
      if (calculatedDob) {
        setFormData((prev) => ({ ...prev, date_of_birth: calculatedDob }));
      }
    }
  };

  const handleEditDobChange = (dob: string) => {
    setEditFormData((prev) => ({ ...prev, date_of_birth: dob }));
    setEditAge(calculateAgeFromDob(dob));
  };

  const handleEditAgeChange = (newAge: string) => {
    setEditAge(newAge);
    if (newAge === "") {
      setEditFormData((prev) => ({ ...prev, date_of_birth: "" }));
    } else {
      const calculatedDob = calculateDobFromAge(newAge);
      if (calculatedDob) {
        setEditFormData((prev) => ({ ...prev, date_of_birth: calculatedDob }));
      }
    }
  };

  const fetchMembers = () => {
    const token = localStorage.getItem("access_token");
    if (!token) return;
    setLoading(true);
    fetch(`${API_URL}/api/members/users/`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => setMembers(data))
      .catch(() => setMembers([]))
      .finally(() => setLoading(false));
  };

  const fetchInvitations = () => {
    const token = localStorage.getItem("access_token");
    if (!token) return;
    fetch(`${API_URL}/api/members/invitations/`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => setInvitations(Array.isArray(data) ? data : data.results ?? []))
      .catch(() => setInvitations([]));
  };

  const handleSendInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setInviteSubmitting(true);
    setMessage(null);
    setLastInviteLink("");
    const token = localStorage.getItem("access_token");
    try {
      const res = await fetch(`${API_URL}/api/members/invitations/`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          email: inviteFormData.email.trim(),
          first_name: inviteFormData.first_name.trim(),
          last_name: inviteFormData.last_name.trim(),
          phone_number: (inviteFormData.phone_number || "").replace(/\D/g, "").slice(0, 10),
          account_type: inviteFormData.account_type,
          roles: inviteFormData.roles,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || Object.values(data).flat().join(" ") || "Could not send the invitation.");
      setLastInviteLink(data.invite_url || "");
      if (data.email_sent) {
        // The link itself is only a fallback for a failed email — success gets a clean popup.
        showAlert("Invitation sent", `Invitation emailed to ${data.email}.`, "success");
      } else {
        setMessage({
          type: "error",
          text: data.detail || "Invitation created, but the email could not be sent. Share the link below instead.",
          credentials: data.invite_url,
        });
      }
      setInviteFormData(inviteFormInitial);
      setShowInviteForm(false);
      fetchInvitations();
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "Could not send the invitation." });
    } finally {
      setInviteSubmitting(false);
    }
  };

  const handleInviteAction = async (id: number, action: "resend" | "revoke") => {
    const token = localStorage.getItem("access_token");
    setMessage(null);
    try {
      const res = await fetch(`${API_URL}/api/members/invitations/${id}/`, action === "resend"
        ? { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } }
        : { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || "Could not update the invitation.");
      if (action === "resend") {
        setMessage({
          type: "success",
          text: data.email_sent ? "Invitation email re-sent." : data.detail || "Email could not be sent. Share the link below instead.",
          credentials: data.invite_url,
        });
      } else {
        setMessage({ type: "success", text: data.detail || "Invitation withdrawn." });
      }
      fetchInvitations();
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "Could not update the invitation." });
    }
  };

  useEffect(() => {
    fetchMembers();
    fetchInvitations();
    fetchProfileChanges();
    fetch(`${API_URL}/api/members/church-settings/`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setChurchName(data?.church_name || "this church"))
      .catch(() => setChurchName("this church"));
  }, []);

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setMessage(null);
    const token = localStorage.getItem("access_token");

    const trimmedName = (formData.name || "").trim();
    const parts = trimmedName.split(/\s+/);
    let first_name = "";
    let last_name = "";
    if (parts.length === 1) {
      first_name = parts[0];
      last_name = "";
    } else if (parts.length === 2) {
      first_name = parts[0];
      last_name = parts[1];
    } else {
      first_name = parts.slice(0, -1).join(" ");
      last_name = parts[parts.length - 1];
    }

    const cleanPhone = (formData.phone_number || "").replace(/\D/g, "").slice(0, 10);
    if (cleanPhone && cleanPhone.length !== 10) {
      setMessage({ type: "error", text: "Phone number must be exactly 10 digits (e.g. 07XXXXXXXX)." });
      setSubmitting(false);
      return;
    }

    const cleanWhatsApp = (formData.whatsapp_number || "").replace(/\D/g, "").slice(0, 10);
    if (cleanWhatsApp && cleanWhatsApp.length !== 10) {
      setMessage({ type: "error", text: "WhatsApp number must be exactly 10 digits (e.g. 07XXXXXXXX)." });
      setSubmitting(false);
      return;
    }

    try {
      const res = await fetch(`${API_URL}/api/members/users/`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...formData,
          phone_number: cleanPhone,
          whatsapp_number: cleanWhatsApp,
          name: trimmedName,
          first_name,
          last_name,
          role: formData.role || "member",
          username: formData.username.trim(),
          password: formData.password,
          gifts: formData.gifts.join(", "),
          disability: formData.disability.join(", "),
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setMessage(
          data.temporary_password
            ? {
                type: "success",
                text: `Member '${data.username}' registered. Share these sign-in details now — the password is shown only once.`,
                credentials: `Username: ${data.username}   Password: ${data.temporary_password}`,
              }
            : { type: "success", text: `Member '${data.username}' registered successfully with full record.` },
        );
        setFormData(initialForm);
        setAge("");
        setShowAddForm(false);
        fetchMembers();
      } else {
        setMessage({ type: "error", text: data.detail || Object.values(data).flat().join(" ") || "Failed to register member." });
      }
    } catch {
      setMessage({ type: "error", text: "Network error creating member." });
    } finally {
      setSubmitting(false);
    }
  };

  const handleAddPerson = (e: React.FormEvent) => {
    if (addAccountType === "friend") {
      return handleAddFriend(e);
    }
    return handleAddMember(e);
  };

  // ── Add Friend ──────────────────────────────────────────────────────────
  const handleAddFriend = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setMessage(null);
    const token = localStorage.getItem("access_token");

    const trimmedName = (friendFormData.name || "").trim();
    if (!trimmedName) {
      setMessage({ type: "error", text: "Friend's name is required." });
      setSubmitting(false);
      return;
    }
    if (!friendFormData.current_church.trim()) {
      setMessage({ type: "error", text: "Current church is required for friends." });
      setSubmitting(false);
      return;
    }
    const parts = trimmedName.split(/\s+/);
    const first_name = parts[0];
    const last_name = parts.length > 1 ? parts[parts.length - 1] : "";

    const cleanPhone = (friendFormData.phone_number || "").replace(/\D/g, "").slice(0, 10);
    if (cleanPhone && cleanPhone.length !== 10) {
      setMessage({ type: "error", text: "Phone number must be exactly 10 digits (e.g. 07XXXXXXXX)." });
      setSubmitting(false);
      return;
    }

    try {
      const res = await fetch(`${API_URL}/api/members/users/`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: trimmedName,
          first_name,
          last_name,
          email: friendFormData.email.trim(),
          phone_number: cleanPhone,
          account_type: "friend",
          username: formData.username.trim(),
          password: formData.password,
          current_church: friendFormData.current_church.trim(),
          baptismal_status: friendFormData.baptismal_status,
          role: "member",
          roles: ["member"],
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setMessage(
          data.temporary_password
            ? {
                type: "success",
                text: `Friend '${data.username}' added. Share these sign-in details now — the password is shown only once.`,
                credentials: `Username: ${data.username}   Password: ${data.temporary_password}`,
              }
            : { type: "success", text: `Friend '${data.username}' added successfully.` },
        );
        setFriendFormData(friendFormInitial);
        setShowAddFriendForm(false);
        fetchMembers();
      } else {
        setMessage({ type: "error", text: data.detail || Object.values(data).flat().join(" ") || "Failed to add friend." });
      }
    } catch {
      setMessage({ type: "error", text: "Network error adding friend." });
    } finally {
      setSubmitting(false);
    }
  };

  const handleStartEdit = (member: MemberUser) => {
    setEditingMember(member);
    setEditAge(calculateAgeFromDob(member.date_of_birth || ""));
    const memberGifts = member.gifts
      ? member.gifts.split(",").map((s) => s.trim()).filter(Boolean)
      : [];
    setEditGifts(memberGifts);
    const memberDisability = member.disability
      ? member.disability.split(",").map((s) => s.trim()).filter(Boolean)
      : [];
    setEditDisability(memberDisability);
    setEditFormData({
      first_name: member.first_name || "",
      last_name: member.last_name || "",
      email: member.email || "",
      phone_number: member.phone_number || "",
      whatsapp_number: member.whatsapp_number || "",
      role: member.role || "member",
      profession: member.profession || "",
      gender: member.gender || "",
      date_of_birth: member.date_of_birth || "",
      gifts: member.gifts || "",
      disability: member.disability || "",
    });
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingMember) return;
    setSubmitting(true);
    setMessage(null);
    const token = localStorage.getItem("access_token");

    const cleanPhone = (editFormData.phone_number || "").replace(/\D/g, "").slice(0, 10);
    if (cleanPhone && cleanPhone.length !== 10) {
      setMessage({ type: "error", text: "Phone number must be exactly 10 digits (e.g. 07XXXXXXXX)." });
      setSubmitting(false);
      return;
    }

    const cleanWhatsApp = (editFormData.whatsapp_number || "").replace(/\D/g, "").slice(0, 10);
    if (cleanWhatsApp && cleanWhatsApp.length !== 10) {
      setMessage({ type: "error", text: "WhatsApp number must be exactly 10 digits (e.g. 07XXXXXXXX)." });
      setSubmitting(false);
      return;
    }

    try {
      const res = await fetch(`${API_URL}/api/members/users/${editingMember.id}/`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...editFormData,
          phone_number: cleanPhone,
          whatsapp_number: cleanWhatsApp,
          gifts: editGifts.join(", "),
          disability: editDisability.join(", "),
        }),
      });
      const data = await res.json();
      if (res.ok) {
        // 202 means the edit is now a proposal the member must approve; 200
        // means only role(s) changed, which apply at once.
        setMessage(
          res.status === 202
            ? { type: "success", text: data.detail || `Update proposed for '${editingMember.username}'. They approve it on their dashboard.` }
            : { type: "success", text: `Profile updated for '${editingMember.username}'.` },
        );
        setEditingMember(null);
        setEditAge("");
        setEditGifts([]);
        setEditDisability([]);
        fetchMembers();
        if (typeof fetchProfileChanges === "function") fetchProfileChanges();
      } else {
        setMessage({ type: "error", text: data.detail || "Failed to update member profile." });
      }
    } catch {
      setMessage({ type: "error", text: "Network error updating member." });
    } finally {
      setSubmitting(false);
    }
  };

  // ── Actions dropdown state ────────────────────────────────────────────────
  const [openActionMenuId, setOpenActionMenuId] = useState<number | null>(null);
  const actionMenuRef = useRef<HTMLDivElement>(null);

  // Transfer modal
  const [transferMember, setTransferMember] = useState<MemberUser | null>(null);
  const [transferChurch, setTransferChurch] = useState("");
  const [transferReason, setTransferReason] = useState("");
  const [remainFriend, setRemainFriend] = useState(true);
  const [transferSubmitting, setTransferSubmitting] = useState(false);

  // Leadership modal
  const [leadershipMember, setLeadershipMember] = useState<MemberUser | null>(null);
  const [newRoles, setNewRoles] = useState<string[]>(["member"]);
  // The subset of those roles the member would share as an assistant.
  const [newAssistants, setNewAssistants] = useState<string[]>([]);
  const [leadershipSubmitting, setLeadershipSubmitting] = useState(false);

  // Removal request modal

  // Close action menu on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (actionMenuRef.current && !actionMenuRef.current.contains(e.target as Node)) {
        setOpenActionMenuId(null);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const [actionDropUp, setActionDropUp] = useState(false);
  const toggleActionMenu = (id: number, el: HTMLElement | null) => {
    if (openActionMenuId === id) {
      setOpenActionMenuId(null);
      return;
    }
    // Open upward when near the bottom of the viewport so the popup is not
    // hidden behind the bottom buttons bar or clipped by the table scroll area.
    if (el) {
      const rect = el.getBoundingClientRect();
      setActionDropUp(window.innerHeight - rect.bottom < 240);
    }
    setOpenActionMenuId(id);
  };

  // The API already leaves system accounts out of the roster, so this is the
  // render-side half of that rule: an account flagged as the installation's
  // owner is never a member row. (It used to guess from the username being
  // literally "superadmin", which missed the real owner account and put it
  // among the congregation.)
  const visibleMembers = members.filter((member) => !member.is_superuser);

  const matchesMemberFilter = (member: MemberUser) => {
    if (memberFilter === "friends") return member.account_type === "friend" && !member.is_disfellowshipped;
    if (memberFilter === "members") return member.account_type !== "friend" && !member.is_disfellowshipped;
    if (memberFilter === "ex_members") return Boolean(member.is_disfellowshipped);
    return true;
  };

  const pendingInvitations = invitations.filter((invitation) => invitation.status === "pending");

  const filteredMembers = visibleMembers.filter((m) => {
    const query = search.toLowerCase();
    const matchesSearch =
      m.username.toLowerCase().includes(query) ||
      m.email.toLowerCase().includes(query) ||
      (`${m.first_name} ${m.last_name}`).toLowerCase().includes(query) ||
      (m.phone_number && m.phone_number.includes(search)) ||
      (m.whatsapp_number && m.whatsapp_number.includes(search)) ||
      (m.profession && m.profession.toLowerCase().includes(query)) ||
      (m.gifts && m.gifts.toLowerCase().includes(query)) ||
      (m.disability && m.disability.toLowerCase().includes(query));
    return matchesMemberFilter(m) && matchesSearch;
  });

  // ── Transfer handler ─────────────────────────────────────────────────────
  const handleTransferSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!transferMember) return;
    setTransferSubmitting(true);
    const token = localStorage.getItem("access_token");
    try {
      const res = await fetch(`${API_URL}/api/members/transfers/`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          member_name: `${transferMember.first_name} ${transferMember.last_name}`.trim() || transferMember.username,
          transfer_type: "outgoing",
          other_church: transferChurch,
          reason: transferReason,
          remain_friend: remainFriend,
          phone_number: transferMember.phone_number || "",
          email: transferMember.email || "",
        }),
      });
      if (res.ok) {
        setMessage({ type: "success", text: `Transfer request created for ${transferMember.first_name || transferMember.username}.` });
        setTransferMember(null);
        setTransferChurch("");
        setTransferReason("");
        setRemainFriend(true);
      } else {
        const d = await res.json();
        setMessage({ type: "error", text: d.detail || "Failed to create transfer request." });
      }
    } catch {
      setMessage({ type: "error", text: "Network error." });
    } finally {
      setTransferSubmitting(false);
    }
  };

  // ── Leadership handler ───────────────────────────────────────────────────
  const handleLeadershipSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!leadershipMember || newRoles.length === 0) return;
    setLeadershipSubmitting(true);
    const token = localStorage.getItem("access_token");
    try {
      const res = await fetch(`${API_URL}/api/members/users/${leadershipMember.id}/role/`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ roles: newRoles, assistant_roles: newAssistants }),
      });
      if (res.ok) {
        setMessage({ type: "success", text: `Roles updated for ${leadershipMember.first_name || leadershipMember.username}.` });
        setLeadershipMember(null);
        setNewRoles(["member"]);
        setNewAssistants([]);
        refreshRoleRegister();
        fetchMembers();
      } else {
        const d = await res.json();
        setMessage({ type: "error", text: d.detail || d.roles || "Failed to update roles." });
      }
    } catch {
      setMessage({ type: "error", text: "Network error." });
    } finally {
      setLeadershipSubmitting(false);
    }
  };

  // ── Quick role change from the table combo (multi-role) ─────────────────
  const handleQuickRolesChange = async (userId: number, newRoles: string[], newAssistants: string[] = []) => {
    setUpdatingRoleId(userId);
    const previous = members.find((m) => m.id === userId);
    const previousRoles = previous?.roles || ["member"];
    const previousAssistants = previous?.assistant_roles || [];
    // Optimistic update
    setMembers((prev) => prev.map((m) => (m.id === userId ? { ...m, roles: newRoles, assistant_roles: newAssistants, role: newRoles[0] || "member" } : m)));
    const token = localStorage.getItem("access_token");
    try {
      const res = await fetch(`${API_URL}/api/members/users/${userId}/role/`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ roles: newRoles, assistant_roles: newAssistants }),
      });
      if (res.ok) {
        const d = await res.json().catch(() => ({}));
        refreshRoleRegister();
        setMessage({ type: "success", text: d.detail || "Roles updated successfully. Notification and email sent to member." });
      } else {
        const d = await res.json().catch(() => ({}));
        setMembers((prev) =>
          prev.map((m) =>
            m.id === userId
              ? { ...m, roles: previousRoles, assistant_roles: previousAssistants, role: previousRoles[0] || "member" }
              : m
          )
        );
        setMessage({ type: "error", text: d.detail || d.roles || "Failed to update roles." });
      }
    } catch {
      setMembers((prev) => prev.map((m) => (m.id === userId ? { ...m, roles: previousRoles, role: previousRoles[0] || "member" } : m)));
      setMessage({ type: "error", text: "Network error updating roles." });
    } finally {
      setUpdatingRoleId(null);
    }
  };

  // ── Quick type change from the table combo (member / friend / ex-member) ──
  const handleQuickTypeChange = async (member: MemberUser, nextType: AccountTypeOption["value"]) => {
    const previous = accountTypeOf(member.account_type, member.is_disfellowshipped);
    if (nextType === "ex_member" && previous !== "ex_member") {
      const proceed = confirm(
        `Record ${member.first_name || member.username} as an ex-member? They stay on the church record but are no longer counted as a member or a friend, and can be restored later.`
      );
      if (!proceed) return;
    }

    setUpdatingTypeId(member.id);
    const optimistic = {
      account_type: nextType === "friend" || nextType === "sabbath_school" ? nextType : "member",
      is_disfellowshipped: nextType === "ex_member",
    };
    setMembers((prev) => prev.map((m) => (m.id === member.id ? { ...m, ...optimistic } : m)));
    const token = localStorage.getItem("access_token");
    try {
      const res = await fetch(`${API_URL}/api/members/users/${member.id}/account-type/`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ account_type: nextType }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok) {
        // The API answers with the saved record, so the row cannot drift from it.
        setMembers((prev) => prev.map((m) => (m.id === member.id ? { ...m, ...optimistic } : m)));
        setMessage({ type: "success", text: d.detail || `Recorded as ${accountTypeLabel(nextType)}.` });
      } else {
        setMembers((prev) =>
          prev.map((m) =>
            m.id === member.id
              ? { ...m, account_type: member.account_type, is_disfellowshipped: member.is_disfellowshipped }
              : m
          )
        );
        setMessage({ type: "error", text: d.detail || d.account_type || "Failed to update the record type." });
      }
    } catch {
      setMembers((prev) =>
        prev.map((m) =>
          m.id === member.id
            ? { ...m, account_type: member.account_type, is_disfellowshipped: member.is_disfellowshipped }
            : m
        )
      );
      setMessage({ type: "error", text: "Network error updating the record type." });
    } finally {
      setUpdatingTypeId(null);
    }
  };

  const handleContactMember = (member: MemberUser) => {
    if (member.phone_number) {
      window.location.href = `tel:${member.phone_number}`;
      return;
    }
    if (member.email) {
      window.location.href = `mailto:${member.email}`;
    }
  };

  // ── Print handler ────────────────────────────────────────────────────────────
  const handlePrintMemberList = () => {
    const token = localStorage.getItem("access_token");
    // Fetch with the Authorization header and open the blob: putting the JWT
    // in the URL would leak it into browser history and the Referer of any
    // request the PDF viewer tab makes.
    fetch(`${API_URL}/api/members/users/list-pdf/`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.blob())
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        window.open(url, "_blank");
      })
      .catch(() => setMessage({ type: "error", text: "Failed to generate PDF." }));
  };

  return (
    <section className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-white">
      {/* ── Header ── */}
      <div className="flex shrink-0 flex-col gap-3 border-b border-[#dfdbd1] px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="flex w-full items-center justify-between gap-3 sm:w-auto">
          <h2 className="text-xl font-bold text-[#26352f]">User Management</h2>
          <p className="text-xs text-[#617068]">
            {visibleMembers.length} records registered
          </p>
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-1 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
          <div className="flex w-full items-center gap-2 sm:w-auto">
            {/* Phones keep one compact popover; desktop has room for the two
                status filters as separate controls side by side. */}
            <select
              value={invitationFilter}
              onChange={(e) => setInvitationFilter(e.target.value as InvitationFilter)}
              className="min-w-0 flex-1 rounded-xl border border-[#dfdbd1] bg-[#f7f4ee] px-3 py-2.5 text-xs font-semibold text-[#26352f] focus:border-[#b36b3c] focus:outline-none sm:flex-none md:hidden"
              aria-label="Account confirmation filter"
            >
              <option value="confirmed">Confirmed</option>
              <option value="pending">Pending</option>
            </select>
            <div
              className="hidden h-[38px] shrink-0 items-center rounded-xl border border-[#dfdbd1] bg-[#f7f4ee] p-0.5 md:flex"
              role="group"
              aria-label="Account confirmation filter"
            >
              {(["confirmed", "pending"] as const).map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setInvitationFilter(key)}
                  className={`h-8 rounded-lg px-3 text-xs font-semibold capitalize transition ${
                    invitationFilter === key
                      ? "bg-[#26352f] text-white shadow-sm"
                      : "text-[#617068] hover:text-[#26352f]"
                  }`}
                >
                  {key}
                  {key === "pending" && pendingInvitations.length > 0 ? ` (${pendingInvitations.length})` : ""}
                </button>
              ))}
            </div>
            {invitationFilter === "confirmed" && (
              <select
                value={memberFilter}
                onChange={(e) => setMemberFilter(e.target.value as MemberFilter)}
                className="min-w-0 flex-1 rounded-xl border border-[#dfdbd1] bg-[#f7f4ee] px-3 py-2.5 text-xs font-semibold text-[#26352f] focus:border-[#b36b3c] focus:outline-none sm:flex-none"
                aria-label="Member type filter"
              >
                <option value="all">All types</option>
                <option value="members">Members</option>
                <option value="friends">Friends</option>
                <option value="ex_members">Ex-members</option>
              </select>
            )}
          </div>
          <input
            type="text"
            placeholder="Search by name, email, phone, gifts..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full min-w-0 rounded-xl border border-[#dfdbd1] bg-[#f7f4ee] px-4 py-2.5 text-xs focus:border-[#b36b3c] focus:outline-none sm:min-w-[180px] sm:max-w-sm sm:flex-1"
          />
        </div>
      </div>

      {/* ── Alert message ── */}
      {message && (
        <div className={`mx-6 mt-3 shrink-0 rounded-xl p-3 text-xs font-semibold ${message.type === "success" ? "bg-[#eef2ed] text-[#3d5148]" : "bg-red-50 text-red-700"}`}>
          {message.text}
          <button className="ml-3 opacity-60 hover:opacity-100" onClick={() => setMessage(null)}>✕</button>
          {message.credentials && (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <code className="rounded-lg bg-white px-2 py-1 font-mono text-[11px] tracking-wide text-[#26352f] select-all">
                {message.credentials}
              </code>
              <button
                type="button"
                onClick={() => navigator.clipboard?.writeText(message.credentials || "")}
                className="rounded-lg border border-[#3d5148]/30 px-2 py-1 text-[11px] font-semibold hover:bg-white"
              >
                Copy
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Scrollable table area ── */}
      <div className="flex-1 overflow-y-auto min-h-0 px-5 py-3 pb-2 custom-table-scrollbar sm:px-6">
        {/* Pending invitations are a record list too — same table/cards pair as members. */}
        {invitationFilter === "pending" && (
          <RecordList
            rows={pendingInvitations}
            loading={loading}
            rowKey={(invitation) => invitation.id}
            headers={[
              { label: "#", className: "w-8" },
              { label: "Name" },
              { label: "Email" },
              { label: "Role" },
              { label: "Status" },
              { label: "Actions", className: "text-right" },
            ]}
            loadingLabel="Loading invitations..."
            tableEmpty="No pending invitations found."
            cardsEmpty="No pending invitations found."
            renderRow={(invitation, idx) => (
              <tr key={invitation.id} className="hover:bg-[#f7f4ee]">
                <td className="py-3 text-[#617068] w-8">{idx + 1}</td>
                <td className="py-3 font-semibold text-[#26352f]">{invitationName(invitation)}</td>
                <td className="py-3 text-[#617068]">{invitation.email}</td>
                <td className="py-3 text-[#617068]">
                  {formatRoles(invitation.role_codes)} · {invitation.account_type_display}
                </td>
                <td className="py-3">{invitationStatusBadge(invitation)}</td>
                <td className="py-3 text-right">
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <InvitationActions invitation={invitation} onAction={handleInviteAction} />
                  </div>
                </td>
              </tr>
            )}
            renderCard={(invitation) => (
              <div key={invitation.id} className="rounded-2xl border border-[#dfdbd1] bg-[#fcfbf9] px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-[#26352f]">{invitationName(invitation)}</p>
                    <p className="truncate text-xs text-[#617068]">
                      {invitation.email} · {formatRoles(invitation.role_codes)} · {invitation.account_type_display}
                    </p>
                  </div>
                  {invitationStatusBadge(invitation)}
                </div>
                {invitation.status !== "accepted" && (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <InvitationActions invitation={invitation} onAction={handleInviteAction} />
                  </div>
                )}
              </div>
            )}
          />
        )}

        {/* Table on desktop, cards on phones — RecordList owns the breakpoint pair. */}
        <RecordList
          rows={filteredMembers}
          loading={loading}
          rowKey={(m) => m.id}
          hidden={invitationFilter === "pending"}
          headers={[
            { label: "#", className: COL_INDEX },
            { label: "Name", className: COL_NAME },
            { label: "Contact", className: COL_CONTACT },
            { label: "Role", className: COL_ROLE },
            { label: "Type", className: COL_TYPE },
            { label: "Sex", className: COL_SEX },
            { label: "Actions", className: "text-right" },
          ]}
          loadingLabel="Loading members..."
          tableEmpty="No members found matching your search."
          cardsEmpty="No members found."
          renderRow={(m, idx) => (
                  <tr key={m.id} className={`hover:bg-[#f7f4ee] ${m.is_disfellowshipped ? "opacity-70" : ""} ${pendingChangeIds.includes(m.id) ? "bg-[#fdf6ec]" : ""}`}>
                    <td className={`py-3 text-[#617068] ${COL_INDEX}`}>{idx + 1}</td>
                    <td className={`py-3 font-semibold text-[#26352f] ${COL_NAME}`}>
                      <div className="min-w-0">
                        <div className="truncate">{m.first_name || m.last_name ? `${m.first_name} ${m.last_name}`.trim() : m.username}</div>
                        <div className="truncate text-[11px] font-normal text-[#8b9790]">@{m.username}</div>
                      </div>
                      {m.is_active === false && (
                        <span
                          title="Email confirmed but this account is waiting for leadership approval — they cannot sign in yet"
                          className="mt-0.5 inline-block rounded-full bg-[#f7e3d2] px-2 py-0.5 align-middle text-[10px] font-bold uppercase tracking-wide text-[#96552c]"
                        >
                          Not approved
                        </span>
                      )}
                    </td>
                    <td className={`py-3 text-[#617068] ${COL_CONTACT}`}>
                      <div className="truncate">{m.phone_number || m.email || "—"}</div>
                      {m.phone_number && m.email && <div className="truncate text-[11px]">{m.email}</div>}
                    </td>
                    <td className={`py-3 ${COL_ROLE}`}>
                      <RolesCombobox
                        selected={m.roles && m.roles.length > 0 ? m.roles : [m.role || "member"]}
                        onChange={(newRoles, newAssistants) => handleQuickRolesChange(m.id, newRoles, newAssistants)}
                        disabled={updatingRoleId === m.id || m.account_type === "friend"}
                        lockedRoles={heldSystemRoles(m.roles, m.role)}
                        memberId={m.id}
                        assistants={m.assistant_roles || []}
                        showAssistants
                        fill
                      />
                    </td>
                    <td className={`py-3 ${COL_TYPE}`}>
                      <AccountTypeCombobox
                        value={accountTypeOf(m.account_type, m.is_disfellowshipped)}
                        onChange={(nextType) => handleQuickTypeChange(m, nextType)}
                        disabled={updatingTypeId === m.id}
                        fill
                      />
                    </td>
                    <td className={`py-3 text-[#617068] ${COL_SEX}`}>{m.gender || "—"}</td>
                    <td className="py-3 text-right">
                      <div className="relative inline-block" ref={openActionMenuId === m.id ? actionMenuRef : undefined}>
                        <button
                          onClick={(e) => toggleActionMenu(m.id, e.currentTarget)}
                          className="rounded-lg border border-[#c9c5bb] bg-white px-3 py-1.5 text-xs font-semibold text-[#26352f] transition hover:border-[#b36b3c] hover:bg-[#f7f4ee]"
                        >
                          ⋯ Actions
                        </button>
                        {openActionMenuId === m.id && (
                          <div className={`absolute right-0 z-50 w-48 rounded-xl border border-[#dfdbd1] bg-white py-1 shadow-lg ${actionDropUp ? "bottom-full mb-1" : "mt-1"}`}>
                            <button
                              onClick={() => { handleStartEdit(m); setOpenActionMenuId(null); }}
                              className="flex w-full items-center gap-2 px-4 py-2 text-xs text-[#26352f] hover:bg-[#f7f4ee]"
                            >
                              ✏️ Edit Profile
                            </button>
                            <button
                              onClick={() => { handleContactMember(m); setOpenActionMenuId(null); }}
                              className="flex w-full items-center gap-2 px-4 py-2 text-xs text-[#26352f] hover:bg-[#f7f4ee]"
                            >
                              📞 Contact Member
                            </button>
                            <button
                              onClick={() => { setTransferMember(m); setOpenActionMenuId(null); }}
                              className="flex w-full items-center gap-2 px-4 py-2 text-xs text-[#26352f] hover:bg-[#f7f4ee]"
                            >
                              🔄 Transfer Member
                            </button>
                            <button
                              onClick={() => {
                                setLeadershipMember(m);
                                setNewRoles(m.roles && m.roles.length > 0 ? m.roles : [m.role || "member"]);
                                setNewAssistants(m.assistant_roles || []);
                                setOpenActionMenuId(null);
                              }}
                              className="flex w-full items-center gap-2 px-4 py-2 text-xs text-[#26352f] hover:bg-[#f7f4ee]"
                            >
                              👑 Assign Leadership
                            </button>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
          renderCard={(m) => {
              const name = m.first_name || m.last_name ? `${m.first_name} ${m.last_name}`.trim() : m.username;
              const contact = m.phone_number || m.email || "—";
              return (
                <div key={m.id} className={`rounded-2xl border border-[#dfdbd1] p-4 shadow-sm space-y-2 ${m.is_disfellowshipped ? "border-red-200 bg-red-50/30" : ""} ${pendingChangeIds.includes(m.id) ? "bg-[#fdf6ec]" : ""}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="font-bold text-sm text-[#26352f]">
                        {name}
                        {m.is_active === false && (
                          <span className="ml-2 inline-block rounded-full bg-[#f7e3d2] px-2 py-0.5 align-middle text-[10px] font-bold uppercase tracking-wide text-[#96552c]">
                            Not approved
                          </span>
                        )}
                      </h3>
                      <p className="text-[11px] text-[#8b9790] mt-0.5">@{m.username}</p>
                      <p className="text-xs text-[#617068] mt-0.5">{contact}</p>
                    </div>
                    {/* The type combobox sits where the role badge used to be,
                        and the Actions menu takes the row that held Type — one
                        row fewer on a phone. */}
                    <AccountTypeCombobox
                      value={accountTypeOf(m.account_type, m.is_disfellowshipped)}
                      onChange={(nextType) => handleQuickTypeChange(m, nextType)}
                      disabled={updatingTypeId === m.id}
                    />
                  </div>
                  <div className="flex items-center justify-between gap-2 border-t border-[#dfdbd1]/60 pt-2">
                    {m.gender ? (
                      <p className="min-w-0 flex-1 truncate text-xs text-[#617068]"><span className="font-semibold text-[#26352f]">Sex:</span> {m.gender}</p>
                    ) : <span className="flex-1" />}
                    {/* The card's actions live in one menu, anchored to this
                        button — nothing shows until it is asked for. */}
                    <div className="relative inline-block" ref={openActionMenuId === m.id ? actionMenuRef : undefined}>
                      <button
                        onClick={(e) => toggleActionMenu(m.id, e.currentTarget)}
                        aria-expanded={openActionMenuId === m.id}
                        aria-label={`Actions for ${name}`}
                        className="rounded-lg border border-[#c9c5bb] bg-white px-3 py-1.5 text-xs font-semibold text-[#26352f] transition hover:border-[#b36b3c] hover:bg-[#f7f4ee]"
                      >
                        ⋯ Actions
                      </button>
                      {openActionMenuId === m.id && (
                        <div className={`absolute right-0 z-50 w-48 rounded-xl border border-[#dfdbd1] bg-white py-1 shadow-lg ${actionDropUp ? "bottom-full mb-1" : "mt-1"}`}>
                          <button
                            onClick={() => { handleStartEdit(m); setOpenActionMenuId(null); }}
                            className="flex w-full items-center gap-2 px-4 py-2 text-xs text-[#26352f] hover:bg-[#f7f4ee]"
                          >
                            ✏️ Edit Profile
                          </button>
                          <button
                            onClick={() => { handleContactMember(m); setOpenActionMenuId(null); }}
                            className="flex w-full items-center gap-2 px-4 py-2 text-xs text-[#26352f] hover:bg-[#f7f4ee]"
                          >
                            📞 Contact Member
                          </button>
                          <button
                            onClick={() => { setTransferMember(m); setOpenActionMenuId(null); }}
                            className="flex w-full items-center gap-2 px-4 py-2 text-xs text-[#26352f] hover:bg-[#f7f4ee]"
                          >
                            🔄 Transfer Member
                          </button>
                          <button
                            onClick={() => {
                              setLeadershipMember(m);
                              setNewRoles(m.roles && m.roles.length > 0 ? m.roles : [m.role || "member"]);
                              setNewAssistants(m.assistant_roles || []);
                              setOpenActionMenuId(null);
                            }}
                            className="flex w-full items-center gap-2 px-4 py-2 text-xs text-[#26352f] hover:bg-[#f7f4ee]"
                          >
                            👑 Assign Leadership
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            }}
          />
      </div>

      {/* ── Bottom bar: Print + Add ── */}
      <div className="shrink-0 border-t border-[#dfdbd1] bg-white p-4 sm:px-6 sm:py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        {/* The count line is a desktop nicety; on phones the buttons need the width. */}
        <p className="hidden text-[11px] text-[#617068] sm:block">
          {invitationFilter === "pending" ? `${pendingInvitations.length} pending invitation${pendingInvitations.length === 1 ? "" : "s"}` : `${filteredMembers.length} of ${visibleMembers.length} confirmed records shown`}
        </p>
        {/* Large screens get one row of three equal-width buttons under their
            full names; below that the same actions stay a three-column grid of
            compact labels, which is all a phone has room for. */}
        <div className="grid grid-cols-3 gap-2 lg:flex lg:w-auto lg:gap-2">
          <button
            onClick={() => { setInviteFormData(inviteFormInitial); setShowInviteForm(true); setLastInviteLink(""); fetchInvitations(); }}
            className="rounded-xl bg-[#26352f] px-3 py-2 text-xs font-semibold text-white transition hover:bg-[#b36b3c] lg:w-44"
          >
            <span className="lg:hidden">✉️ Invite</span>
            <span className="hidden lg:inline">Invite via Email</span>
          </button>
          <button
            onClick={() => { setFormData(initialForm); setFriendFormData(friendFormInitial); setAge(""); setAddStep(1); setAddAccountType("member"); setShowAddForm(true); setEditingMember(null); }}
            className="rounded-xl border border-[#26352f] bg-white px-3 py-2 text-xs font-semibold text-[#26352f] transition hover:bg-[#f7f4ee] lg:w-44"
          >
            <span className="lg:hidden">+ Add</span>
            <span className="hidden lg:inline">Add Manually</span>
          </button>
          <button
            onClick={handlePrintMemberList}
            className="rounded-xl border border-[#c9c5bb] bg-white px-3 py-2 text-xs font-semibold text-[#26352f] transition hover:border-[#b36b3c] hover:bg-[#f7f4ee] lg:w-44"
          >
            <span className="lg:hidden">🖨️ Print</span>
            <span className="hidden lg:inline">Print Users List</span>
          </button>
        </div>
      </div>

      {/* The friend fields now live in the shared Add Person modal. */}
      {false && showAddFriendForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" role="presentation">
          <div role="dialog" aria-modal="true" aria-labelledby="add-friend-title"
            className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-3xl bg-white px-6 py-4 shadow-2xl ring-1 ring-[#dfdbd1] sm:px-8 sm:py-5">
            <div className="flex items-center justify-between border-b border-[#dfdbd1] pb-3">
              <div>
                <h3 id="add-friend-title" className="text-xl font-bold text-[#26352f]">Add New Friend</h3>
                <p className="mt-0.5 text-xs text-[#617068]">Register a friend of the church (no login access).</p>
              </div>
              <button type="button" onClick={() => setShowAddFriendForm(false)} className="text-[#617068] hover:text-[#26352f] text-xl leading-none">✕</button>
            </div>
            <form onSubmit={handleAddFriend} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[#26352f]">Full Name *</label>
                <input
                  type="text"
                  required
                  value={friendFormData.name}
                  onChange={(e) => setFriendFormData({ ...friendFormData, name: e.target.value })}
                  placeholder="e.g. Grace Achieng"
                  className="mt-1.5 w-full rounded-xl border border-[#dfdbd1] bg-[#f7f4ee] px-4 py-2.5 text-xs focus:border-[#b36b3c] focus:outline-none"
                />
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-semibold text-[#26352f]">Phone Number</label>
                  <input
                    type="tel"
                    inputMode="numeric"
                    maxLength={10}
                    value={friendFormData.phone_number}
                    onChange={(e) => setFriendFormData({ ...friendFormData, phone_number: e.target.value })}
                    placeholder="07XXXXXXXX"
                    className="mt-1.5 w-full rounded-xl border border-[#dfdbd1] bg-[#f7f4ee] px-4 py-2.5 text-xs focus:border-[#b36b3c] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#26352f]">Email</label>
                  <input
                    type="email"
                    value={friendFormData.email}
                    onChange={(e) => setFriendFormData({ ...friendFormData, email: e.target.value })}
                    className="mt-1.5 w-full rounded-xl border border-[#dfdbd1] bg-[#f7f4ee] px-4 py-2.5 text-xs focus:border-[#b36b3c] focus:outline-none"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-semibold text-[#26352f]">Sex / Gender</label>
                  <select
                    value={friendFormData.gender || ""}
                    onChange={(e) => setFriendFormData({ ...friendFormData, gender: e.target.value })}
                    className="mt-1.5 w-full rounded-xl border border-[#dfdbd1] bg-[#f7f4ee] px-4 py-2.5 text-xs focus:border-[#b36b3c] focus:outline-none"
                  >
                    <option value="">-- Select Sex --</option>
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#26352f]">Date of Birth</label>
                  <input
                    type="date"
                    value={friendFormData.date_of_birth || ""}
                    onChange={(e) => setFriendFormData({ ...friendFormData, date_of_birth: e.target.value })}
                    className="mt-1.5 w-full rounded-xl border border-[#dfdbd1] bg-[#f7f4ee] px-4 py-2.5 text-xs focus:border-[#b36b3c] focus:outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#26352f]">Disability / Special Needs</label>
                <select
                  value={friendFormData.disability || ""}
                  onChange={(e) => setFriendFormData({ ...friendFormData, disability: e.target.value })}
                  className="mt-1.5 w-full rounded-xl border border-[#dfdbd1] bg-[#f7f4ee] px-4 py-2.5 text-xs focus:border-[#b36b3c] focus:outline-none"
                >
                  <option value="">None / None Recorded</option>
                  <option value="Physical / Mobility">Physical / Mobility Impairment</option>
                  <option value="Visual">Visual Impairment / Blindness</option>
                  <option value="Hearing">Hearing Impairment / Deafness</option>
                  <option value="Speech">Speech / Communication Needs</option>
                  <option value="Intellectual">Intellectual / Learning Support</option>
                  <option value="Other">Other Special Need</option>
                </select>
                <p className="mt-1 text-[11px] text-[#617068]">
                  Note: Friends with a recorded disability automatically belong to <span className="font-bold text-[#b36b3c]">Adventist Possibility Ministries (APM)</span>.
                </p>
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#26352f]">Current Church *</label>
                <input
                  type="text"
                  required
                  value={friendFormData.current_church}
                  onChange={(e) => setFriendFormData({ ...friendFormData, current_church: e.target.value })}
                  placeholder="Church they currently attend"
                  className="mt-1.5 w-full rounded-xl border border-[#dfdbd1] bg-[#f7f4ee] px-4 py-2.5 text-xs focus:border-[#b36b3c] focus:outline-none"
                  title="The church this friend currently attends"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#26352f]">Baptismal Status</label>
                <select
                  value={friendFormData.baptismal_status}
                  onChange={(e) => setFriendFormData({ ...friendFormData, baptismal_status: e.target.value })}
                  className="mt-1.5 w-full rounded-xl border border-[#dfdbd1] bg-[#f7f4ee] px-4 py-2.5 text-xs focus:border-[#b36b3c] focus:outline-none"
                >
                  <option value="baptised">Baptised</option>
                  <option value="not_baptised">Not Baptised</option>
                  <option value="transfer_pending">Transfer In Progress</option>
                </select>
              </div>
              <div className="flex items-center justify-end gap-3 border-t border-[#dfdbd1] pt-4">
                <button
                  type="button"
                  onClick={() => setShowAddFriendForm(false)}
                  className="rounded-xl border border-[#c9c5bb] px-5 py-2 text-xs font-semibold text-[#617068] hover:border-[#b36b3c]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded-xl bg-[#b36b3c] px-5 py-2 text-xs font-semibold text-white disabled:opacity-60 transition hover:bg-[#96552c]"
                >
                  {submitting ? "Adding..." : "Add Friend"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ══ Add Member Modal ══ */}
      {showAddForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" role="presentation">
          <div role="dialog" aria-modal="true" aria-labelledby="add-member-title"
            className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-3xl bg-white px-6 py-4 shadow-2xl ring-1 ring-[#dfdbd1] sm:px-8 sm:py-5">
            <div className="flex items-center justify-between border-b border-[#dfdbd1] pb-3">
              <div>
                <h3 id="add-member-title" className="text-xl font-bold text-[#26352f]">Add User</h3>
                <p className="mt-0.5 text-xs text-[#617068]">Step {addStep} of 2 · {addStep === 1 ? "Basic account details" : "Additional details"}</p>
              </div>
              <button type="button" onClick={() => setShowAddForm(false)}
                className="rounded-full p-2 text-[#617068] hover:bg-[#f7f4ee] hover:text-[#26352f] transition text-xl leading-none" aria-label="Close modal">✕</button>
            </div>

            <form onSubmit={addStep === 1 ? (e) => { e.preventDefault(); setAddStep(2); } : handleAddPerson} className="mt-3.5 space-y-4">
              {addStep === 1 && (
                <>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                <label className="block text-xs font-semibold text-[#26352f]">Account Type *</label>
                <select
                  value={addAccountType}
                  onChange={(e) => setAddAccountType(e.target.value as "member" | "friend")}
                  className="mt-1 w-full rounded-xl border border-[#dfdbd1] bg-[#fcfbf9] px-3.5 py-2.5 text-xs text-[#26352f] focus:border-[#b36b3c] focus:bg-white focus:outline-none"
                >
                  <option value="member">Church Member</option>
                  <option value="friend">Friend of the Church</option>
                </select>
                </div>

                {/* Name */}
                <div>
                  <label className="block text-xs font-semibold text-[#26352f]">Name *</label>
                  <input type="text" required placeholder="Enter full name" value={formData.name}
                    onChange={(e) => {
                      setFormData({ ...formData, name: e.target.value });
                      setFriendFormData({ ...friendFormData, name: e.target.value });
                    }}
                    className="mt-1 w-full rounded-xl border border-[#dfdbd1] bg-[#fcfbf9] px-3.5 py-2.5 text-xs text-[#26352f] focus:border-[#b36b3c] focus:bg-white focus:outline-none" />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                {/* Sex */}
                <div>
                  <label className="block text-xs font-semibold text-[#26352f]">Sex</label>
                  <select value={formData.gender} onChange={(e) => handleGenderChange(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-[#dfdbd1] bg-[#fcfbf9] px-3.5 py-2.5 text-xs text-[#26352f] focus:border-[#b36b3c] focus:bg-white focus:outline-none">
                    <option value="">-- Select Sex --</option>
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                    <option value="Other">Other</option>
                  </select>
                </div>

                {/* Phone */}
                <div>
                  <label className="block text-xs font-semibold text-[#26352f]">Phone Number</label>
                  <input type="tel" inputMode="numeric" pattern="[0-9]{10}" maxLength={10} placeholder="e.g. 07XXXXXXXX"
                    value={formData.phone_number}
                    onChange={(e) => {
                      const phone = e.target.value.replace(/\D/g, "").slice(0, 10);
                      setFormData({ ...formData, phone_number: phone });
                      setFriendFormData({ ...friendFormData, phone_number: phone });
                    }}
                    className="mt-1 w-full rounded-xl border border-[#dfdbd1] bg-[#fcfbf9] px-3.5 py-2.5 text-xs text-[#26352f] focus:border-[#b36b3c] focus:bg-white focus:outline-none" />
                </div>

                {/* WhatsApp */}
                <div>
                  <label className="block text-xs font-semibold text-[#26352f]">WhatsApp Number</label>
                  <input type="tel" inputMode="numeric" pattern="[0-9]{10}" maxLength={10} placeholder="e.g. 07XXXXXXXX"
                    value={formData.whatsapp_number}
                    onChange={(e) => setFormData({ ...formData, whatsapp_number: e.target.value.replace(/\D/g, "").slice(0, 10) })}
                    className="mt-1 w-full rounded-xl border border-[#dfdbd1] bg-[#fcfbf9] px-3.5 py-2.5 text-xs text-[#26352f] focus:border-[#b36b3c] focus:bg-white focus:outline-none" />
                </div>

                {/* Email */}
                <div>
                  <label className="block text-xs font-semibold text-[#26352f]">Email Address {addAccountType === "member" ? "*" : ""}</label>
                  <input type="email" required={addAccountType === "member"} placeholder="member@example.com" value={formData.email}
                    onChange={(e) => {
                      setFormData({ ...formData, email: e.target.value });
                      setFriendFormData({ ...friendFormData, email: e.target.value });
                    }}
                    className="mt-1 w-full rounded-xl border border-[#dfdbd1] bg-[#fcfbf9] px-3.5 py-2.5 text-xs text-[#26352f] focus:border-[#b36b3c] focus:bg-white focus:outline-none" />
                </div>

                {/* Login credentials */}
                <div>
                  <label className="block text-xs font-semibold text-[#26352f]">Username *</label>
                  <input type="text" required autoComplete="off" placeholder="e.g. grace.wanjiku" value={formData.username}
                    onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-[#dfdbd1] bg-[#fcfbf9] px-3.5 py-2.5 text-xs text-[#26352f] focus:border-[#b36b3c] focus:bg-white focus:outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#26352f]">Initial Password *</label>
                  <input type="text" required autoComplete="off" value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-[#dfdbd1] bg-[#fcfbf9] px-3.5 py-2.5 text-xs text-[#26352f] focus:border-[#b36b3c] focus:bg-white focus:outline-none" />
                  <p className="mt-1 text-[10px] text-[#617068]">They must change this password at first login.</p>
                </div>

                {/* Date of Birth */}
                <div>
                  <label className="block text-xs font-semibold text-[#26352f]">Date of Birth</label>
                  <input type="date" value={formData.date_of_birth}
                    onChange={(e) => handleDobChange(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-[#dfdbd1] bg-[#fcfbf9] px-3.5 py-2.5 text-xs text-[#26352f] focus:border-[#b36b3c] focus:bg-white focus:outline-none" />
                </div>

                {/* Age */}
                <div>
                  <label className="block text-xs font-semibold text-[#26352f]">Age (Years)</label>
                  <input type="number" min="0" max="130" placeholder="e.g. 25" value={age}
                    onChange={(e) => handleAgeChange(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-[#dfdbd1] bg-[#fcfbf9] px-3.5 py-2.5 text-xs text-[#26352f] focus:border-[#b36b3c] focus:bg-white focus:outline-none" />
                </div>

              </div>
              </>
              )}

              {addStep === 2 && (
                <>
                  <div className="grid gap-4 sm:grid-cols-2">
                    {/* Profession follows age on the second step. */}
                    <div>
                      <label className="block text-xs font-semibold text-[#26352f]">Profession / Occupation</label>
                      <ProfessionCombobox value={formData.profession} onChange={(val) => setFormData({ ...formData, profession: val })} />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-[#26352f]">Ministry / Role</label>
                      <select value={formData.role}
                        onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                        className="mt-1 w-full rounded-xl border border-[#dfdbd1] bg-[#fcfbf9] px-3.5 py-2.5 text-xs text-[#26352f] focus:border-[#b36b3c] focus:bg-white focus:outline-none">
                        {getFilteredMinistries(formData.gender).map((r) => (
                          <option key={r.value} value={r.value}>{r.label}</option>
                        ))}
                      </select>
                    </div>
                  </div>

              {addAccountType === "friend" && (
                <div className="grid gap-4 sm:grid-cols-2 rounded-2xl border border-[#dfdbd1] bg-[#fcfbf9] p-4">
                  <div>
                    <label className="block text-xs font-semibold text-[#26352f]">Current Church *</label>
                    <input type="text" required value={friendFormData.current_church}
                      onChange={(e) => setFriendFormData({ ...friendFormData, current_church: e.target.value })}
                      placeholder="Church they currently attend"
                      className="mt-1 w-full rounded-xl border border-[#dfdbd1] bg-white px-3.5 py-2.5 text-xs focus:border-[#b36b3c] focus:outline-none" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[#26352f]">Baptismal Status</label>
                    <select value={friendFormData.baptismal_status}
                      onChange={(e) => setFriendFormData({ ...friendFormData, baptismal_status: e.target.value })}
                      className="mt-1 w-full rounded-xl border border-[#dfdbd1] bg-white px-3.5 py-2.5 text-xs focus:border-[#b36b3c] focus:outline-none">
                      <option value="baptised">Baptised</option>
                      <option value="not_baptised">Not Baptised</option>
                      <option value="transfer_pending">Transfer In Progress</option>
                    </select>
                  </div>
                </div>
              )}

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-semibold text-[#26352f]">Gifts &amp; Talents</label>
                  <GiftsCombobox selectedGifts={formData.gifts} onChange={(gifts) => setFormData({ ...formData, gifts })} />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#26352f]">Disability / Special Needs</label>
                  <DisabilityCombobox selectedDisabilities={formData.disability} onChange={(d) => setFormData({ ...formData, disability: d })} />
                </div>
              </div>

              {message && (
                <div className={`rounded-xl p-3 text-xs font-semibold ${message.type === "success" ? "bg-[#eef2ed] text-[#3d5148]" : "bg-red-50 text-red-700"}`}>{message.text}</div>
              )}

              <div className="flex items-center justify-end gap-3 pt-2">
                <button type="button" onClick={() => setAddStep(1)}
                  className="rounded-full border border-[#c9c5bb] bg-white px-5 py-2.5 text-xs font-semibold text-[#617068] hover:border-[#b36b3c]">
                  Back
                </button>
                <button type="button" onClick={() => setShowAddForm(false)}
                  className="rounded-full border border-[#c9c5bb] bg-white px-5 py-2.5 text-xs font-semibold text-[#617068] hover:border-[#b36b3c]">
                  Cancel
                </button>
                <button type="submit" disabled={submitting}
                  className="rounded-full bg-[#26352f] px-6 py-2.5 text-xs font-semibold text-white transition hover:bg-[#b36b3c]">
                  {submitting ? "Registering..." : addAccountType === "friend" ? "Add Friend" : "Register Member"}
                </button>
              </div>
                </>
              )}
              {addStep === 1 && (
                <div className="flex items-center justify-end gap-3 pt-2">
                  <button type="button" onClick={() => setShowAddForm(false)} className="rounded-full border border-[#c9c5bb] bg-white px-5 py-2.5 text-xs font-semibold text-[#617068] hover:border-[#b36b3c]">
                    Cancel
                  </button>
                  <button type="submit" className="rounded-full bg-[#26352f] px-6 py-2.5 text-xs font-semibold text-white transition hover:bg-[#b36b3c]">
                    Next: Additional Details
                  </button>
                </div>
              )}
            </form>
          </div>
        </div>
      )}

      {/* ══ Invite by Email Modal ══ */}
      {showInviteForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" role="presentation">
          <div role="dialog" aria-modal="true" aria-labelledby="invite-member-title"
            className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-3xl bg-white px-6 py-5 shadow-2xl ring-1 ring-[#dfdbd1] sm:px-8">
            <div className="flex items-center justify-between border-b border-[#dfdbd1] pb-3">
              <div>
                <h3 id="invite-member-title" className="text-xl font-bold text-[#26352f]">Invite by Email</h3>
                <p className="mt-0.5 text-xs text-[#617068]">
                  They receive a link, choose their own username and password, then sign in.
                </p>
              </div>
              <button type="button" onClick={() => setShowInviteForm(false)} className="text-[#617068] hover:text-[#26352f] text-xl leading-none">✕</button>
            </div>

            <form onSubmit={handleSendInvite} className="mt-4 space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-semibold text-[#26352f]">Email Address *</label>
                  <input type="email" required placeholder="leader@example.com" value={inviteFormData.email}
                    onChange={(e) => setInviteFormData({ ...inviteFormData, email: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-[#dfdbd1] bg-[#fcfbf9] px-3.5 py-2.5 text-xs text-[#26352f] focus:border-[#b36b3c] focus:bg-white focus:outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#26352f]">First Name *</label>
                  <input type="text" required value={inviteFormData.first_name}
                    onChange={(e) => setInviteFormData({ ...inviteFormData, first_name: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-[#dfdbd1] bg-[#fcfbf9] px-3.5 py-2.5 text-xs text-[#26352f] focus:border-[#b36b3c] focus:bg-white focus:outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#26352f]">Last Name</label>
                  <input type="text" value={inviteFormData.last_name}
                    onChange={(e) => setInviteFormData({ ...inviteFormData, last_name: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-[#dfdbd1] bg-[#fcfbf9] px-3.5 py-2.5 text-xs text-[#26352f] focus:border-[#b36b3c] focus:bg-white focus:outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#26352f]">Phone Number</label>
                  <input type="tel" placeholder="07XXXXXXXX" value={inviteFormData.phone_number}
                    onChange={(e) => setInviteFormData({ ...inviteFormData, phone_number: e.target.value.replace(/\D/g, "").slice(0, 10) })}
                    className="mt-1 w-full rounded-xl border border-[#dfdbd1] bg-[#fcfbf9] px-3.5 py-2.5 text-xs text-[#26352f] focus:border-[#b36b3c] focus:bg-white focus:outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#26352f]">Account Type</label>
                  <select value={inviteFormData.account_type}
                    onChange={(e) => setInviteFormData({ ...inviteFormData, account_type: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-[#dfdbd1] bg-[#fcfbf9] px-3.5 py-2.5 text-xs text-[#26352f] focus:border-[#b36b3c] focus:bg-white focus:outline-none">
                    <option value="member">Church Member</option>
                    <option value="friend">Friend of the Church</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#26352f]">Access / Roles</label>
                  <RolesCombobox
                    selected={inviteFormData.roles}
                    onChange={(roles) => setInviteFormData({ ...inviteFormData, roles })}
                    align="left"
                    hiddenRoles={["member"]}
                  />
                </div>
              </div>

              {message && (
                <div className={`rounded-xl p-3 text-xs font-semibold ${message.type === "success" ? "bg-[#eef2ed] text-[#3d5148]" : "bg-red-50 text-red-700"}`}>
                  {message.text}
                  {lastInviteLink && (
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <code className="max-w-full overflow-hidden text-ellipsis whitespace-nowrap rounded-lg bg-white px-2 py-1 font-mono text-[11px] text-[#26352f] select-all">
                        {lastInviteLink}
                      </code>
                      <button type="button" onClick={() => navigator.clipboard?.writeText(lastInviteLink)}
                        className="rounded-lg border border-[#3d5148]/30 px-2 py-1 text-[11px] font-semibold hover:bg-white">
                        Copy link
                      </button>
                    </div>
                  )}
                </div>
              )}

              <div className="flex items-center justify-end gap-3 pt-2">
                <button type="button" onClick={() => setShowInviteForm(false)}
                  className="rounded-full border border-[#c9c5bb] bg-white px-5 py-2.5 text-xs font-semibold text-[#617068] hover:border-[#b36b3c]">
                  Cancel
                </button>
                <button type="submit" disabled={inviteSubmitting}
                  className="rounded-full bg-[#26352f] px-6 py-2.5 text-xs font-semibold text-white transition hover:bg-[#b36b3c] disabled:opacity-60">
                  {inviteSubmitting ? "Sending…" : "Send Invitation"}
                </button>
              </div>
            </form>

            {/* Pending, accepted and withdrawn invitations */}
            {false && invitations.length > 0 && (
              <div className="mt-6 border-t border-[#dfdbd1] pt-4">
                <p className="text-xs font-bold uppercase tracking-wide text-[#617068]">Invitations</p>
                <div className="mt-3 space-y-2">
                  {invitations.map((invitation) => (
                    <div key={invitation.id} className="rounded-xl border border-[#dfdbd1] bg-[#fcfbf9] px-3 py-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-xs font-semibold text-[#26352f]">
                            {[invitation.first_name, invitation.last_name].filter(Boolean).join(" ") || invitation.email}
                          </p>
                          <p className="truncate text-[11px] text-[#617068]">
                            {invitation.email} · {formatRoles(invitation.role_codes)} · {invitation.account_type_display}
                          </p>
                        </div>
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${invitation.status === "pending" ? "bg-[#eef2ed] text-[#3d5148]" : invitation.status === "accepted" ? "bg-[#26352f] text-white" : "bg-[#f0e6dc] text-[#96552c]"}`}>
                          {invitation.status === "pending" ? `Pending · expires ${new Date(invitation.expires_at).toLocaleDateString()}` : invitation.status === "accepted" ? "Accepted" : invitation.status === "expired" ? "Expired" : "Withdrawn"}
                        </span>
                      </div>
                      {invitation.status !== "accepted" && (
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          {invitation.invite_url && (
                            <button type="button" onClick={() => navigator.clipboard?.writeText(invitation.invite_url ?? "")}
                              className="rounded-lg border border-[#c9c5bb] bg-white px-2 py-1 text-[11px] font-semibold text-[#26352f] hover:border-[#b36b3c]">
                              Copy link
                            </button>
                          )}
                          <button type="button" onClick={() => handleInviteAction(invitation.id, "resend")}
                            className="rounded-lg border border-[#c9c5bb] bg-white px-2 py-1 text-[11px] font-semibold text-[#26352f] hover:border-[#b36b3c]">
                            Resend
                          </button>
                          <button type="button" onClick={() => handleInviteAction(invitation.id, "revoke")}
                            className="rounded-lg border border-[#c9c5bb] bg-white px-2 py-1 text-[11px] font-semibold text-[#96552c] hover:border-[#96552c]">
                            Withdraw
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══ Edit Profile Modal ══ */}
      {editingMember && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" role="presentation">
          <div role="dialog" aria-modal="true" aria-labelledby="edit-member-title"
            className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-3xl bg-white px-6 py-4 shadow-2xl ring-1 ring-[#dfdbd1] sm:px-8 sm:py-5">
            <div className="flex items-center justify-between border-b border-[#dfdbd1] pb-3">
              <h3 id="edit-member-title" className="text-xl font-bold text-[#26352f]">
                Edit Profile — {editingMember.first_name || editingMember.username}
              </h3>
              <button type="button" onClick={() => setEditingMember(null)} className="rounded-full p-2 text-[#617068] hover:bg-[#f7f4ee] text-xl leading-none">✕</button>
            </div>
            <form onSubmit={handleSaveEdit} className="mt-4 space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-medium text-[#26352f]">First Name</label>
                  <input type="text" value={editFormData.first_name || ""} onChange={(e) => setEditFormData({ ...editFormData, first_name: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-[#dfdbd1] bg-white px-3 py-2 text-xs focus:border-[#b36b3c] focus:outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#26352f]">Last Name</label>
                  <input type="text" value={editFormData.last_name || ""} onChange={(e) => setEditFormData({ ...editFormData, last_name: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-[#dfdbd1] bg-white px-3 py-2 text-xs focus:border-[#b36b3c] focus:outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#26352f]">Email</label>
                  <input type="email" value={editFormData.email || ""} onChange={(e) => setEditFormData({ ...editFormData, email: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-[#dfdbd1] bg-white px-3 py-2 text-xs focus:border-[#b36b3c] focus:outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#26352f]">Phone Number</label>
                  <input type="tel" inputMode="numeric" maxLength={10} value={editFormData.phone_number || ""}
                    onChange={(e) => setEditFormData({ ...editFormData, phone_number: e.target.value.replace(/\D/g, "").slice(0, 10) })}
                    className="mt-1 w-full rounded-xl border border-[#dfdbd1] bg-white px-3 py-2 text-xs focus:border-[#b36b3c] focus:outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#26352f]">WhatsApp Number</label>
                  <input type="tel" inputMode="numeric" maxLength={10} value={editFormData.whatsapp_number || ""}
                    onChange={(e) => setEditFormData({ ...editFormData, whatsapp_number: e.target.value.replace(/\D/g, "").slice(0, 10) })}
                    className="mt-1 w-full rounded-xl border border-[#dfdbd1] bg-white px-3 py-2 text-xs focus:border-[#b36b3c] focus:outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#26352f]">Sex</label>
                  <select value={editFormData.gender || ""} onChange={(e) => setEditFormData({ ...editFormData, gender: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-[#dfdbd1] bg-white px-3 py-2 text-xs focus:border-[#b36b3c] focus:outline-none">
                    <option value="">-- Select Sex --</option>
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#26352f]">Date of Birth</label>
                  <input type="date" value={editFormData.date_of_birth || ""} onChange={(e) => handleEditDobChange(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-[#dfdbd1] bg-white px-3 py-2 text-xs focus:border-[#b36b3c] focus:outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#26352f]">Age (Years)</label>
                  <input type="number" min="0" max="130" placeholder="e.g. 25" value={editAge} onChange={(e) => handleEditAgeChange(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-[#dfdbd1] bg-white px-3 py-2 text-xs focus:border-[#b36b3c] focus:outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#26352f]">Profession / Occupation</label>
                  <ProfessionCombobox value={editFormData.profession || ""} onChange={(val) => setEditFormData({ ...editFormData, profession: val })} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#26352f]">Residence</label>
                  <input type="text" placeholder="Estate, street or town" value={editFormData.residence || ""}
                    onChange={(e) => setEditFormData({ ...editFormData, residence: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-[#dfdbd1] bg-white px-3 py-2 text-xs focus:border-[#b36b3c] focus:outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#26352f]">Gifts &amp; Talents</label>
                  <GiftsCombobox selectedGifts={editGifts} onChange={setEditGifts} placeholder="Select spiritual gifts..." />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#26352f]">Disability / Special Needs</label>
                  <DisabilityCombobox selectedDisabilities={editDisability} onChange={setEditDisability} placeholder="Select disability (optional)..." />
                </div>
              </div>
              <p className="rounded-xl bg-[#fdf8ef] px-4 py-3 text-[11px] leading-relaxed text-[#617068]">
                Profile changes take effect when <strong className="text-[#26352f]">{editingMember.first_name || editingMember.username}</strong> approves
                them — they&apos;ll get a notification on their dashboard and can accept or keep their current details. Role changes apply immediately.
              </p>
              <div className="flex items-center gap-3 pt-2">
                <button type="submit" disabled={submitting}
                  className="rounded-full bg-[#26352f] px-6 py-2.5 text-xs font-semibold text-white transition hover:bg-[#b36b3c]">
                  {submitting ? "Sending…" : "Send Update for Approval"}
                </button>
                <button type="button" onClick={() => setEditingMember(null)}
                  className="rounded-full border border-[#c9c5bb] bg-white px-5 py-2.5 text-xs font-semibold text-[#617068] hover:border-[#b36b3c]">
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ══ Transfer Modal ══ */}
      {transferMember && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-3xl bg-white px-6 py-5 shadow-2xl ring-1 ring-[#dfdbd1]">
            <div className="flex items-center justify-between border-b border-[#dfdbd1] pb-3">
              <h3 className="text-base font-bold text-[#26352f]">
                Transfer Member — {transferMember.first_name || transferMember.username}
              </h3>
              <button onClick={() => setTransferMember(null)} className="text-[#617068] hover:text-[#26352f] text-xl leading-none">✕</button>
            </div>
            <form onSubmit={handleTransferSubmit} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[#26352f]">Destination Church *</label>
                <input type="text" required placeholder="e.g. Meru Central SDA" value={transferChurch}
                  onChange={(e) => setTransferChurch(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-[#dfdbd1] bg-[#f7f4ee] px-4 py-2.5 text-xs focus:border-[#b36b3c] focus:outline-none" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#26352f]">Reason (Optional)</label>
                <textarea rows={3} placeholder="Reason for transfer..." value={transferReason}
                  onChange={(e) => setTransferReason(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-[#dfdbd1] bg-[#f7f4ee] px-4 py-2.5 text-xs focus:border-[#b36b3c] focus:outline-none" />
              </div>
              <div className="flex gap-3 pt-1">
                <button type="submit" disabled={transferSubmitting}
                  className="rounded-xl bg-[#26352f] px-5 py-2 text-xs font-semibold text-white hover:bg-[#b36b3c]">
                  {transferSubmitting ? "Processing..." : "Submit Transfer"}
                </button>
                <button type="button" onClick={() => setTransferMember(null)}
                  className="rounded-xl border border-[#c9c5bb] px-5 py-2 text-xs font-semibold text-[#617068] hover:border-[#b36b3c]">
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ══ Assign Leadership Modal ══ */}
      {leadershipMember && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-3xl bg-white px-6 py-5 shadow-2xl ring-1 ring-[#dfdbd1]">
            <div className="flex items-center justify-between border-b border-[#dfdbd1] pb-3">
              <h3 className="text-base font-bold text-[#26352f]">
                Assign Role — {leadershipMember.first_name || leadershipMember.username}
              </h3>
              <button onClick={() => setLeadershipMember(null)} className="text-[#617068] hover:text-[#26352f] text-xl leading-none">✕</button>
            </div>
            <form onSubmit={handleLeadershipSubmit} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[#26352f]">Leadership Roles *</label>
                <p className="mt-0.5 text-[10px] text-[#617068]">
                  Tick every role this person holds. A person can hold several roles. {SYSTEM_ROLE_HELP}
                </p>
                <div className="mt-2">
                  <RolesCombobox
                    selected={newRoles}
                    onChange={(roles, assists) => {
                      setNewRoles(roles);
                      setNewAssistants(assists);
                    }}
                    lockedRoles={heldSystemRoles(leadershipMember.roles, leadershipMember.role)}
                    memberId={leadershipMember.id}
                    assistants={newAssistants}
                    showAssistants
                    align="left"
                  />
                </div>
              </div>
              <div className="flex gap-3 pt-1">
                <button type="submit" disabled={leadershipSubmitting}
                  className="rounded-xl bg-[#26352f] px-5 py-2 text-xs font-semibold text-white hover:bg-[#b36b3c]">
                  {leadershipSubmitting ? "Saving..." : "Assign Role"}
                </button>
                <button type="button" onClick={() => setLeadershipMember(null)}
                  className="rounded-xl border border-[#c9c5bb] px-5 py-2 text-xs font-semibold text-[#617068] hover:border-[#b36b3c]">
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </section>
  );
}
