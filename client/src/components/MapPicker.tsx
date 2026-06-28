import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// Fix the broken default marker icon that bundlers break by missing the image URLs.
delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

export interface MapPickerValue {
  address: string;
  latitude: number;
  longitude: number;
}

interface Props {
  value?: MapPickerValue | null;
  onChange: (v: MapPickerValue) => void;
}

export function MapPicker({ value, onChange }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const defaultCenter: L.LatLngTuple = value
      ? [value.latitude, value.longitude]
      : [39.5, -98.35]; // center of the US as a sensible default
    const defaultZoom = value ? 14 : 4;

    const map = L.map(containerRef.current, {
      center: defaultCenter,
      zoom: defaultZoom,
    });
    mapRef.current = map;

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
    }).addTo(map);

    if (value) {
      markerRef.current = L.marker([value.latitude, value.longitude]).addTo(map);
    }

    map.on("click", async (e: L.LeafletMouseEvent) => {
      const { lat, lng } = e.latlng;

      // Place or move the marker immediately.
      if (markerRef.current) {
        markerRef.current.setLatLng([lat, lng]);
      } else {
        markerRef.current = L.marker([lat, lng]).addTo(map);
      }

      // Reverse geocode via Nominatim (OpenStreetMap, free, no key needed).
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`,
          { headers: { "Accept-Language": "en" } },
        );
        const data = await res.json();
        const address = data.display_name ?? `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
        onChange({ address, latitude: lat, longitude: lng });
      } catch {
        // If geocoding fails, fall back to raw coordinates.
        onChange({
          address: `${lat.toFixed(5)}, ${lng.toFixed(5)}`,
          latitude: lat,
          longitude: lng,
        });
      }
    });

    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
    // Only run once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      ref={containerRef}
      className="h-64 w-full rounded-md border border-border"
      style={{ zIndex: 0 }}
    />
  );
}
