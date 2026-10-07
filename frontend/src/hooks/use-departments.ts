"use client";

import { useEffect, useState } from "react";
import type { DepartmentSummary } from "@/config/navigation";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";
const TTL = 60 * 1000;

const DEPARTMENT_LABEL_OVERRIDES: Record<string, string> = {
  development: "Development",
};

/** One person on a department's leadership table, and the office they hold. */
export type DepartmentHolder = { username: string; name: string; kind: "leader" | "assistant"; role: string };

/**
 * A department as the church records it, with the counts its desk reports.
 *
 * The rail only needs a code, a label and a heading; the dashboard's "Your
 * areas" needs more — how big the roll is, what is on the calendar, and who
 * holds it — so the same read serves both rather than the dashboard fetching
 * the directory a second time.
 */
export type DepartmentRow = DepartmentSummary & {
  /** The area's own one-line description, as its desk keeps it. */
  description: string;
  memberCount: number;
  eventCount: number;
  holders: DepartmentHolder[];
};

/**
 * The church's departments and ministries, for the surfaces that list them.
 *
 * The rail's Ministries and Departments rows are not written in the config —
 * they are the church's own records, so they are read here. Like the header
 * data, the rows are cached at module level: the rail and the phone's menu
 * both ask for them, navigation re-mounts both, and one fetch per minute is
 * enough for a list that changes when an elder adds a ministry.
 */
let cache: { rows: DepartmentRow[]; at: number } | null = null;
let inflight: Promise<DepartmentRow[] | null> | null = null;
const listeners = new Set<(rows: DepartmentRow[]) => void>();

/** One directory payload's rows, whether they are the reader's own areas or
    the church's whole record — the shape is the same either way. */
function mapDepartmentRows(data: unknown): DepartmentRow[] {
  const payload = data as { departments?: unknown[] } | null;
  return ((payload?.departments ?? []) as {
    code: string;
    label: string;
    description?: string;
    group?: string;
    member_count?: number;
    event_count?: number;
    roles?: { name?: string; holders?: { name?: string; username?: string; kind?: string }[] }[];
  }[]).map((row) => ({
    code: row.code,
    label: DEPARTMENT_LABEL_OVERRIDES[row.code] ?? row.label,
    description: String(row.description ?? ""),
    group: row.group === "ministry" || row.group === "office" ? row.group : "department",
    memberCount: Number(row.member_count ?? 0),
    eventCount: Number(row.event_count ?? 0),
    // Everyone the leadership table carries — leader and assistant alike,
    // because holding a row is what makes someone the area's leadership —
    // with the office they hold, so a dashboard can say "Treasurer"
    // rather than the generic leader/assistant pair.
    holders: (row.roles ?? []).flatMap((role) =>
      (role.holders ?? [])
        .filter((holder) => Boolean(holder.username))
        .map((holder) => ({
          username: String(holder.username),
          name: String((holder as { name?: string }).name ?? holder.username),
          kind: holder.kind === "assistant" ? ("assistant" as const) : ("leader" as const),
          role: String(role.name ?? ""),
        })),
    ),
  }));
}

async function fetchDepartments(): Promise<DepartmentRow[] | null> {
  const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
  if (!token) return null;
  try {
    const res = await fetch(`${API_URL}/api/members/departments/`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const rows = mapDepartmentRows(await res.json());
    cache = { rows, at: Date.now() };
    return rows;
  } catch {
    return null;
  }
}

/** Drop the cache — a desk that just added a ministry should see the row. */
export function invalidateDepartments() {
  cache = null;
  allCache = null;
  myDepartmentsCache = null;
}

// The signed-in member's own areas, cached like the directory: the rail asks
// on every mount. One /me/ read answers two questions — `codes` is the whole
// set of areas the member may open (every area for an office account), and
// `ties` is only the areas they genuinely belong to or serve in. The rail
// reads the first; the dashboard's "Your areas" reads the second.
type MyAreaSet = { codes: string[]; ties: string[] };
const EMPTY_AREAS: MyAreaSet = { codes: [], ties: [] };

let myDepartmentsCache: { set: MyAreaSet; at: number } | null = null;
let myInflight: Promise<MyAreaSet> | null = null;
const myListeners = new Set<(set: MyAreaSet) => void>();

async function fetchMyAreas(): Promise<MyAreaSet> {
  const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
  if (!token) return EMPTY_AREAS;
  try {
    const res = await fetch(`${API_URL}/api/members/me/`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return EMPTY_AREAS;
    const data = await res.json();
    const codes = (data?.my_departments ?? [])
      .map((row: { code?: string }) => String(row.code || ""))
      .filter(Boolean);
    const ties = Array.isArray(data?.my_ties) ? data.my_ties.map((code: unknown) => String(code)).filter(Boolean) : [];
    return { codes, ties };
  } catch {
    return EMPTY_AREAS;
  }
}

function useMyAreaSet(): MyAreaSet {
  const [set, setSet] = useState<MyAreaSet>(() => myDepartmentsCache?.set ?? EMPTY_AREAS);

  useEffect(() => {
    const fresh = myDepartmentsCache && Date.now() - myDepartmentsCache.at < TTL;
    if (fresh) return;
    let cancelled = false;
    const listener = (next: MyAreaSet) => {
      if (!cancelled) setSet(next);
    };
    myListeners.add(listener);
    void Promise.resolve().then(async () => {
      if (cancelled) return;
      const next = await (myInflight ?? (myInflight = fetchMyAreas().finally(() => {
        myInflight = null;
      })));
      if (cancelled) return;
      myDepartmentsCache = { set: next, at: Date.now() };
      myListeners.forEach((notify) => notify(next));
    });
    return () => {
      cancelled = true;
      myListeners.delete(listener);
    };
  }, []);

  return set;
}

/** Every area the member may open — the rail's rows. */
export function useMyDepartments(): string[] {
  return useMyAreaSet().codes;
}

/** Only the areas the member belongs to or serves in — the dashboard's. */
export function useMyTies(): string[] {
  return useMyAreaSet().ties;
}

// The church's *whole* record of areas — every ministry and department, not
// only the ones the reader belongs to. The Ministry and Departments pages
// browse all of them, and the directory reads that way for any signed-in
// member (`?all=true`). Cached apart from the member's own rows: the rail
// still wants the short list.
let allCache: { rows: DepartmentRow[]; at: number } | null = null;
let allInflight: Promise<DepartmentRow[] | null> | null = null;
const allListeners = new Set<(rows: DepartmentRow[]) => void>();

async function fetchAllDepartments(): Promise<DepartmentRow[] | null> {
  const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
  if (!token) return null;
  try {
    const res = await fetch(`${API_URL}/api/members/departments/?all=true`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const rows = mapDepartmentRows(await res.json());
    allCache = { rows, at: Date.now() };
    return rows;
  } catch {
    return null;
  }
}

/**
 * The church's whole directory of areas, for the pages that browse them: the
 * Ministry and Departments tabs, which every member may read. The rows are
 * cached like the member's own, and a desk that just added a ministry calls
 * `invalidateDepartments` to clear both caches.
 */
export function useAllDepartments(): DepartmentRow[] {
  const [rows, setRows] = useState<DepartmentRow[]>(() => allCache?.rows ?? []);

  useEffect(() => {
    const fresh = allCache && Date.now() - allCache.at < TTL;
    if (fresh) return;
    let cancelled = false;
    const listener = (next: DepartmentRow[]) => {
      if (!cancelled) setRows(next);
    };
    allListeners.add(listener);
    void Promise.resolve().then(async () => {
      if (cancelled) return;
      const next = await (allInflight ?? (allInflight = fetchAllDepartments().finally(() => {
        allInflight = null;
      })));
      if (cancelled || !next) return;
      allListeners.forEach((notify) => notify(next));
    });
    return () => {
      cancelled = true;
      allListeners.delete(listener);
    };
  }, []);

  return rows;
}

export function useDepartments(): DepartmentRow[] {
  const [rows, setRows] = useState<DepartmentRow[]>(() => cache?.rows ?? []);

  useEffect(() => {
    const fresh = cache && Date.now() - cache.at < TTL;
    if (fresh) return;
    let cancelled = false;
    const listener = (next: DepartmentRow[]) => {
      if (!cancelled) setRows(next);
    };
    listeners.add(listener);
    // Deferred by a microtask so the read is not started in the effect's own
    // synchronous body.
    void Promise.resolve().then(async () => {
      if (cancelled) return;
      const next = await (inflight ?? (inflight = fetchDepartments().finally(() => {
        inflight = null;
      })));
      if (cancelled || !next) return;
      listeners.forEach((notify) => notify(next));
    });
    return () => {
      cancelled = true;
      listeners.delete(listener);
    };
  }, []);

  return rows;
}
