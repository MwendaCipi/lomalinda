"use client";

import { useEffect, useId, useState } from "react";
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { showAlert } from "@/lib/alerts";
import { coordinatesFromMapLink, isShortMapLink } from "@/lib/places";
import { Crosshair, Link2, Map, MapPin } from "lucide-react";

// Default Leaflet icon fix for Next.js SSR
const defaultIcon = L.icon({
  iconUrl: "https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png",
  iconRetinaUrl: "https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

function MapClickHandler({ onSelectLocation }: { onSelectLocation: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      onSelectLocation(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

function ChangeView({ center }: { center: [number, number] }) {
  const map = useMap();
  useEffect(() => {
    map.setView(center, map.getZoom());
  }, [center, map]);
  return null;
}

/** Meru, Kenya — where the map opens before anything is pinned. */
const DEFAULT_POSITION: [number, number] = [-0.0463, 37.6562];

/**
 * Where something is, chosen the way people actually know it.
 *
 * A member asking for a home visit knows how to find their house in Google
 * Maps and how to share it; they do not know their latitude. So the link is
 * the input: paste the one Maps gives you, and the point it carries is put on
 * the map, where it can be seen and moved. The coordinates themselves are
 * stored and never shown — they are the map's business, not the asker's — and
 * the two other ways to a point (a GPS fix, a tap on the map) need none
 * either. Whatever ends up pinned is handed up as `latitude`/`longitude`.
 */
export default function LocationMapPicker({
  latitude,
  longitude,
  onChange,
  onClear,
}: {
  latitude: number | null;
  longitude: number | null;
  onChange: (lat: number, lng: number) => void;
  onClear?: () => void;
}) {
  const pinned = latitude != null && longitude != null;
  const position: [number, number] = pinned ? [latitude, longitude] : DEFAULT_POSITION;
  const [link, setLink] = useState("");
  const [reading, setReading] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [showMap, setShowMap] = useState(false);
  const fieldId = useId();

  /**
   * Read the field and pin the place it names.
   *
   * A link pasted from the Maps app is read outright. The short `maps.app.goo.gl`
   * form points at the full link instead of carrying one, so it is followed
   * once and re-read where it lands; when neither yields a point, the asker is
   * told how to get one rather than left guessing at numbers.
   */
  const readLink = async () => {
    const text = link.trim();
    if (!text) return;

    let found = coordinatesFromMapLink(text);
    if (!found && isShortMapLink(text)) {
      setReading(true);
      try {
        const response = await fetch(text, { mode: "no-cors", redirect: "follow" });
        found = coordinatesFromMapLink(response.url || "");
      } catch {
        found = null;
      } finally {
        setReading(false);
      }
    }

    if (!found) {
      showAlert(
        "We could not read a place from that link",
        "Open the place in Google Maps, tap Share then Copy link, and paste the whole link here — or show the map and put the pin there yourself.",
        "warning"
      );
      return;
    }

    onChange(found.latitude, found.longitude);
    // The link has done its work; the pin is what is kept, and the map is
    // opened so the place can be checked at a glance before it is submitted.
    setLink("");
    setShowMap(true);
  };

  const handleDetectGPS = () => {
    if (!("geolocation" in navigator)) {
      showAlert("GPS unavailable", "This browser cannot tell us where you are. Show the map and drop the pin instead.", "warning");
      return;
    }
    setDetecting(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        onChange(pos.coords.latitude, pos.coords.longitude);
        setDetecting(false);
        setShowMap(true);
        showAlert("Location captured", "Your place is pinned on the map — move it if it landed a little off.", "success");
      },
      (err) => {
        setDetecting(false);
        showAlert(
          err.code === 1 ? "Location permission denied" : "Location unavailable",
          "We could not place you. Paste a Google Maps link, or show the map and drop the pin yourself.",
          err.code === 1 ? "info" : "warning"
        );
      },
      { enableHighAccuracy: true }
    );
  };

  return (
    <div className="space-y-3">
      {/* The way in: a link, copied out of Google Maps. */}
      <div className="rounded-2xl border border-sand-line bg-sand p-3">
        <label
          className="block text-[10px] font-bold uppercase tracking-wide text-moss"
          htmlFor={`${fieldId}-link`}
        >
          Google Maps link
        </label>
        <div className="mt-1 flex items-center gap-2 rounded-xl border border-sand-mute bg-white px-3 py-2 focus-within:border-ember">
          <Link2 size={14} className="shrink-0 text-moss" aria-hidden="true" />
          <input
            id={`${fieldId}-link`}
            type="text"
            inputMode="url"
            autoComplete="off"
            spellCheck={false}
            value={link}
            placeholder="https://maps.app.goo.gl/…"
            onChange={(e) => setLink(e.target.value)}
            onBlur={() => {
              // Only a link is worth reading: typing a place name or leaving
              // the field after a half-finished thought should not nag.
              if (/https?:\/\//i.test(link)) void readLink();
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void readLink();
              }
            }}
            className="w-full bg-transparent text-sm outline-none placeholder:text-moss-faint"
          />
        </div>
        <p className="mt-1.5 text-[11px] leading-relaxed text-moss">
          {reading
            ? "Reading the link…"
            : "In Google Maps, find the place, then Share \u2192 Copy link and paste it here."}
        </p>
      </div>

      <p className="flex items-center gap-1.5 text-xs font-medium text-moss">
        <MapPin size={13} className={pinned ? "text-ember" : "text-moss-faint"} aria-hidden="true" />
        {pinned
          ? "Pinned. Open the map to check it, or tap the map to move it."
          : "No pin yet — paste a link, use your GPS, or drop the pin on the map."}
      </p>

      {/* The three ways to a point, on one row. */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={handleDetectGPS}
          disabled={detecting}
          className="inline-flex items-center gap-1.5 rounded-full border border-ember bg-white px-3.5 py-1.5 text-xs font-semibold text-ember transition hover:bg-ember hover:text-white disabled:opacity-50"
        >
          <Crosshair size={26} aria-hidden="true" />
          <span>{detecting ? "Detecting GPS..." : "Use My GPS"}</span>
        </button>
        <button
          type="button"
          onClick={() => setShowMap(!showMap)}
          className="inline-flex items-center gap-1.5 rounded-full border border-bark bg-white px-3.5 py-1.5 text-xs font-semibold text-bark transition hover:bg-bark hover:text-white"
        >
          <Map size={26} aria-hidden="true" />
          <span>{showMap ? "Hide Map" : "Show Map"}</span>
        </button>
        {pinned && onClear && (
          <button
            type="button"
            onClick={onClear}
            className="rounded-full px-2 text-xs font-semibold text-alert hover:underline"
          >
            Clear the pin
          </button>
        )}
      </div>

      {showMap && (
        // A phone's 256px map was a stamp, not a map: give it most of the
        // viewport below sm, and leave the desktop card as it was.
        <div className="h-[50vh] max-h-[520px] min-h-80 overflow-hidden rounded-2xl border border-sand-line shadow-sm sm:h-64 sm:max-h-none">
          <MapContainer center={position} zoom={15} scrollWheelZoom={false} className="h-full w-full">
            <ChangeView center={position} />
            <TileLayer
              attribution='&copy; OpenStreetMap contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <MapClickHandler onSelectLocation={onChange} />
            {pinned && (
              <Marker
                position={[latitude, longitude]}
                icon={defaultIcon}
                draggable
                eventHandlers={{
                  dragend(e) {
                    const marker = e.target;
                    const pos = marker.getLatLng();
                    onChange(pos.lat, pos.lng);
                  },
                }}
              />
            )}
          </MapContainer>
        </div>
      )}
    </div>
  );
}
