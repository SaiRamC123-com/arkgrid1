import { useEffect, useRef, useSyncExternalStore } from "react";
import L from "leaflet";
import { TileLayer, useMap, useMapEvents } from "react-leaflet";
import { Crosshair, Sun, Moon } from "lucide-react";
import toast from "react-hot-toast";

/* ---- map theme (light by default) ---- */
const THEME_KEY = "ark_map_theme";
const bus = new EventTarget();
const getTheme = () => localStorage.getItem(THEME_KEY) || "light";
const setTheme = (t) => { localStorage.setItem(THEME_KEY, t); bus.dispatchEvent(new Event("change")); };
const subscribe = (cb) => { bus.addEventListener("change", cb); return () => bus.removeEventListener("change", cb); };

const KEY = import.meta.env.VITE_MAP_KEY;
const ATTR = "&copy; MapTiler &copy; OpenStreetMap contributors";
const OSM = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const SOURCES = KEY
  ? {
      light: { url: `https://api.maptiler.com/maps/streets-v2/{z}/{x}/{y}.png?key=${KEY}`, attr: ATTR },
      dark: { url: `https://api.maptiler.com/maps/dataviz-dark/{z}/{x}/{y}.png?key=${KEY}`, attr: ATTR },
    }
  : {
      light: { url: OSM, attr: "&copy; OpenStreetMap contributors" },
      dark: { url: OSM, attr: "&copy; OpenStreetMap contributors", cls: "ark-dark-osm" },
    };

const btn = "flex h-10 w-10 items-center justify-center rounded-lg bg-white text-slate-700 shadow-lg transition hover:bg-slate-100";

// Tiles + the theme toggle + the locate-me button (kept under the old name so every map picks it up)
export function DarkTiles() {
  const map = useMap();
  const theme = useSyncExternalStore(subscribe, getTheme);
  const box = useRef(null);
  const src = SOURCES[theme] || SOURCES.light;

  useEffect(() => {
    if (!box.current) return;
    L.DomEvent.disableClickPropagation(box.current); // clicks on the buttons must not reach the map
    L.DomEvent.disableScrollPropagation(box.current);
  }, []);

  const locate = () => {
    if (!navigator.geolocation) return toast.error("Location is not supported on this device");
    navigator.geolocation.getCurrentPosition(
      (p) => map.flyTo([p.coords.latitude, p.coords.longitude], Math.max(map.getZoom(), 16)),
      () => toast.error("Could not get your location. Check the browser permission."),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  return (
    <>
      <TileLayer key={theme} url={src.url} attribution={src.attr} maxZoom={19} className={src.cls} />
      <div ref={box} className="absolute right-3 top-3 z-[1000] flex flex-col gap-2">
        <button onClick={locate} className={btn} title="Go to my location"><Crosshair size={20} color="#4285F4" /></button>
        <button onClick={() => setTheme(theme === "light" ? "dark" : "light")} className={btn} title="Switch map style">
          {theme === "light" ? <Moon size={18} /> : <Sun size={18} />}
        </button>
      </div>
    </>
  );
}

export function FitBounds({ points, fitKey }) {
  const map = useMap();
  useEffect(() => {
    if (!points.length) return;
    if (points.length === 1) map.setView(points[0], 15);
    else map.fitBounds(points, { padding: [50, 50], maxZoom: 16 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitKey]);
  return null;
}

export function ClickPicker({ onPick }) {
  useMapEvents({ click: (e) => onPick({ lat: e.latlng.lat, lng: e.latlng.lng }) });
  return null;
}

// Google-Maps-style blue dot with a white ring and a pulsing halo
export const youIcon = L.divIcon({
  className: "",
  html: `<div class="you-dot"><span class="you-pulse"></span><span class="you-core"></span></div>`,
  iconSize: [22, 22],
  iconAnchor: [11, 11],
});