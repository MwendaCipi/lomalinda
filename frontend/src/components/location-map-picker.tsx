"use client";

import { useEffect, useState } from "react";
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

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
}: {
  latitude: number | null;
  longitude: number | null;
  onChange: (lat: number, lng: number) => void;
}) {
  const defaultPosition: [number, number] = [0.047, 37.649]; // Meru, Kenya default
  const position: [number, number] = latitude && longitude ? [latitude, longitude] : defaultPosition;
  const [detecting, setDetecting] = useState(false);

  const handleDetectGPS = () => {
    if ("geolocation" in navigator) {
      setDetecting(true);
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          onChange(pos.coords.latitude, pos.coords.longitude);
          setDetecting(false);
        },
        () => {
          alert("Unable to detect GPS position. Please tap on the map to set your location pin.");
          setDetecting(false);
        },
        { enableHighAccuracy: true }
      );
    } else {
      alert("GPS Geolocation is not supported by your browser.");
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-xs font-semibold uppercase tracking-wider text-[#617068]">
          {latitude && longitude
            ? `Pin Position: ${latitude.toFixed(6)}, ${longitude.toFixed(6)}`
            : "Tap on the map below to drop your location pin"}
        </span>
        <button
          type="button"
          onClick={handleDetectGPS}
          disabled={detecting}
          className="inline-flex items-center gap-1.5 rounded-full border border-[#b36b3c] bg-white px-3.5 py-1.5 text-xs font-semibold text-[#b36b3c] transition hover:bg-[#b36b3c] hover:text-white disabled:opacity-50"
        >
          <span>🎯</span>
          <span>{detecting ? "Detecting GPS..." : "Use My GPS Location"}</span>
        </button>
      </div>

      <div className="h-64 overflow-hidden rounded-2xl border border-[#dfdbd1] shadow-sm">
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
    </div>
  );
}
