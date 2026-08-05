"use client";

import { CircleMarker, MapContainer, Popup, TileLayer } from "react-leaflet";
import { useEffect, useState } from "react";

import "leaflet/dist/leaflet.css";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
type ChurchSettings = { church_name: string; address: string; latitude: string | null; longitude: string | null };

export default function ChurchLocation() {
  const [settings, setSettings] = useState<ChurchSettings | null>(null);
  useEffect(() => { fetch(`${API_URL}/api/members/church-settings/`).then((response) => response.ok ? response.json() : null).then(setSettings).catch(() => setSettings(null)); }, []);
  if (!settings?.latitude || !settings.longitude) return <p className="text-sm text-[#617068]">Church location coming soon.</p>;
  const position: [number, number] = [Number(settings.latitude), Number(settings.longitude)];
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${settings.latitude},${settings.longitude}`;
  return <div><div className="h-72 overflow-hidden rounded-xl border border-[#dfdbd1]"><MapContainer center={position} zoom={16} scrollWheelZoom={false} className="h-full w-full"><TileLayer attribution='&copy; OpenStreetMap contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" /><CircleMarker center={position} radius={10} pathOptions={{ color: "#b36b3c", fillColor: "#b36b3c", fillOpacity: 0.85 }}><Popup>{settings.church_name}<br />{settings.address}</Popup></CircleMarker></MapContainer></div><a href={mapsUrl} target="_blank" rel="noreferrer" className="mt-4 inline-block text-sm font-semibold text-[#b36b3c] hover:underline">Open in Google Maps →</a></div>;
}
