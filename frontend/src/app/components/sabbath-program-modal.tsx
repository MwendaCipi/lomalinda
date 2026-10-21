"use client";

import { useEffect } from "react";
import { ArrowRight, X } from "lucide-react";
import { ProgramDocument, type ProgramItem } from "@/components/program-document";

export type SabbathProgramData = {
  name: string;
  department?: string;
  /** The ministry's own leader, named on the sheet. */
  lead?: string;
  date: string;
  /** The event's day as yyyy-mm-dd, so the sheet can spell its weekday. */
  dateISO?: string;
  programText?: string;
  programFile?: string | null;
  /** The order of service the ministry typed, shown on the sheet. */
  programItems?: ProgramItem[];
  isDesignated: boolean;
};

const genericProgram: ProgramItem[] = [
  { start: "8:00", end: "", title: "Sabbath School", participants: [], parts: [] },
  { start: "10:00", end: "", title: "Song service and announcements", participants: [], parts: [] },
  { start: "11:00", end: "", title: "Divine service", participants: [], parts: [] },
  { start: "12:30", end: "", title: "Fellowship lunch", participants: [], parts: [] },
  { start: "14:00", end: "", title: "Afternoon program", participants: [], parts: [] },
];

function isImageFile(path: string) {
  return /\.(png|jpe?g|webp|gif)(\?.*)?$/i.test(path);
}

export default function SabbathProgramModal({
  program,
  onClose,
}: {
  program: SabbathProgramData | null;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!program) return;
    const handleKeyDown = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [program, onClose]);
  if (!program) return null;
  const hasUploadedProgram = Boolean(program.programFile);
  const items = program.programItems ?? [];
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-bark/60 p-4"
      role="presentation"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="program-title"
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white shadow-xl"
      >
        <div className="flex items-start justify-between border-b border-sand-line px-6 py-5 sm:px-8">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ember">{program.date}</p>
            <h2 id="program-title" className="mt-2 text-2xl font-semibold text-bark">
              {program.name}
            </h2>
            {program.department && <p className="mt-1 text-sm text-moss">{program.department}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close program"
            className="ml-4 leading-none text-moss hover:text-bark"
          >
            <X size={20} aria-hidden="true" />
          </button>
        </div>
        <div className="px-6 py-6 sm:px-8">
          {hasUploadedProgram && program.programFile && isImageFile(program.programFile) ? (
            // eslint-disable-next-line @next/next/no-img-element -- the church's own upload, of any origin: optimizing it would mean proxying member files through the app
            <img
              src={program.programFile}
              alt={`${program.name} program`}
              className="mx-auto h-auto max-h-[65vh] w-full rounded-lg object-contain"
            />
          ) : (
            hasUploadedProgram &&
            program.programFile && (
              <a
                href={program.programFile}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 font-semibold text-ember hover:underline"
              >
                Open uploaded program <ArrowRight size={12} aria-hidden="true" />
              </a>
            )
          )}
          {/* The programme the ministry typed, on the sheet it was fixed
              into — set on sand so the page reads as paper on a desk. */}
          {items.length > 0 && (
            <div className={`${hasUploadedProgram ? "mt-5 " : ""}rounded-xl bg-sand p-4`}>
              <ProgramDocument
                title={program.name}
                date={program.dateISO}
                department={program.department}
                lead={program.lead}
                items={items}
              />
            </div>
          )}
          {/* An event with neither carries the church's standing order, on the
              same sheet — a programme is read the same way whoever typed it. */}
          {!hasUploadedProgram && items.length === 0 && (
            <>
              {program.programText && (
                <p className="mb-5 text-sm leading-6 text-moss">{program.programText}</p>
              )}
              <div className="rounded-xl bg-sand p-4">
                <ProgramDocument
                  title={program.name}
                  date={program.dateISO}
                  department={program.department}
                  lead={program.lead}
                  items={genericProgram}
                />
              </div>
            </>
          )}
        </div>
        <div className="border-t border-sand-line px-6 py-4 text-right sm:px-8">
          <button
            type="button"
            onClick={onClose}
            className="text-sm font-semibold text-bark hover:text-ember"
          >
            Close
          </button>
        </div>
      </section>
    </div>
  );
}
