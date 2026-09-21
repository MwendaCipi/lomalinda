"use client";

import { CircleMarker, MapContainer, Popup, TileLayer } from "react-leaflet";
import { useEffect, useState } from "react";

import "leaflet/dist/leaflet.css";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";
type ChurchSettings = { church_name: string; address: string; latitude: string | null; longitude: string | null };

export default function ChurchLocation() {
  const [settings, setSettings] = useState<ChurchSettings | null>(null);
  useEffect(() => { fetch(`${API_URL}/api/members/church-settings/`).then((response) => response.ok ? response.json() : null).then(setSettings).catch(() => setSettings(null)); }, []);
  if (!settings?.latitude || !settings.longitude) {
    // Nothing pinned on the map yet: name the place and send visitors to a
    // search, rather than telling them the location is "coming soon".
    const query = encodeURIComponent([settings?.church_name || "SDA Loma Linda, Meru", settings?.address || "Meru, Kenya"].filter(Boolean).join(", "));
    return (
      <div>
        <p className="text-sm leading-7 text-white/70">{settings?.address || "Loma Linda, Meru, Kenya"}</p>
        <a href={`https://www.google.com/maps/search/?api=1&query=${query}`} target="_blank" rel="noreferrer" className="mt-3 inline-block text-sm font-semibold text-[#f1c89e] hover:underline">
          Open in Google Maps &rarr;
        </a>
      </div>
    );
  }
  const position: [number, number] = [Number(settings.latitude), Number(settings.longitude)];
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${settings.latitude},${settings.longitude}`;
  return <div><div className="h-72 overflow-hidden rounded-xl border border-[#dfdbd1]"><MapContainer center={position} zoom={16} scrollWheelZoom={false} className="h-full w-full"><TileLayer attribution='&copy; OpenStreetMap contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" /><CircleMarker center={position} radius={10} pathOptions={{ color: "#b36b3c", fillColor: "#b36b3c", fillOpacity: 0.85 }}><Popup>{settings.church_name}<br />{settings.address}</Popup></CircleMarker></MapContainer></div><a href={mapsUrl} target="_blank" rel="noreferrer" className="mt-4 inline-block text-sm font-semibold text-[#b36b3c] hover:underline">Open in Google Maps →</a></div>;
}
