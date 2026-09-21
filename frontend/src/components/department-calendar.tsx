"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { getMinistryGivingPurpose } from "@/config/ministries";

type DepartmentEvent = { date: string; name: string; department?: string };

export function DepartmentCalendar({ department, events, loaded }: { department: string; events: DepartmentEvent[]; loaded: boolean }) {
  const year = new Date().getFullYear();
  const [open, setOpen] = useState(false);
  const [selectedYear, setSelectedYear] = useState(year);
  const [month, setMonth] = useState("all");
  const [search, setSearch] = useState("");
  const rows = useMemo(() => events.filter((event) => event.department?.toLowerCase().includes(department.toLowerCase()) && event.date.startsWith(`${selectedYear}-`) && (month === "all" || Number(event.date.slice(5, 7)) - 1 === Number(month)) && `${event.date} ${event.name} ${event.department}`.toLowerCase().includes(search.toLowerCase().trim())).sort((a, b) => a.date.localeCompare(b.date)), [department, events, month, search, selectedYear]);
  return (
    <div className="mt-6 border-t border-[#dfdbd1] pt-5">
      <button
        type="button"
        onClick={() => setOpen((visible) => !visible)}
        className="text-sm font-semibold text-[#b36b3c] hover:underline"
      >
        {open ? "Hide department calendar" : `See ${year} department calendar`}{" "}
        {open ? "↑" : "→"}
      </button>

      {open && (
        <div className="mt-5 space-y-4">
          <div className="grid gap-3 sm:grid-cols-[120px_150px_1fr]">
            <select
              value={selectedYear}
              onChange={(event) => setSelectedYear(Number(event.target.value))}
              aria-label={`${department} calendar year`}
              className="rounded-lg border border-[#c9c5bb] bg-[#fcfbf9] px-3 py-2 text-sm"
            >
              <option value={year - 1}>{year - 1}</option>
              <option value={year}>{year}</option>
              <option value={year + 1}>{year + 1}</option>
            </select>
            <select
              value={month}
              onChange={(event) => setMonth(event.target.value)}
              aria-label={`${department} calendar month`}
              className="rounded-lg border border-[#c9c5bb] bg-[#fcfbf9] px-3 py-2 text-sm"
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
              className="rounded-lg border border-[#c9c5bb] bg-[#fcfbf9] px-3 py-2 text-sm outline-none focus:border-[#b36b3c]"
            />
          </div>

          {/* Mobile Cards View (visible on md:hidden) */}
          <div className="grid gap-3 md:hidden">
            {rows.length === 0 ? (
              <div className="py-6 text-center text-xs text-[#617068] bg-white rounded-xl p-4 border border-[#dfdbd1]">
                No events found matching your search.
              </div>
            ) : (
              rows.map((event) => (
                <div key={`${event.date}-${event.name}`} className="rounded-2xl border border-[#dfdbd1] bg-white p-4 shadow-sm space-y-2">
                  <div className="flex items-center justify-between gap-2 border-b border-[#eeeae2] pb-2">
                    <h3 className="font-bold text-sm text-[#26352f]">{event.name}</h3>
                    <span className="rounded-lg bg-[#eef2ed] px-2.5 py-1 text-[11px] font-bold text-[#5f8067]">
                      {new Date(`${event.date}T12:00:00`).toLocaleDateString("en-KE", { month: "short", day: "numeric" })}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3 pt-1 text-xs">
                    <Link
                      href={`/calendar?year=${selectedYear}&month=all&search=${encodeURIComponent(event.name)}`}
                      className="font-semibold text-[#b36b3c] hover:underline"
                    >
                      View program &rarr;
                    </Link>
                    <Link
                      href={`/give?purpose=${encodeURIComponent(getMinistryGivingPurpose(event.department || department))}`}
                      className="font-semibold text-[#5f8067] hover:underline"
                    >
                      Give support
                    </Link>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* PC Desktop Table View (visible on md and up) */}
          <div className="hidden md:block overflow-x-auto custom-table-scrollbar rounded-lg border border-[#dfdbd1]">
            <table className="w-full min-w-[500px] text-left text-sm">
              <thead className="border-b border-[#dfdbd1] bg-[#eef2ed] text-xs uppercase tracking-wider text-[#617068]">
                <tr>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Event</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#e9e5dd]">
                {rows.map((event) => (
                  <tr key={`${event.date}-${event.name}`}>
                    <td className="whitespace-nowrap px-4 py-3 text-[#617068]">
                      {new Date(`${event.date}T12:00:00`).toLocaleDateString(
                        "en-KE",
                        { month: "short", day: "numeric", year: "numeric" }
                      )}
                    </td>
                    <td className="px-4 py-3 font-medium">{event.name}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <Link
                          href={`/calendar?year=${selectedYear}&month=all&search=${encodeURIComponent(
                            event.name
                          )}`}
                          className="font-semibold text-[#b36b3c] hover:underline"
                        >
                          View program
                        </Link>
                        <span className="text-[#c9c5bb]">|</span>
                        <Link
                          href={`/give?purpose=${encodeURIComponent(
                            getMinistryGivingPurpose(
                              event.department || department
                            )
                          )}`}
                          className="font-semibold text-[#5f8067] hover:underline"
                        >
                          Give support
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile Calendar Cards View (visible on mobile only) */}
          <div className="grid gap-3 md:hidden">
            {rows.map((event) => {
              const dateStr = new Date(`${event.date}T12:00:00`).toLocaleDateString(
                "en-KE",
                { month: "short", day: "numeric", year: "numeric" }
              );
              return (
                <div
                  key={`dept-mob-${event.date}-${event.name}`}
                  className="rounded-xl bg-white p-4 border border-[#dfdbd1] shadow-sm space-y-2 text-xs"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="text-[11px] font-semibold text-[#b36b3c]">{dateStr}</span>
                      <h4 className="font-bold text-sm text-[#26352f] mt-0.5">{event.name}</h4>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-[#dfdbd1]/60 flex items-center justify-between text-xs">
                    <Link
                      href={`/calendar?year=${selectedYear}&month=all&search=${encodeURIComponent(
                        event.name
                      )}`}
                      className="font-semibold text-[#b36b3c] hover:underline"
                    >
                      View program
                    </Link>
                    <Link
                      href={`/give?purpose=${encodeURIComponent(
                        getMinistryGivingPurpose(event.department || department)
                      )}`}
                      className="font-semibold text-[#5f8067] hover:underline"
                    >
                      Give support
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>

          {loaded && rows.length === 0 && (
            <p className="px-4 py-5 text-sm text-[#617068]">
              No events have been added for this department yet.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export default DepartmentCalendar;
