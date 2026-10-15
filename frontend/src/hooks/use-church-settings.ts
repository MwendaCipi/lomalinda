"use client";

import { useEffect, useState } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

/**
 * The church's own record, as the visitor-facing site reads it.
 *
 * Only the fields a public page prints: what the church calls itself and where
 * it meets. `GET` on the endpoint is public and the site is a static export,
 * so the record arrives in the browser — the same shape every page then reads,
 * rather than each one carrying its own idea of the church's name and street.
 */
export type ChurchSettings = {
  church_name?: string;
  address?: string;
  latitude?: string | null;
  longitude?: string | null;
};

/** The church's record, or null until it answers (and if it never does). */
export function useChurchSettings(): ChurchSettings | null {
  const [settings, setSettings] = useState<ChurchSettings | null>(null);

  useEffect(() => {
    let alive = true;
    fetch(`${API_URL}/api/members/church-settings/`)
      .then((response) => (response.ok ? response.json() : null))
      .then((data: ChurchSettings | null) => {
        if (alive) setSettings(data ?? null);
      })
      .catch(() => {
        if (alive) setSettings(null);
      });
    return () => {
      alive = false;
    };
  }, []);

  return settings;
}

/**
 * What the church calls itself.
 *
 * The record holds the full name with its town — "SDA Church Loma Linda,
 * Meru" — and a line that stands alone reads better without the town, so
 * `short` keeps the part before the comma. A church that has never named
 * itself still reads as the church the site is about, which is what the
 * built-in wording was.
 */
export function churchName(settings: ChurchSettings | null, short = false): string {
  const name = settings?.church_name?.trim() || "SDA Church Loma Linda";
  if (!short) return name;
  return name.split(",")[0]?.trim() || name;
}

/**
 * The town the church's own name carries with it — "Meru" in "SDA Loma
 * Linda, Meru" — for a second line that would otherwise repeat it.
 */
export function churchTown(settings: ChurchSettings | null): string | null {
  const name = settings?.church_name?.trim();
  return name?.split(",")[1]?.trim() || null;
}

/**
 * Where the church meets.
 *
 * A meeting that names no place of its own is held at the church, and the
 * church's address is where that is. When the record carries no address the
 * church's own name is the answer it does hold — a street is never invented
 * for it, and neither is "the church grounds" supposed to outlive the address
 * the church actually set.
 */
export function churchWhere(settings: ChurchSettings | null): string | null {
  const address = settings?.address?.trim();
  if (address) return address;
  return settings?.church_name?.trim() || null;
}
