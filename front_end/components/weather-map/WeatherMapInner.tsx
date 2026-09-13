'use client';

import React, { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { MapLayerType, WeatherLegend } from './WeatherLegend';
import { WeatherLayerControl } from './WeatherLayerControl';
import { Search, Navigation, Layers, X } from 'lucide-react';

// Fix default Leaflet icon paths in React / Next.js
const defaultIcon = L.icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});
L.Marker.prototype.options.icon = defaultIcon;

// OpenWeather tile layer code mapping
const OPENWEATHER_LAYER_MAP: Record<MapLayerType, string> = {
  rain: 'precipitation_new',
  temperature: 'temp_new',
  wind: 'wind_new',
  clouds: 'clouds_new',
  pressure: 'pressure_new',
};

const OPENWEATHER_API_KEY =
  process.env.NEXT_PUBLIC_OPENWEATHER_API_KEY || 'b1b15e88fa797225412429c1c50c122a';

export interface LocationMarkerData {
  lat: number;
  lon: number;
  name: string;
  country?: string;
  temp?: number;
  condition?: string;
  humidity?: number;
  windSpeed?: number;
}

interface WeatherMapInnerProps {
  center?: [number, number];
  zoom?: number;
  activeLayer?: MapLayerType;
  selectedMarker?: LocationMarkerData | null;
  onMarkerSelect?: (marker: LocationMarkerData) => void;
}

/** Helper component to fly/pan map when center prop changes */
function MapCenterController({ center, zoom }: { center: [number, number]; zoom: number }) {
  const map = useMap();
  useEffect(() => {
    map.flyTo(center, zoom, { duration: 1.5 });
  }, [center, zoom, map]);
  return null;
}

/** Helper component to capture map click events */
function MapClickHandler({ onMapClick }: { onMapClick: (lat: number, lon: number) => void }) {
  useMapEvents({
    click(e) {
      onMapClick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

export default function WeatherMapInner({
  center = [23.0225, 72.5714], // Default Ahmedabad
  zoom = 6,
  activeLayer: externalActiveLayer = 'rain',
  selectedMarker = null,
  onMarkerSelect,
}: WeatherMapInnerProps) {
  const [activeLayer, setActiveLayer] = useState<MapLayerType>(externalActiveLayer);
  const [mapCenter, setMapCenter] = useState<[number, number]>(center);
  const [mapZoom, setMapZoom] = useState<number>(zoom);
  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [marker, setMarker] = useState<LocationMarkerData | null>(selectedMarker);

  useEffect(() => {
    setActiveLayer(externalActiveLayer);
  }, [externalActiveLayer]);

  useEffect(() => {
    if (center) {
      setMapCenter(center);
    }
  }, [center]);

  useEffect(() => {
    if (selectedMarker) {
      setMarker(selectedMarker);
      setMapCenter([selectedMarker.lat, selectedMarker.lon]);
    }
  }, [selectedMarker]);

  // Handle map click to place pointer and fetch weather summary
  const handleMapClick = async (lat: number, lon: number) => {
    try {
      const res = await fetch(
        `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&units=metric&appid=${OPENWEATHER_API_KEY}`,
      );
      const data = await res.json();

      let locationName = data.name || `${lat.toFixed(2)}°, ${lon.toFixed(2)}°`;
      if (data.sys?.country && !locationName.includes(data.sys.country)) {
        locationName = `${locationName}, ${data.sys.country}`;
      }

      const newMarker: LocationMarkerData = {
        lat,
        lon,
        name: locationName,
        country: data.sys?.country,
        temp: data.main?.temp !== undefined ? Math.round(data.main.temp * 10) / 10 : undefined,
        condition: data.weather?.[0]?.description,
        humidity: data.main?.humidity,
        windSpeed: data.wind?.speed ? Math.round(data.wind.speed * 10) / 10 : undefined,
      };

      setMarker(newMarker);
      setMapCenter([lat, lon]);
      if (onMarkerSelect) {
        onMarkerSelect(newMarker);
      }
    } catch (err) {
      console.error('Error fetching weather summary for map click', err);
    }
  };

  // Handle city search directly on the map
  const handleSearchSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    setSearching(true);
    try {
      const res = await fetch(
        `https://api.openweathermap.org/geo/1.0/direct?q=${encodeURIComponent(
          searchQuery.trim(),
        )}&limit=1&appid=${OPENWEATHER_API_KEY}`,
      );
      const data = await res.json();

      if (Array.isArray(data) && data.length > 0) {
        const found = data[0];
        const newMarker: LocationMarkerData = {
          lat: found.lat,
          lon: found.lon,
          name: found.name,
          country: found.country,
        };
        setMarker(newMarker);
        setMapCenter([found.lat, found.lon]);
        setMapZoom(10);
        if (onMarkerSelect) onMarkerSelect(newMarker);
      }
    } catch {
      // Fallback geocode using OpenStreetMap Nominatim
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
            searchQuery.trim(),
          )}`,
        );
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          const found = data[0];
          const lat = parseFloat(found.lat);
          const lon = parseFloat(found.lon);
          const newMarker: LocationMarkerData = {
            lat,
            lon,
            name: found.display_name.split(',')[0],
          };
          setMarker(newMarker);
          setMapCenter([lat, lon]);
          setMapZoom(10);
          if (onMarkerSelect) onMarkerSelect(newMarker);
        }
      } catch (err) {
        console.error('Map search failed', err);
      }
    } finally {
      setSearching(false);
      setSearchQuery('');
    }
  };

  // Browser Geolocation center
  const handleCurrentLocation = () => {
    if (typeof window !== 'undefined' && 'geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const lat = pos.coords.latitude;
          const lon = pos.coords.longitude;
          handleMapClick(lat, lon);
        },
        (err) => console.warn('Geolocation denied or error', err),
      );
    }
  };

  const currentTileLayerCode = OPENWEATHER_LAYER_MAP[activeLayer];
  const tileUrl = `https://tile.openweathermap.org/map/${currentTileLayerCode}/{z}/{x}/{y}.png?appid=${OPENWEATHER_API_KEY}`;

  return (
    <div className="relative w-full h-full min-h-[450px] rounded-3xl overflow-hidden shadow-2xl border border-white/10 bg-slate-950">
      
      {/* Floating Top Search & Location Control */}
      <div className="absolute top-4 left-4 z-[1000] flex items-center gap-2 pointer-events-auto">
        <form onSubmit={handleSearchSubmit} className="relative flex items-center">
          <input
            type="text"
            placeholder="Search map location..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 pr-4 py-2 text-xs rounded-2xl bg-slate-950/85 backdrop-blur-md border border-white/15 text-slate-100 placeholder-slate-400 focus:outline-none focus:border-cyan-400 w-48 sm:w-64 shadow-xl transition-all"
          />
          <Search className="w-4 h-4 text-slate-400 absolute left-3 pointer-events-none" />
        </form>

        <button
          onClick={handleCurrentLocation}
          title="Locate Me"
          className="p-2.5 rounded-2xl bg-slate-950/85 backdrop-blur-md border border-white/15 text-cyan-400 hover:text-cyan-300 hover:bg-white/10 shadow-xl transition"
        >
          <Navigation className="w-4 h-4" />
        </button>
      </div>

      {/* Floating Layer Switcher Control */}
      <WeatherLayerControl activeLayer={activeLayer} onSelectLayer={setActiveLayer} />

      {/* Floating Dynamic Legend */}
      <WeatherLegend activeLayer={activeLayer} />

      {/* Map Container */}
      <MapContainer
        center={mapCenter}
        zoom={mapZoom}
        scrollWheelZoom={true}
        className="w-full h-full z-0 cursor-pointer"
        style={{ height: '100%', width: '100%' }}
      >
        <MapCenterController center={mapCenter} zoom={mapZoom} />
        <MapClickHandler onMapClick={handleMapClick} />

        {/* Base OpenStreetMap Tiles */}
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {/* OpenWeather Overlay Layer */}
        <TileLayer
          key={activeLayer}
          url={tileUrl}
          opacity={0.65}
          attribution='&copy; <a href="https://openweathermap.org/">OpenWeather</a>'
        />

        {/* Interactive Location Marker & Weather Summary Popup */}
        {marker && (
          <Marker position={[marker.lat, marker.lon]} ref={(r) => { r?.openPopup(); }}>
            <Popup className="custom-weather-popup" autoPan={true} closeButton={false}>
              <div
                className="p-3 min-w-[190px] bg-slate-950 text-slate-100 rounded-2xl font-sans"
                onClick={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
                onDoubleClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between border-b border-white/10 pb-2 mb-2 gap-2">
                  <div className="flex items-center gap-1.5 min-w-0 pr-1">
                    <h4 className="font-bold text-xs text-cyan-300 truncate max-w-[120px]" title={marker.name}>
                      {marker.name}
                    </h4>
                    {marker.country && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-white/10 text-slate-300 uppercase font-mono shrink-0">
                        {marker.country}
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      setMarker(null);
                    }}
                    onMouseDown={(e) => {
                      e.stopPropagation();
                    }}
                    onPointerDown={(e) => {
                      e.stopPropagation();
                    }}
                    className="text-slate-400 hover:text-white p-0.5 rounded-md hover:bg-white/10 transition-colors shrink-0 flex items-center justify-center cursor-pointer"
                    title="Close popup"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="space-y-1.5 text-xs">
                  {marker.temp !== undefined && (
                    <div className="flex items-center justify-between text-slate-200">
                      <span className="text-slate-400 text-[11px]">Temperature:</span>
                      <span className="font-bold text-amber-400">{marker.temp}°C</span>
                    </div>
                  )}
                  {marker.condition && (
                    <div className="flex items-center justify-between text-slate-200">
                      <span className="text-slate-400 text-[11px]">Condition:</span>
                      <span className="capitalize text-emerald-300 font-medium text-[11px] truncate max-w-[100px]">
                        {marker.condition}
                      </span>
                    </div>
                  )}
                  {marker.humidity !== undefined && (
                    <div className="flex items-center justify-between text-slate-200">
                      <span className="text-slate-400 text-[11px]">Humidity:</span>
                      <span className="font-semibold text-cyan-400">{marker.humidity}%</span>
                    </div>
                  )}
                  {marker.windSpeed !== undefined && (
                    <div className="flex items-center justify-between text-slate-200">
                      <span className="text-slate-400 text-[11px]">Wind Speed:</span>
                      <span className="font-semibold text-slate-300">{marker.windSpeed} m/s</span>
                    </div>
                  )}
                </div>
              </div>
            </Popup>
          </Marker>
        )}
      </MapContainer>
    </div>
  );
}
