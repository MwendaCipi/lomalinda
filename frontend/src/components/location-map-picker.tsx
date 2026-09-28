"use client";

import { useEffect, useState } from "react";
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { showAlert } from "@/lib/alerts";
import { Crosshair, Map, MapPin } from "lucide-react";

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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {latitude && longitude ? (
            <div className="flex items-center gap-2 min-w-0">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-mist-select px-2.5 py-1 text-xs font-semibold text-sage-bright border border-sage-mild">
                <MapPin size={13} className="inline" aria-hidden="true" /> Location: {latitude.toFixed(5)}, {longitude.toFixed(5)}
              </span>
              {onClear && (
                <button
                  type="button"
                  onClick={onClear}
                  className="text-xs font-semibold text-red-600 hover:underline shrink-0"
                >
                  Clear
                </button>
              )}
            </div>
          ) : showMap ? (
            <span className="text-xs font-medium text-moss">
              Tap on the map below to drop your location pin
            </span>
          ) : (
            // Phones show the two buttons themselves; the sentence explaining
            // them only earns its space on a wider screen.
            <span className="hidden text-xs font-medium text-moss sm:inline">
              Use My GPS Location or Show Map
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleDetectGPS}
            disabled={detecting}
            className="inline-flex items-center gap-1.5 rounded-full border border-ember bg-white px-3.5 py-1.5 text-xs font-semibold text-ember transition hover:bg-ember hover:text-white disabled:opacity-50"
          >
            <Crosshair size={26} aria-hidden="true" />
            <span>{detecting ? "Detecting GPS..." : "Use My GPS Location"}</span>
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
      </div>

      {showMap && (
        <div className="h-64 overflow-hidden rounded-2xl border border-sand-line shadow-sm">
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
