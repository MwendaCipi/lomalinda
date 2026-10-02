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
  MapPin,
} from "lucide-react";
import { showAlert } from "@/lib/alerts";
import { NO_ROLE_LABEL } from "./roles-combobox";
import { BackToOverviewArrow } from "@/components/back-to-overview-arrow";
import { densityCellPad } from "@/lib/table-density";

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
  const rowPad = densityCellPad();
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
      <div className={`rounded-2xl border border-sand-line ${config.bgColor} p-6 text-white shadow-sm`}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-1">
            <BackToOverviewArrow />
            <div>
              <div className="flex items-center gap-2.5">
                <Building2 className="h-6 w-6 text-gold-bright" />
                <h1 className="text-xl font-bold tracking-tight">{config.fullName}</h1>
              </div>
              <p className="mt-1.5 text-xs text-sand-warm leading-relaxed max-w-2xl">
                {config.description}
              </p>
            </div>
          </div>
          <div className="shrink-0 flex flex-col sm:flex-row items-start sm:items-center gap-2.5 w-full sm:w-auto">
            <div className="w-full sm:w-64">
              <input
                type="text"
                placeholder={`Search ${config.name} members…`}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-xl border border-white/20 bg-white/10 px-3 py-1.5 text-xs text-white placeholder-white/60 backdrop-blur-sm outline-none focus:bg-white/20 focus:border-white/40"
              />
            </div>
            <span className="rounded-full bg-white/20 px-3.5 py-1 text-xs font-bold backdrop-blur-sm">
              Target: {config.targetCriteria}
            </span>
          </div>
        </div>
      </div>

      {/* SUB-TAB 1: MEMBERS */}
      {activeSubTab === "members" && (
        <div className="space-y-4">

          <div className="overflow-hidden rounded-2xl border border-sand-line bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-sand-line bg-sand-film font-bold text-bark">
                  <tr>
                    <th className="px-4 py-3">Member Name</th>
                    <th className="px-4 py-3">Sex</th>
                    <th className="px-4 py-3">Age Group</th>
                    <th className="px-4 py-3">Disability / Special Needs</th>
                    <th className="px-4 py-3">Contact</th>
                    <th className="px-4 py-3">Role / Account</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-sand-line">
                  {loadingMembers ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-moss">
                        Loading department members...
                      </td>
                    </tr>
                  ) : filteredMembers.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-moss">
                        No members currently matched to {config.fullName}.
                      </td>
                    </tr>
                  ) : (
                    filteredMembers.map((m) => {
                      const ageVal = m.age !== undefined ? m.age : undefined;
                      const disVal = (m.disability || "").trim();
                      const hasDis = disVal && disVal.toLowerCase() !== "none" && disVal.toLowerCase() !== "no";

                      return (
                        <tr key={m.id} className="transition hover:bg-sand-silk">
                          <td className={`px-4 ${rowPad}`}>
                            <p className="font-bold text-bark">
                              {m.first_name || m.last_name ? `${m.first_name || ""} ${m.last_name || ""}` : m.username}
                            </p>
                            <p className="text-[11px] text-moss">{m.email}</p>
                          </td>
                          <td className={`px-4 ${rowPad} text-bark font-semibold`}>{m.gender || "—"}</td>
                          <td className={`px-4 ${rowPad}`}>
                            {ageVal !== undefined ? (
                              <span className="rounded-md bg-sand-grain px-2 py-0.5 text-[10px] font-bold text-bark">
                                {ageVal} yrs ({ageVal < 18 ? "Child" : ageVal <= 35 ? "Youth" : "Adult"})
                              </span>
                            ) : (
                              <span className="text-graydim">Not recorded</span>
                            )}
                          </td>
                          <td className={`px-4 ${rowPad}`}>
                            {hasDis ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-teal-100 px-2.5 py-0.5 text-[10px] font-bold text-teal-800">
                                <Accessibility className="h-3 w-3" />
                                {disVal}
                              </span>
                            ) : (
                              <span className="text-graydim">None</span>
                            )}
                          </td>
                          <td className={`px-4 ${rowPad} text-moss`}>
                            {m.phone_number ? (
                              <span className="flex items-center gap-1">
                                <Phone className="h-3 w-3 text-ember" />
                                {m.phone_number}
                              </span>
                            ) : (
                              <span className="text-graydim">No Phone</span>
                            )}
                          </td>
                          <td className={`px-4 ${rowPad}`}>
                            <span className="rounded-md bg-bark px-2 py-0.5 text-[10px] font-bold text-white capitalize">
                              {m.account_type === "friend"
                                ? "Friend of Church"
                                : m.role && m.role !== "member"
                                  ? m.role
                                  : NO_ROLE_LABEL}
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
              <h2 className="text-base font-bold text-bark">{config.name} Calendar &amp; Events</h2>
              <p className="text-xs text-moss">Scheduled rallies, retreats, departmental meetings, and special sabbaths.</p>
            </div>
            <button
              onClick={() => setShowAddEventModal(true)}
              className="inline-flex items-center gap-2 rounded-xl bg-bark px-4 py-2 text-xs font-bold text-white shadow transition hover:bg-bark-950"
            >
              <Plus className="h-4 w-4" />
              Add Event
            </button>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {events.map((ev) => (
              <div key={ev.id} className="rounded-2xl border border-sand-line bg-white p-5 shadow-sm space-y-3">
                <div className="flex items-center justify-between border-b border-sand-line pb-3">
                  <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold text-white ${config.bgColor}`}>
                    {config.badge}
                  </span>
                  <span className="text-[11px] font-bold text-bark">{ev.date}</span>
                </div>
                <h3 className="font-bold text-sm text-bark">{ev.title}</h3>
                <p className="text-xs text-moss flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5 text-ember" />
                  {ev.time}
                </p>
                <p className="text-xs text-moss">{ev.notes}</p>
                <div className="pt-2 border-t border-sand-line flex items-center justify-between text-[11px]">
                  <span className="inline-flex items-center gap-1 font-semibold text-bark"><MapPin size={12} aria-hidden="true" /> {ev.location}</span>
                  <span className="text-moss">Lead: {ev.lead}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* SUB-TAB 3: ACTIVITIES & OUTREACH */}
      {activeSubTab === "activities" && (
        <div className="space-y-6">
          <div className="rounded-2xl border border-sand-line bg-white p-6 shadow-sm space-y-4">
            <h3 className="font-bold text-base text-bark flex items-center gap-2">
              <Award className="h-5 w-5 text-ember" />
              {config.name} Core Objectives &amp; Programs
            </h3>
            <p className="text-xs text-moss leading-relaxed">
              Below are the key active programs and strategic initiatives currently tracked by {config.fullName}.
            </p>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-xl border border-sand-line bg-sand-card p-4 space-y-1">
                <h4 className="font-bold text-xs text-bark">1. Evangelism &amp; Community Outreach</h4>
                <p className="text-xs text-moss">Organizing local community visitation, literature distribution, and branch Sabbath school initiatives.</p>
              </div>
              <div className="rounded-xl border border-sand-line bg-sand-card p-4 space-y-1">
                <h4 className="font-bold text-xs text-bark">2. Member Nurture &amp; Fellowship</h4>
                <p className="text-xs text-moss">Conducting small group prayer bands, spiritual mentoring, and annual departmental sabbaths.</p>
              </div>
              <div className="rounded-xl border border-sand-line bg-sand-card p-4 space-y-1">
                <h4 className="font-bold text-xs text-bark">3. Benevolence &amp; Welfare</h4>
                <p className="text-xs text-moss">Supporting members in need, hospital visits, and welfare support funds.</p>
              </div>
              <div className="rounded-xl border border-sand-line bg-sand-card p-4 space-y-1">
                <h4 className="font-bold text-xs text-bark">4. Leadership &amp; Skill Development</h4>
                <p className="text-xs text-moss">Hosting seminars, workshops, and inter-church rallies for growth and empowerment.</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: ADD EVENT */}
      {showAddEventModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl border border-sand-line bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between border-b border-sand-line pb-3">
              <h3 className="font-bold text-base text-bark">Add {config.name} Event</h3>
              <button onClick={() => setShowAddEventModal(false)} className="text-moss hover:text-bark">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleAddEvent} className="mt-4 space-y-4 text-xs">
              <div>
                <label className="font-bold text-bark">Event Title *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Departmental Rally"
                  value={newEvent.title}
                  onChange={(e) => setNewEvent({ ...newEvent, title: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-sand-line p-2.5 font-medium text-bark"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-bark">Date *</label>
                  <input
                    type="date"
                    required
                    value={newEvent.date}
                    onChange={(e) => setNewEvent({ ...newEvent, date: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-sand-line p-2.5 font-medium text-bark"
                  />
                </div>
                <div>
                  <label className="font-bold text-bark">Time</label>
                  <input
                    type="text"
                    placeholder="09:00 AM"
                    value={newEvent.time}
                    onChange={(e) => setNewEvent({ ...newEvent, time: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-sand-line p-2.5 font-medium text-bark"
                  />
                </div>
              </div>

              <div>
                <label className="font-bold text-bark">Location</label>
                <input
                  type="text"
                  placeholder="Main Sanctuary"
                  value={newEvent.location}
                  onChange={(e) => setNewEvent({ ...newEvent, location: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-sand-line p-2.5 font-medium text-bark"
                />
              </div>

              <div>
                <label className="font-bold text-bark">Leader / Organizer</label>
                <input
                  type="text"
                  placeholder="Department Leader"
                  value={newEvent.lead}
                  onChange={(e) => setNewEvent({ ...newEvent, lead: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-sand-line p-2.5 font-medium text-bark"
                />
              </div>

              <div>
                <label className="font-bold text-bark">Notes / Details</label>
                <textarea
                  rows={2}
                  placeholder="Event details..."
                  value={newEvent.notes}
                  onChange={(e) => setNewEvent({ ...newEvent, notes: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-sand-line p-2.5 text-xs text-bark"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddEventModal(false)}
                  className="rounded-xl border border-sand-line px-4 py-2 text-xs font-bold text-bark"
                >
                  Cancel
                </button>
                <button type="submit" className="rounded-xl bg-bark px-4 py-2 text-xs font-bold text-white shadow">
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
