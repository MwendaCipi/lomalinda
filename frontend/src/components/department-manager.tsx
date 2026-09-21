"use client";

import { useEffect, useState } from "react";
import {
  Plus,
  Search,
  CheckCircle2,
  Clock,
  Building2,
  Heart,
  Award,
  Shield,
  X,
  Phone,
  Mail,
  Accessibility,
} from "lucide-react";
import { showAlert } from "@/lib/alerts";

export type DepartmentKey = "amm" | "awm" | "aym" | "apm" | "chaplaincy";

interface DepartmentConfig {
  key: DepartmentKey;
  name: string;
  fullName: string;
  badge: string;
  bgColor: string;
  textColor: string;
  description: string;
  targetCriteria: string;
}

const DEPARTMENTS: Record<DepartmentKey, DepartmentConfig> = {
  amm: {
    key: "amm",
    name: "Adventist Men",
    fullName: "Adventist Men's Organization (AMM)",
    badge: "AMM",
    bgColor: "bg-blue-900",
    textColor: "text-blue-900",
    description: "Equipping men for spiritual leadership, family guidance, community outreach, and church development.",
    targetCriteria: "Men aged 36+ and male church leaders",
  },
  awm: {
    key: "awm",
    name: "Adventist Women",
    fullName: "Adventist Women's Ministries (AWM & Dorcas)",
    badge: "AWM",
    bgColor: "bg-rose-800",
    textColor: "text-rose-800",
    description: "Nurturing women, supporting families, conducting Dorcas welfare, and fostering community evangelism.",
    targetCriteria: "Women aged 36+ and female church leaders",
  },
  aym: {
    key: "aym",
    name: "Adventist Youth & Children",
    fullName: "Adventist Youth Ministries (AYM & Children)",
    badge: "AYM / Children",
    bgColor: "bg-amber-800",
    textColor: "text-amber-800",
    description: "Youth fellowship (18-35 yrs), Ambassadors, Pathfinders, Adventurers, and Children's Sabbath School.",
    targetCriteria: "Youth aged 18–35 and Children under 18",
  },
  apm: {
    key: "apm",
    name: "Adventist Possibility",
    fullName: "Adventist Possibility Ministries (APM)",
    badge: "APM",
    bgColor: "bg-teal-800",
    textColor: "text-teal-800",
    description: "Promoting inclusion, accessibility, and dignity for individuals with disabilities, caregivers, and orphans.",
    targetCriteria: "Members and friends with registered disabilities or special needs",
  },
  chaplaincy: {
    key: "chaplaincy",
    name: "Chaplaincy Ministry",
    fullName: "Chaplaincy & Institutional Pastoral Care",
    badge: "Chaplaincy",
    bgColor: "bg-indigo-900",
    textColor: "text-indigo-900",
    description: "Pastoral care in schools, hospitals, correctional facilities, and crisis counseling.",
    targetCriteria: "Chaplains, counselors, and institutional visitation ministers",
  },
};

export function getAutomaticDepartments(user: {
  age?: number | null;
  date_of_birth?: string | null;
  gender?: string | null;
  disability?: string | null;
}): DepartmentKey[] {
  const keys: DepartmentKey[] = [];

  // Calculate age if DOB provided
  let computedAge = user.age;
  if (computedAge === undefined || computedAge === null) {
    if (user.date_of_birth) {
      const birthDate = new Date(user.date_of_birth);
      const today = new Date();
      if (!isNaN(birthDate.getTime())) {
        let a = today.getFullYear() - birthDate.getFullYear();
        const m = today.getMonth() - birthDate.getMonth();
        if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
          a--;
        }
        computedAge = a;
      }
    }
  }

  // Placement based on age & gender
  if (computedAge !== undefined && computedAge !== null && !isNaN(computedAge)) {
    if (computedAge < 36) {
      keys.push("aym"); // Children (<18) and Youth (18-35)
    } else {
      const g = (user.gender || "").toLowerCase().trim();
      if (g === "female" || g === "f") {
        keys.push("awm");
      } else if (g === "male" || g === "m") {
        keys.push("amm");
      }
    }
  }

  // APM Rule: Automatic placement if person has a disability or special needs
  const dis = (user.disability || "").trim().toLowerCase();
  if (dis && dis !== "none" && dis !== "no" && dis !== "n/a") {
    keys.push("apm");
  }

  return keys;
}

interface MemberRecord {
  id: number;
  username: string;
  first_name: string;
  last_name: string;
  email: string;
  phone_number?: string;
  gender?: string;
  date_of_birth?: string;
  disability?: string;
  role?: string;
  account_type?: string;
  age?: number;
}

interface DeptEvent {
  id: string;
  title: string;
  date: string;
  time: string;
  location: string;
  lead: string;
  notes: string;
}

const SAMPLE_EVENTS: Record<DepartmentKey, DeptEvent[]> = {
  amm: [
    {
      id: "EV-AMM-1",
      title: "Annual Men's Spiritual Retreat & Breakfast",
      date: "2026-10-17",
      time: "07:00 AM - 12:00 PM",
      location: "Fellowship Grounds",
      lead: "AMM Leader",
      notes: "Devotional, fatherhood seminar, and church expansion project review.",
    },
  ],
  awm: [
    {
      id: "EV-AWM-1",
      title: "Dorcas Welfare Community Visitation & Food Drive",
      date: "2026-10-11",
      time: "02:00 PM - 05:00 PM",
      location: "Community Center",
      lead: "AWM Leader",
      notes: "Distributing food packages and clothing items.",
    },
  ],
  aym: [
    {
      id: "EV-AYM-1",
      title: "Youth & Pathfinder Investiture Service",
      date: "2026-10-24",
      time: "09:00 AM - 04:00 PM",
      location: "Main Sanctuary",
      lead: "Youth Leader & Master Guides",
      notes: "Pathfinder honor badges, Bible bowl competition, and baptismal rally.",
    },
  ],
  apm: [
    {
      id: "EV-APM-1",
      title: "Possibility Ministries Awareness & Special Needs Sabbath",
      date: "2026-11-07",
      time: "09:00 AM - 01:00 PM",
      location: "Main Sanctuary",
      lead: "APM Leader & Sign Language Translators",
      notes: "Sign language interpretation, ramp accessibility check, and guest speaker.",
    },
  ],
  chaplaincy: [
    {
      id: "EV-CHP-1",
      title: "Hospital & Institutional Pastoral Care Visitation",
      date: "2026-10-04",
      time: "02:30 PM - 05:30 PM",
      location: "Regional Medical Center",
      lead: "Head Chaplain",
      notes: "Prayers for the sick and chaplaincy counseling support.",
    },
  ],
};

interface DepartmentManagerProps {
  deptKey: DepartmentKey;
  initialSubTab?: "members" | "calendar" | "activities";
}

export function DepartmentManager({ deptKey, initialSubTab = "members" }: DepartmentManagerProps) {
  const config = DEPARTMENTS[deptKey] || DEPARTMENTS.amm;

  const activeSubTab = initialSubTab;
  const [members, setMembers] = useState<MemberRecord[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [events, setEvents] = useState<DeptEvent[]>(SAMPLE_EVENTS[deptKey] || []);

  // Event Modal State
  const [showAddEventModal, setShowAddEventModal] = useState(false);
  const [newEvent, setNewEvent] = useState({
    title: "",
    date: "",
    time: "09:00 AM",
    location: "Main Sanctuary",
    lead: "",
    notes: "",
  });

  const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

  useEffect(() => {
    setEvents(SAMPLE_EVENTS[deptKey] || []);
    setLoadingMembers(true);

    const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
    fetch(`${API_URL}/api/members/users/`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((res) => (res.ok ? res.json() : []))
      .then((data: MemberRecord[]) => {
        if (Array.isArray(data)) {
          // Filter members that automatically belong to this department
          const matched = data.filter((u) => {
            const depts = getAutomaticDepartments(u);
            // Also match if explicit role or chaplaincy
            if (deptKey === "chaplaincy" && ((u.role || "").includes("chaplain") || (u.role || "").includes("admin"))) {
              return true;
            }
            return depts.includes(deptKey);
          });
          setMembers(matched);
        } else {
          setMembers([]);
        }
      })
      .catch(() => setMembers([]))
      .finally(() => setLoadingMembers(false));
  }, [deptKey, API_URL]);

  const filteredMembers = members.filter((m) => {
    const fullName = `${m.first_name || ""} ${m.last_name || ""} ${m.username || ""}`.toLowerCase();
    const query = searchQuery.toLowerCase();
    return (
      fullName.includes(query) ||
      (m.email || "").toLowerCase().includes(query) ||
      (m.phone_number || "").includes(query)
    );
  });

  const handleAddEvent = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEvent.title.trim() || !newEvent.date) return;

    const eventObj: DeptEvent = {
      id: `EV-${Date.now()}`,
      title: newEvent.title.trim(),
      date: newEvent.date,
      time: newEvent.time,
      location: newEvent.location.trim() || "Main Sanctuary",
      lead: newEvent.lead.trim() || config.name,
      notes: newEvent.notes.trim(),
    };

    setEvents((prev) => [eventObj, ...prev]);
    setShowAddEventModal(false);
    setNewEvent({ title: "", date: "", time: "09:00 AM", location: "Main Sanctuary", lead: "", notes: "" });
    showAlert("Event Added", `"${eventObj.title}" has been added to ${config.name} calendar.`, "success");
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className={`rounded-2xl border border-[#dfdbd1] ${config.bgColor} p-6 text-white shadow-sm`}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <Building2 className="h-6 w-6 text-[#f5d0a9]" />
              <h1 className="text-xl font-bold tracking-tight">{config.fullName}</h1>
            </div>
            <p className="mt-1.5 text-xs text-[#e8e2d5] leading-relaxed max-w-2xl">
              {config.description}
            </p>
          </div>
          <div className="shrink-0">
            <span className="rounded-full bg-white/20 px-3.5 py-1 text-xs font-bold backdrop-blur-sm">
              Target: {config.targetCriteria}
            </span>
          </div>
        </div>
      </div>

      {/* SUB-TAB 1: MEMBERS */}
      {activeSubTab === "members" && (
        <div className="space-y-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between rounded-2xl border border-[#dfdbd1] bg-white p-4 shadow-sm">
            <div className="relative min-w-[220px] flex-1">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-[#617068]" />
              <input
                type="text"
                placeholder={`Search ${config.name} members by name, email, phone...`}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-xl border border-[#dfdbd1] bg-[#faf9f5] pl-9 pr-3 py-2 text-xs font-medium text-[#26352f] focus:border-[#b36b3c] focus:outline-none"
              />
            </div>
            <p className="text-xs text-[#617068]">
              Showing <span className="font-bold text-[#26352f]">{filteredMembers.length}</span> members automatically assigned to this department.
            </p>
          </div>

          <div className="overflow-hidden rounded-2xl border border-[#dfdbd1] bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-[#dfdbd1] bg-[#f4f1ea] font-bold text-[#26352f]">
                  <tr>
                    <th className="px-4 py-3">Member Name</th>
                    <th className="px-4 py-3">Sex</th>
                    <th className="px-4 py-3">Age Group</th>
                    <th className="px-4 py-3">Disability / Special Needs</th>
                    <th className="px-4 py-3">Contact</th>
                    <th className="px-4 py-3">Role / Account</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#dfdbd1]">
                  {loadingMembers ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-[#617068]">
                        Loading department members...
                      </td>
                    </tr>
                  ) : filteredMembers.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-[#617068]">
                        No members currently matched to {config.fullName}.
                      </td>
                    </tr>
                  ) : (
                    filteredMembers.map((m) => {
                      const ageVal = m.age !== undefined ? m.age : undefined;
                      const disVal = (m.disability || "").trim();
                      const hasDis = disVal && disVal.toLowerCase() !== "none" && disVal.toLowerCase() !== "no";

                      return (
                        <tr key={m.id} className="transition hover:bg-[#faf8f3]">
                          <td className="px-4 py-3">
                            <p className="font-bold text-[#26352f]">
                              {m.first_name || m.last_name ? `${m.first_name || ""} ${m.last_name || ""}` : m.username}
                            </p>
                            <p className="text-[11px] text-[#617068]">{m.email}</p>
                          </td>
                          <td className="px-4 py-3 text-[#26352f] font-semibold">{m.gender || "—"}</td>
                          <td className="px-4 py-3">
                            {ageVal !== undefined ? (
                              <span className="rounded-md bg-[#ede8dc] px-2 py-0.5 text-[10px] font-bold text-[#26352f]">
                                {ageVal} yrs ({ageVal < 18 ? "Child" : ageVal <= 35 ? "Youth" : "Adult"})
                              </span>
                            ) : (
                              <span className="text-[#a1a1a1]">Not recorded</span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            {hasDis ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-teal-100 px-2.5 py-0.5 text-[10px] font-bold text-teal-800">
                                <Accessibility className="h-3 w-3" />
                                {disVal}
                              </span>
                            ) : (
                              <span className="text-[#a1a1a1]">None</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-[#617068]">
                            {m.phone_number ? (
                              <span className="flex items-center gap-1">
                                <Phone className="h-3 w-3 text-[#b36b3c]" />
                                {m.phone_number}
                              </span>
                            ) : (
                              <span className="text-[#a1a1a1]">No Phone</span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <span className="rounded-md bg-[#26352f] px-2 py-0.5 text-[10px] font-bold text-white capitalize">
                              {m.account_type === "friend" ? "Friend of Church" : m.role || "Member"}
                            </span>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* SUB-TAB 2: CALENDAR & EVENTS */}
      {activeSubTab === "calendar" && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-[#26352f]">{config.name} Calendar &amp; Events</h2>
              <p className="text-xs text-[#617068]">Scheduled rallies, retreats, departmental meetings, and special sabbaths.</p>
            </div>
            <button
              onClick={() => setShowAddEventModal(true)}
              className="inline-flex items-center gap-2 rounded-xl bg-[#26352f] px-4 py-2 text-xs font-bold text-white shadow transition hover:bg-[#1a2420]"
            >
              <Plus className="h-4 w-4" />
              Add Event
            </button>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {events.map((ev) => (
              <div key={ev.id} className="rounded-2xl border border-[#dfdbd1] bg-white p-5 shadow-sm space-y-3">
                <div className="flex items-center justify-between border-b border-[#dfdbd1] pb-3">
                  <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold text-white ${config.bgColor}`}>
                    {config.badge}
                  </span>
                  <span className="text-[11px] font-bold text-[#26352f]">{ev.date}</span>
                </div>
                <h3 className="font-bold text-sm text-[#26352f]">{ev.title}</h3>
                <p className="text-xs text-[#617068] flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5 text-[#b36b3c]" />
                  {ev.time}
                </p>
                <p className="text-xs text-[#617068]">{ev.notes}</p>
                <div className="pt-2 border-t border-[#dfdbd1] flex items-center justify-between text-[11px]">
                  <span className="font-semibold text-[#26352f]">📍 {ev.location}</span>
                  <span className="text-[#617068]">Lead: {ev.lead}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* SUB-TAB 3: ACTIVITIES & OUTREACH */}
      {activeSubTab === "activities" && (
        <div className="space-y-6">
          <div className="rounded-2xl border border-[#dfdbd1] bg-white p-6 shadow-sm space-y-4">
            <h3 className="font-bold text-base text-[#26352f] flex items-center gap-2">
              <Award className="h-5 w-5 text-[#b36b3c]" />
              {config.name} Core Objectives &amp; Programs
            </h3>
            <p className="text-xs text-[#617068] leading-relaxed">
              Below are the key active programs and strategic initiatives currently tracked by {config.fullName}.
            </p>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-xl border border-[#dfdbd1] bg-[#faf9f5] p-4 space-y-1">
                <h4 className="font-bold text-xs text-[#26352f]">1. Evangelism &amp; Community Outreach</h4>
                <p className="text-xs text-[#617068]">Organizing local community visitation, literature distribution, and branch Sabbath school initiatives.</p>
              </div>
              <div className="rounded-xl border border-[#dfdbd1] bg-[#faf9f5] p-4 space-y-1">
                <h4 className="font-bold text-xs text-[#26352f]">2. Member Nurture &amp; Fellowship</h4>
                <p className="text-xs text-[#617068]">Conducting small group prayer bands, spiritual mentoring, and annual departmental sabbaths.</p>
              </div>
              <div className="rounded-xl border border-[#dfdbd1] bg-[#faf9f5] p-4 space-y-1">
                <h4 className="font-bold text-xs text-[#26352f]">3. Benevolence &amp; Welfare</h4>
                <p className="text-xs text-[#617068]">Supporting members in need, hospital visits, and welfare support funds.</p>
              </div>
              <div className="rounded-xl border border-[#dfdbd1] bg-[#faf9f5] p-4 space-y-1">
                <h4 className="font-bold text-xs text-[#26352f]">4. Leadership &amp; Skill Development</h4>
                <p className="text-xs text-[#617068]">Hosting seminars, workshops, and inter-church rallies for growth and empowerment.</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: ADD EVENT */}
      {showAddEventModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl border border-[#dfdbd1] bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between border-b border-[#dfdbd1] pb-3">
              <h3 className="font-bold text-base text-[#26352f]">Add {config.name} Event</h3>
              <button onClick={() => setShowAddEventModal(false)} className="text-[#617068] hover:text-[#26352f]">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleAddEvent} className="mt-4 space-y-4 text-xs">
              <div>
                <label className="font-bold text-[#26352f]">Event Title *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Departmental Rally"
                  value={newEvent.title}
                  onChange={(e) => setNewEvent({ ...newEvent, title: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-[#dfdbd1] p-2.5 font-medium text-[#26352f]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-[#26352f]">Date *</label>
                  <input
                    type="date"
                    required
                    value={newEvent.date}
                    onChange={(e) => setNewEvent({ ...newEvent, date: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-[#dfdbd1] p-2.5 font-medium text-[#26352f]"
                  />
                </div>
                <div>
                  <label className="font-bold text-[#26352f]">Time</label>
                  <input
                    type="text"
                    placeholder="09:00 AM"
                    value={newEvent.time}
                    onChange={(e) => setNewEvent({ ...newEvent, time: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-[#dfdbd1] p-2.5 font-medium text-[#26352f]"
                  />
                </div>
              </div>

              <div>
                <label className="font-bold text-[#26352f]">Location</label>
                <input
                  type="text"
                  placeholder="Main Sanctuary"
                  value={newEvent.location}
                  onChange={(e) => setNewEvent({ ...newEvent, location: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-[#dfdbd1] p-2.5 font-medium text-[#26352f]"
                />
              </div>

              <div>
                <label className="font-bold text-[#26352f]">Leader / Organizer</label>
                <input
                  type="text"
                  placeholder="Department Leader"
                  value={newEvent.lead}
                  onChange={(e) => setNewEvent({ ...newEvent, lead: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-[#dfdbd1] p-2.5 font-medium text-[#26352f]"
                />
              </div>

              <div>
                <label className="font-bold text-[#26352f]">Notes / Details</label>
                <textarea
                  rows={2}
                  placeholder="Event details..."
                  value={newEvent.notes}
                  onChange={(e) => setNewEvent({ ...newEvent, notes: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-[#dfdbd1] p-2.5 text-xs text-[#26352f]"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddEventModal(false)}
                  className="rounded-xl border border-[#dfdbd1] px-4 py-2 text-xs font-bold text-[#26352f]"
                >
                  Cancel
                </button>
                <button type="submit" className="rounded-xl bg-[#26352f] px-4 py-2 text-xs font-bold text-white shadow">
                  Save Event
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
