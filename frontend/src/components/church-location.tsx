"use client";

import { CircleMarker, MapContainer, Popup, TileLayer } from "react-leaflet";
import { brand } from "@/lib/brand";
import { ArrowRight } from "lucide-react";
import { churchMapHref, churchName, churchWhere, useChurchSettings } from "@/hooks/use-church-settings";

import "leaflet/dist/leaflet.css";

/**
 * The church on the map, as the church's own record has it.
 *
 * The name, the street and the pin all come from Church Settings, so a leader
 * who moves the pin or rewrites the address changes what a visitor sees
 * without a redeploy. Until a pin is placed the address is still named and
 * the link searches *that address* — never the church's name, whose listing
 * is the plot the church no longer worships at. With neither pin nor address
 * the place is named and no map is offered, because a map that opens the
 * wrong building sends a visitor to the wrong place.
 */
export default function ChurchLocation() {
  const settings = useChurchSettings();
  const where = churchWhere(settings);
  const latitude = settings?.latitude ? Number(settings.latitude) : null;
  const longitude = settings?.longitude ? Number(settings.longitude) : null;
  const mapsUrl = churchMapHref(settings);

  if (latitude === null || longitude === null) {
    // Nothing pinned on the map yet: name the place, and offer the map the
    // record can honestly back — the address's own search, or none.
    return (
      <div>
        {where && <p className="text-sm leading-7 text-white/70">{where}</p>}
        {mapsUrl && (
          <a href={mapsUrl} target="_blank" rel="noreferrer" className="mt-3 inline-block text-sm font-semibold text-gold hover:underline">
            Open in Google Maps &rarr;
          </a>
        )}
      </div>
    );
  }

  const position: [number, number] = [latitude, longitude];
  return <div><div className="h-72 overflow-hidden rounded-xl border border-sand-line"><MapContainer center={position} zoom={16} scrollWheelZoom={false} className="h-full w-full"><TileLayer attribution='&copy; OpenStreetMap contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" /><CircleMarker center={position} radius={10} pathOptions={{ color: brand.ember, fillColor: brand.ember, fillOpacity: 0.85 }}><Popup>{churchName(settings)}<br />{where}</Popup></CircleMarker></MapContainer></div><a href={mapsUrl ?? undefined} target="_blank" rel="noreferrer" className="mt-4 inline-block text-sm font-semibold text-ember hover:underline">Open in Google Maps <ArrowRight size={12} className="inline" aria-hidden="true" /></a></div>;
}
