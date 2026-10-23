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

/**
 * The map link the church's own record supports, or null when it supports none.
 *
 * A pin opens the exact point the church placed. Without one, the address —
 * and only the address — is what a search may use. The church's *name* never
 * is: a search for "SDA Church Loma Linda" answers to the listing Google already
 * has, which is the plot the church used to meet at, and that link was
 * sending visitors to the wrong building. With neither pin nor address there
 * is no link, because a map that opens somewhere else is worse than no map.
 */
export function churchMapHref(settings: ChurchSettings | null): string | null {
  const rawLat = settings?.latitude;
  const rawLng = settings?.longitude;
  // A blank pair is "no pin", not the null island: an empty string would
  // otherwise read as 0 and send everyone to the Gulf of Guinea.
  if (rawLat != null && rawLng != null && String(rawLat).trim() !== "" && String(rawLng).trim() !== "") {
    const latitude = Number(rawLat);
    const longitude = Number(rawLng);
    if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
      return `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`;
    }
  }
  const address = settings?.address?.trim();
  if (!address) return null;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}
