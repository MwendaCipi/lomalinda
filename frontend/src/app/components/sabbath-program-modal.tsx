"use client";

import { useEffect } from "react";
import { ArrowRight, X } from "lucide-react";

export type SabbathProgramData = { name: string; department?: string; date: string; programText?: string; programFile?: string | null; programItems?: [string, string][]; isDesignated: boolean };

const genericProgram: [string, string][] = [["8:00 AM", "Sabbath School"], ["10:00 AM", "Song service and announcements"], ["11:00 AM", "Divine service"], ["12:30 PM", "Fellowship lunch"], ["2:00 PM", "Afternoon program"]];

function isImageFile(path: string) { return /\.(png|jpe?g|webp|gif)(\?.*)?$/i.test(path); }

export default function SabbathProgramModal({ program, onClose }: { program: SabbathProgramData | null; onClose: () => void }) {
  useEffect(() => { if (!program) return; const handleKeyDown = (event: KeyboardEvent) => event.key === "Escape" && onClose(); document.addEventListener("keydown", handleKeyDown); return () => document.removeEventListener("keydown", handleKeyDown); }, [program, onClose]);
  if (!program) return null;
  const hasUploadedProgram = Boolean(program.programFile);
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-bark/60 p-4" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><section role="dialog" aria-modal="true" aria-labelledby="program-title" className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white shadow-xl"><div className="flex items-start justify-between border-b border-sand-line px-6 py-5 sm:px-8"><div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-ember">{program.date}</p><h2 id="program-title" className="mt-2 text-2xl font-semibold text-bark">{program.name}</h2>{program.department && <p className="mt-1 text-sm text-moss">Led by {program.department}</p>}</div><button type="button" onClick={onClose} aria-label="Close program" className="ml-4 leading-none text-moss hover:text-bark"><X size={20} aria-hidden="true" /></button></div><div className="px-6 py-6 sm:px-8">{hasUploadedProgram && program.programFile && isImageFile(program.programFile) ? <img src={program.programFile} alt={`${program.name} program`} className="h-auto max-h-[65vh] w-full rounded-lg object-contain" /> : hasUploadedProgram && program.programFile ? <a href={program.programFile} target="_blank" rel="noreferrer" className="font-semibold text-ember hover:underline inline-flex items-center gap-1">Open uploaded program <ArrowRight size={12} aria-hidden="true" /></a> : <div>{program.programText && <p className="mb-5 text-sm leading-6 text-moss">{program.programText}</p>}<div className="divide-y divide-sand-line border-y border-sand-line">{(program.programItems ?? genericProgram).map(([time, title]) => <div key={`${time}-${title}`} className="flex gap-6 py-3 text-sm"><span className="w-24 shrink-0 font-semibold text-ember">{time}</span><span className="text-bark">{title}</span></div>)}</div></div>}</div><div className="border-t border-sand-line px-6 py-4 text-right sm:px-8"><button type="button" onClick={onClose} className="text-sm font-semibold text-bark hover:text-ember">Close</button></div></section></div>;
}
