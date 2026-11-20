import { useEffect, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from "react-leaflet";

const MANILA = { lat: 14.5995, lng: 120.9842 };

// Our own pin shape (Leaflet's default pin image doesn't load with Vite).
const pinIcon = L.divIcon({
  className: "",
  html: '<span class="map-pin"></span>',
  iconSize: [30, 40],
  iconAnchor: [15, 40],
});

// Lets customers put a pin exactly on their door, so the Lalamove rider can find it.
// value: { lat, lng } or null. start: where to show the map before there's a pin.
export default function LocationPicker({ value, onChange, start, addressText }) {
  const [flyTo, setFlyTo] = useState(null);
  const [busy, setBusy] = useState(""); // "", "locating" or "searching"
  const [message, setMessage] = useState("");
  const [initialCenter] = useState(() => value ?? start ?? MANILA);

  function placePin(spot, note) {
    onChange(spot);
    setFlyTo({ ...spot });
    setMessage(note);
  }

  // Jump to the typed address (OpenStreetMap's free address search). The customer still checks the pin.
  async function findAddress() {
    if (!addressText.trim()) {
      setMessage("Type your address above first.");
      return;
    }
    setBusy("searching");
    setMessage("");
    try {
      const query = new URLSearchParams({ format: "json", limit: "1", countrycodes: "ph", q: addressText });
      const response = await fetch(`https://nominatim.openstreetmap.org/search?${query}`);
      const [match] = response.ok ? await response.json() : [];
      if (match) {
        placePin(
          { lat: Number(match.lat), lng: Number(match.lon) },
          "Moved the pin near your address. Drag it onto your exact house or building."
        );
      } else {
        setMessage("Couldn't find that address on the map. Tap the map where your house is instead.");
      }
    } catch {
      setMessage("The map search isn't responding. Tap the map where your house is instead.");
    } finally {
      setBusy("");
    }
  }

  function useMyLocation() {
    if (!navigator.geolocation) {
      setMessage("Your browser can't share your location. Tap the map instead.");
      return;
    }
    setBusy("locating");
    setMessage("");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setBusy("");
        placePin(
          { lat: position.coords.latitude, lng: position.coords.longitude },
          "Pinned where you are now. Move it if you're not at the delivery address."
        );
      },
      () => {
        setBusy("");
        setMessage("Couldn't get your location (maybe it was blocked). Tap the map instead.");
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={findAddress} disabled={busy !== ""} className="btn-secondary btn-small">
          {busy === "searching" ? "Finding…" : "Find my address on the map"}
        </button>
        <button type="button" onClick={useMyLocation} disabled={busy !== ""} className="btn-quiet btn-small">
          {busy === "locating" ? "Locating…" : "Use my current location"}
        </button>
      </div>

      {/* "isolate" keeps the map's layers from floating over the page header */}
      <div className="relative isolate mt-3 h-72 overflow-hidden rounded-xl border border-line">
        <MapContainer
          center={[initialCenter.lat, initialCenter.lng]}
          zoom={value ? 17 : 13}
          scrollWheelZoom={false}
          className="h-full w-full"
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <TapToPin onPick={(spot) => { onChange(spot); setMessage(""); }} />
          <FlyTo target={flyTo} />
          {value && (
            <Marker
              position={[value.lat, value.lng]}
              icon={pinIcon}
              draggable
              keyboard={false}
              eventHandlers={{
                dragend: (event) => {
                  const spot = event.target.getLatLng();
                  onChange({ lat: spot.lat, lng: spot.lng });
                  setMessage("");
                },
              }}
            />
          )}
        </MapContainer>
        {!value && (
          <p className="pointer-events-none absolute inset-x-0 top-3 z-[1000] mx-auto w-fit rounded-full bg-ink/85 px-4 py-1.5 text-xs font-semibold text-cream">
            Tap the map where your house is
          </p>
        )}
      </div>

      <p aria-live="polite" className="mt-2 text-xs text-muted">
        {message || (value ? "Pin set. Drag it if it isn't exactly on your door." : "")}
      </p>
    </div>
  );
}

function TapToPin({ onPick }) {
  useMapEvents({
    click: (event) => onPick({ lat: event.latlng.lat, lng: event.latlng.lng }),
  });
  return null;
}

function FlyTo({ target }) {
  const map = useMap();
  useEffect(() => {
    if (target) map.flyTo([target.lat, target.lng], 17, { duration: 0.8 });
  }, [map, target]);
  return null;
}
