"use client";

import { useEffect, useId, useRef, useState } from "react";
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { showAlert } from "@/lib/alerts";
import { Crosshair, Map } from "lucide-react";

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

/** How a coordinate is written into the manual fields (and back out). */
function coordText(value: number | null) {
  return value == null ? "" : String(value);
}

function ChangeView({ center }: { center: [number, number] }) {
  const map = useMap();
  useEffect(() => {
    map.setView(center, map.getZoom());
  }, [center, map]);
  return null;
}

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
  const defaultPosition: [number, number] = [-0.0463, 37.6562]; // Meru, Kenya default
  const position: [number, number] = latitude && longitude ? [latitude, longitude] : defaultPosition;
  const [detecting, setDetecting] = useState(false);
  const [showMap, setShowMap] = useState(false);

  // Manual entry comes first: GPS needs permission and a signal, and a map tap
  // needs a working tile server, so coordinates can always be typed instead.
  // The two fields are the record of the chosen point — the buttons that fill
  // them (GPS, Show Map) sit below, on one row.
  const [latText, setLatText] = useState(coordText(latitude));
  const [lngText, setLngText] = useState(coordText(longitude));
  const latRef = useRef<HTMLInputElement>(null);
  const lngRef = useRef<HTMLInputElement>(null);
  const fieldId = useId();

  // Pins dropped elsewhere (map tap, GPS fix, a dragged marker) must appear in
  // the fields — except while someone is halfway through typing one, when
  // rewriting the text would eat a half-entered "37.".
  useEffect(() => {
    const active = document.activeElement;
    if (active === latRef.current || active === lngRef.current) return;
    setLatText(coordText(latitude));
    setLngText(coordText(longitude));
  }, [latitude, longitude]);

  /** Read both fields and hand a valid pair up; warn and revert otherwise. */
  const commitManual = () => {
    const rawLat = latText.trim();
    const rawLng = lngText.trim();

    if (rawLat === "" && rawLng === "") {
      if (latitude != null || longitude != null) onClear?.();
      return;
    }

    const lat = Number(rawLat);
    const lng = Number(rawLng);
    const valid =
      rawLat !== "" &&
      rawLng !== "" &&
      Number.isFinite(lat) &&
      Number.isFinite(lng) &&
      lat >= -90 &&
      lat <= 90 &&
      lng >= -180 &&
      lng <= 180;

    if (!valid) {
      showAlert(
        "Check the coordinates",
        "Latitude must be a number from -90 to 90 and longitude from -180 to 180, for example -0.0463 and 37.6562.",
        "warning"
      );
      setLatText(coordText(latitude));
      setLngText(coordText(longitude));
      return;
    }

    onChange(lat, lng);
    setLatText(String(lat));
    setLngText(String(lng));
  };

  const handleDetectGPS = () => {
    if ("geolocation" in navigator) {
      setDetecting(true);
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          onChange(pos.coords.latitude, pos.coords.longitude);
          setDetecting(false);
          showAlert(
            "GPS Location Captured",
            `Your coordinates (${pos.coords.latitude.toFixed(5)}, ${pos.coords.longitude.toFixed(5)}) were captured successfully.`,
            "success"
          );
        },
        (err) => {
          setDetecting(false);
          if (err.code === 1) {
            showAlert(
              "Location Permission Denied",
              "Location access was not allowed. You can describe your location or show the map if you wish to drop a pin manually.",
              "info"
            );
          } else {
            showAlert(
              "Location Unavailable",
              "Unable to detect GPS position. You can show the map if you wish to drop a location pin manually.",
              "warning"
            );
          }
        },
        { enableHighAccuracy: true }
      );
    } else {
      showAlert("GPS unavailable", "GPS geolocation is not supported by your browser.", "warning");
    }
  };

  return (
    <div className="space-y-3">
      {/* Enter the coordinates: the fallback for a phone with no signal, a
          denied location permission, or a coordinate copied from elsewhere —
          and it works with the map never opened. */}
      <div className="rounded-2xl border border-sand-line bg-sand p-3">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wide text-moss" htmlFor={`${fieldId}-lat`}>
              Latitude
            </label>
            <input
              id={`${fieldId}-lat`}
              ref={latRef}
              type="text"
              inputMode="decimal"
              autoComplete="off"
              value={latText}
              placeholder="-0.0463"
              onChange={(e) => setLatText(e.target.value)}
              onBlur={(e) => {
                // Tabbing across to longitude is not a finished edit.
                if (e.relatedTarget === lngRef.current) return;
                commitManual();
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  commitManual();
                }
              }}
              className="mt-1 w-full rounded-xl border border-sand-mute bg-white px-3 py-2 text-sm outline-none focus:border-ember"
            />
          </div>
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wide text-moss" htmlFor={`${fieldId}-lng`}>
              Longitude
            </label>
            <input
              id={`${fieldId}-lng`}
              ref={lngRef}
              type="text"
              inputMode="decimal"
              autoComplete="off"
              value={lngText}
              placeholder="37.6562"
              onChange={(e) => setLngText(e.target.value)}
              onBlur={(e) => {
                if (e.relatedTarget === latRef.current) return;
                commitManual();
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  commitManual();
                }
              }}
              className="mt-1 w-full rounded-xl border border-sand-mute bg-white px-3 py-2 text-sm outline-none focus:border-ember"
            />
          </div>
        </div>
      </div>

      {/* Both ways to fill those fields, side by side on one row. */}
      <div className="flex items-center gap-2">
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
            {latitude && longitude && (
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
