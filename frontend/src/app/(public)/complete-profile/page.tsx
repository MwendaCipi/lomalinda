"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { showAlert } from "@/lib/alerts";
import { ComboboxPopover } from "@/components/combobox-popover";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

const GIFTS_OPTIONS = [
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

const DISABILITY_OPTIONS = [
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

const MINISTRY_OPTIONS = [
  { value: "adventist_men", label: "Adventist Men" },
  { value: "adventist_women", label: "Adventist Women" },
  { value: "young_adults", label: "Young Adults" },
  { value: "ambassadors", label: "Ambassadors" },
];

const inputClass =
  "mt-1.5 w-full rounded-xl border border-[#c9c5bb] bg-white px-4 py-2.5 text-sm text-[#26352f] outline-none focus:border-[#b36b3c]";

/**
 * A multi-select combo shared by the gifts and disability boxes.
 *
 * The choices live inside a dropdown checklist rather than on the form itself,
 * so a long list of gifts or conditions no longer buries the rest of the form.
 * The panel renders through a portal (see ComboboxPopover), which also keeps it
 * from being clipped on a short screen.
 */
function CheckboxCombobox({
  legend,
  options,
  selected,
  onChange,
  placeholder = "Select…",
  allowNone,
}: {
  legend: string;
  options: string[];
  selected: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  allowNone?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  // The panel lives in document.body, so outside-click has to count it as
  // inside — otherwise ticking the first box would close the list.
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node;
      if (
        containerRef.current && !containerRef.current.contains(target) &&
        !(panelRef.current && panelRef.current.contains(target))
      ) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const toggle = (item: string) => {
    if (selected.includes(item)) {
      onChange(selected.filter((value) => value !== item));
    } else {
      onChange([...selected, item]);
    }
  };

  const summary =
    selected.length === 0
      ? allowNone
        ? "None recorded"
        : placeholder
      : selected.length <= 2
        ? selected.join(", ")
        : `${selected.slice(0, 2).join(", ")} +${selected.length - 2} more`;

  return (
    <div ref={containerRef}>
      <span className="block text-sm font-medium">{legend}</span>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="mt-1.5 flex w-full items-center justify-between gap-3 rounded-xl border border-[#c9c5bb] bg-white px-4 py-2.5 text-left text-sm text-[#26352f] outline-none focus:border-[#b36b3c]"
      >
        <span className={`truncate ${selected.length === 0 ? "text-[#617068]" : ""}`}>
          {summary}
        </span>
        <span className="flex shrink-0 items-center gap-2 text-[#617068]">
          {selected.length > 0 && (
            <span className="rounded-full bg-[#5f8067] px-1.5 py-0.5 text-[10px] font-bold text-white">
              {selected.length}
            </span>
          )}
          <span className={`text-[10px] transition-transform ${open ? "rotate-180" : ""}`}>▼</span>
        </span>
      </button>

      <ComboboxPopover
        anchorRef={containerRef}
        panelRef={panelRef}
        open={open}
        minW={280}
        panelClassName="max-h-72 overflow-y-auto rounded-xl border border-[#dfdbd1] bg-white p-2 shadow-lg scrollbar-thin"
      >
        {allowNone && (
          <label className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm hover:bg-[#f7f4ee]">
            <input
              type="checkbox"
              checked={selected.length === 0}
              onChange={() => onChange([])}
              className="h-4 w-4 rounded border-[#c9c5bb] accent-[#5f8067]"
            />
            <span className="font-medium">None — no special needs</span>
          </label>
        )}
        {options.map((item) => {
          const checked = selected.includes(item);
          return (
            <label
              key={item}
              className={`flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm ${
                checked ? "bg-[#eef2ed] font-semibold text-[#2d5d39]" : "hover:bg-[#f7f4ee]"
              }`}
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={() => toggle(item)}
                className="h-4 w-4 rounded border-[#c9c5bb] accent-[#5f8067]"
              />
              <span>{item}</span>
            </label>
          );
        })}
        <div className="sticky bottom-0 -mx-2 mt-1 border-t border-[#dfdbd1] bg-white px-2 pt-2">
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="w-full rounded-lg bg-[#26352f] px-3 py-2 text-xs font-semibold text-white"
          >
            Done
          </button>
        </div>
      </ComboboxPopover>
    </div>
  );
}

export default function CompleteProfilePage() {
  const router = useRouter();
  const [nextPath, setNextPath] = useState("/dashboard");
  const [checking, setChecking] = useState(true);
  const [gender, setGender] = useState("");
  // Set once by the member; after that the office is the only way to correct it.
  const [genderLocked, setGenderLocked] = useState(false);
  const [gifts, setGifts] = useState<string[]>([]);
  const [ministry, setMinistry] = useState("");
  const [disability, setDisability] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const next = new URLSearchParams(window.location.search).get("next");
    // Resolve the destination once, locally: state updates would not be visible
    // to the fetch callback below in this same effect run.
    const destination = next?.startsWith("/") ? next : "/dashboard";
    if (next?.startsWith("/")) setNextPath(next);

    const token = localStorage.getItem("access_token");
    if (!token) {
      router.replace(`/login?next=${encodeURIComponent(window.location.pathname)}`);
      return;
    }
    fetch(`${API_URL}/api/members/me/`, { headers: { Authorization: `Bearer ${token}` } })
      .then(async (res) => {
        if (!res.ok) throw new Error();
        return res.json();
      })
      .then((me) => {
        // Pre-fill whatever the office already has on record so the member
        // only fills the gaps.
        setGender(me.gender || "");
        setGenderLocked(Boolean((me.gender || "").trim()));
        setGifts(me.gifts ? me.gifts.split(",").map((s: string) => s.trim()).filter(Boolean) : []);
        setMinistry(me.ministry || "");
        setDisability(
          me.disability ? me.disability.split(",").map((s: string) => s.trim()).filter(Boolean) : [],
        );
        if (!me.profile_update_pending) {
          // Nothing outstanding — straight to where they were headed.
          router.replace(destination);
        }
      })
      .catch(() => router.replace(`/login?next=${encodeURIComponent("/complete-profile")}`))
      .finally(() => setChecking(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (!gender) {
      setError("Please select your sex.");
      return;
    }
    if (gifts.length === 0) {
      setError("Please select at least one gift or talent.");
      return;
    }
    if (!ministry) {
      setError("Please select your ministry.");
      return;
    }

    setSaving(true);
    try {
      const token = localStorage.getItem("access_token");
      const response = await fetch(`${API_URL}/api/members/me/profile-update/`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          gender,
          gifts,
          ministry,
          // An empty list is a deliberate "none" — it still saves a value.
          disability: disability.length > 0 ? disability : ["None"],
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(Object.values(data).flat().join(" ") || "Unable to save your details.");
        return;
      }
      showAlert("Details saved", data.detail || "Your details have been saved.", "success");
      router.replace(nextPath);
    } catch {
      setError("We could not reach the church server. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  if (checking) {
    return (
      <main className="flex min-h-[calc(100vh-73px)] items-center justify-center bg-[#f7f4ee] px-6 text-[#26352f]">
        <p className="text-sm text-[#617068]">Loading…</p>
      </main>
    );
  }

  return (
    <main className="flex min-h-[calc(100vh-73px)] items-start justify-center bg-[#f7f4ee] px-6 pb-28 pt-10 text-[#26352f] sm:items-center sm:pb-10">
      <section className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-sm ring-1 ring-[#dfdbd1] sm:p-8">
        <h1 className="text-3xl font-semibold tracking-tight">Add more details</h1>
        <p className="mt-3 text-sm leading-6 text-[#617068]">
          The leadership uses these details to plan ministry and serve you well.
        </p>
        <form onSubmit={submit} className="mt-6 space-y-5">
          {error && (
            <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-medium text-red-700">
              {error}
            </p>
          )}

          <label className="block text-sm font-medium">
            Sex
            <select
              value={gender}
              onChange={(event) => setGender(event.target.value)}
              className={inputClass}
              disabled={genderLocked}
              required
            >
              <option value="">-- Select Sex --</option>
              <option value="Male">Male</option>
              <option value="Female">Female</option>
              <option value="Other">Other</option>
            </select>
            {genderLocked && (
              <span className="mt-1 block text-xs font-normal text-[#617068]">
                Already on record. It cannot be changed here — ask the church
                office if it needs correcting.
              </span>
            )}
          </label>

          <CheckboxCombobox
            legend="Gifts & talents"
            options={GIFTS_OPTIONS}
            selected={gifts}
            onChange={setGifts}
            placeholder="Select gifts & talents…"
          />

          <label className="block text-sm font-medium">
            Ministry
            <select value={ministry} onChange={(event) => setMinistry(event.target.value)} className={inputClass} required>
              <option value="">-- Select Ministry --</option>
              {MINISTRY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <CheckboxCombobox
            legend="Disability / special needs"
            options={DISABILITY_OPTIONS}
            selected={disability}
            onChange={setDisability}
            allowNone
          />

          <button
            type="submit"
            disabled={saving}
            className="w-full rounded-full bg-[#26352f] px-5 py-3 font-medium text-white disabled:opacity-60"
          >
            {saving ? "Saving…" : "Save and continue"}
          </button>
        </form>
      </section>
    </main>
  );
}
