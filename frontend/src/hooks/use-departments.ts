"use client";

import { useEffect, useState } from "react";
import type { DepartmentSummary } from "@/config/navigation";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";
const TTL = 60 * 1000;

/** One person on a department's leadership table, and the office they hold. */
export type DepartmentHolder = { username: string; kind: "leader" | "assistant"; role: string };

/**
 * A department as the church records it, with the counts its desk reports.
 *
 * The rail only needs a code, a label and a heading; the dashboard's "Your
 * areas" needs more — how big the roll is, what is on the calendar, and who
 * holds it — so the same read serves both rather than the dashboard fetching
 * the directory a second time.
 */
export type DepartmentRow = DepartmentSummary & {
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

async function fetchDepartments(): Promise<DepartmentRow[] | null> {
  const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
  if (!token) return null;
  try {
    const res = await fetch(`${API_URL}/api/members/departments/`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const rows: DepartmentRow[] = (data?.departments ?? []).map(
      (row: {
        code: string;
        label: string;
        group?: string;
        member_count?: number;
        event_count?: number;
        roles?: { name?: string; holders?: { username?: string; kind?: string }[] }[];
      }) => ({
        code: row.code,
        label: row.label,
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
              kind: holder.kind === "assistant" ? ("assistant" as const) : ("leader" as const),
              role: String(role.name ?? ""),
            })),
        ),
      }),
    );
    cache = { rows, at: Date.now() };
    return rows;
  } catch {
    return null;
  }
}

/** Drop the cache — a desk that just added a ministry should see the row. */
export function invalidateDepartments() {
  cache = null;
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
