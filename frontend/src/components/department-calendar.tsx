"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowRight, ChevronUp } from "lucide-react";
import { getMinistryGivingPurpose } from "@/config/ministries";
import { dayFirst } from "@/lib/dates";
import { RecordList } from "./record-list";

type DepartmentEvent = { date: string; name: string; department?: string };

/**
 * The office writes a programme's department by hand, so the spellings drift
 * — "Adventist Men Ministries (AMM)" and "Adventist Men Ministry" name the
 * same area. Folding the plural into the singular lets one matcher read both.
 */
const departmentStem = (value: string) => value.toLowerCase().replace(/ies\b/g, "y");

export function DepartmentCalendar({ department, events, loaded }: { department: string; events: DepartmentEvent[]; loaded: boolean }) {
  const year = new Date().getFullYear();
  const [open, setOpen] = useState(false);
  const [selectedYear, setSelectedYear] = useState(year);
  const [month, setMonth] = useState("all");
  const [search, setSearch] = useState("");
  const rows = useMemo(() => events.filter((event) => event.department && departmentStem(event.department).includes(departmentStem(department)) && event.date.startsWith(`${selectedYear}-`) && (month === "all" || Number(event.date.slice(5, 7)) - 1 === Number(month)) && `${event.date} ${event.name} ${event.department}`.toLowerCase().includes(search.toLowerCase().trim())).sort((a, b) => a.date.localeCompare(b.date)), [department, events, month, search, selectedYear]);
  return (
    <div className="mt-6 border-t border-sand-line pt-5">
      <button
        type="button"
        onClick={() => setOpen((visible) => !visible)}
        className="text-sm font-semibold text-ember hover:underline"
      >
        {open ? "Hide department calendar" : `See ${year} department calendar`}{" "}
        {open ? <ChevronUp size={13} className="inline" aria-hidden="true" /> : <ArrowRight size={13} className="inline" aria-hidden="true" />}
      </button>

      {open && (
        <div className="mt-5 space-y-4">
          <div className="grid gap-3 sm:grid-cols-[120px_150px_1fr]">
            <select
              value={selectedYear}
              onChange={(event) => setSelectedYear(Number(event.target.value))}
              aria-label={`${department} calendar year`}
              className="rounded-lg border border-sand-mute bg-sand-plate px-3 py-2 text-sm"
            >
              <option value={year - 1}>{year - 1}</option>
              <option value={year}>{year}</option>
              <option value={year + 1}>{year + 1}</option>
            </select>
            <select
              value={month}
              onChange={(event) => setMonth(event.target.value)}
              aria-label={`${department} calendar month`}
              className="rounded-lg border border-sand-mute bg-sand-plate px-3 py-2 text-sm"
            >
              <option value="all">All months</option>
              {Array.from({ length: 12 }, (_, index) => (
                <option key={index} value={index}>
                  {new Date(2000, index, 1).toLocaleDateString("en-KE", {
                    month: "long",
                  })}
                </option>
              ))}
            </select>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              aria-label={`Search ${department} calendar`}
              placeholder="Search this calendar"
              className="rounded-lg border border-sand-mute bg-sand-plate px-3 py-2 text-sm outline-none focus:border-ember"
            />
          </div>

          {/* Table on desktop, cards on phones — RecordList owns the breakpoint pair. */}
          <RecordList
            rows={rows}
            loading={false}
            rowKey={(event) => `${event.date}-${event.name}`}
            headers={[{ label: "Date" }, { label: "Event" }, { label: "Actions" }]}
            loadingLabel=""
            tableEmpty=""
            cardsEmpty="No events found matching your search."
            stateClassName=""
            headClassName="border-b border-sand-line bg-mist-select text-xs uppercase tracking-wider text-moss"
            headRowClassName=""
            headCellClassName="px-4 py-3"
            tableClassName="w-full min-w-[500px] text-left text-sm"
            tableWrapperClassName="overflow-x-auto custom-table-scrollbar rounded-lg border border-sand-line"
            bodyClassName="divide-y divide-sand-wash"
            cardsStateClassName="py-6 text-center text-xs text-moss bg-white rounded-xl p-4 border border-sand-line"
            renderCard={(event) => (
                <div key={`${event.date}-${event.name}`} className="rounded-2xl border border-sand-line bg-white p-4 shadow-sm space-y-2">
                  <div className="flex items-center justify-between gap-2 border-b border-sand-soft pb-2">
                    <h3 className="font-bold text-sm text-bark">{event.name}</h3>
                    <span className="rounded-lg bg-mist-select px-2.5 py-1 text-[11px] font-bold text-sage">
                      {dayFirst(event.date)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3 pt-1 text-xs">
                    <Link
                      href={`/calendar?year=${selectedYear}&month=all&search=${encodeURIComponent(event.name)}`}
                      className="font-semibold text-ember hover:underline"
                    >
                      View program &rarr;
                    </Link>
                    <Link
                      href={`/give?purpose=${encodeURIComponent(getMinistryGivingPurpose(event.department || department))}`}
                      className="font-semibold text-sage hover:underline"
                    >
                      Give support
                    </Link>
                  </div>
                </div>
            )}
            renderRow={(event) => (
                  <tr key={`${event.date}-${event.name}`}>
                    <td className="whitespace-nowrap px-4 py-3 text-moss">
                      {dayFirst(event.date)}
                    </td>
                    <td className="px-4 py-3 font-medium">{event.name}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <Link
                          href={`/calendar?year=${selectedYear}&month=all&search=${encodeURIComponent(
                            event.name
                          )}`}
                          className="font-semibold text-ember hover:underline"
                        >
                          View program
                        </Link>
                        <span className="text-sand-mute">|</span>
                        <Link
                          href={`/give?purpose=${encodeURIComponent(
                            getMinistryGivingPurpose(
                              event.department || department
                            )
                          )}`}
                          className="font-semibold text-sage hover:underline"
                        >
                          Give support
                        </Link>
                      </div>
                    </td>
                  </tr>
              )}
          />

          {loaded && rows.length === 0 && (
            <p className="px-4 py-5 text-sm text-moss">
              No events have been added for this department yet.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export default DepartmentCalendar;
