'use client';

import { useState, useEffect } from 'react';
import { useChat } from '@/hooks/useChat';
import { WeatherMap } from '@/components/weather-map/WeatherMap';
import { MapLayerType } from '@/components/weather-map/WeatherLegend';
import { LocationMarkerData } from '@/components/weather-map/WeatherMapInner';
import { ChatPanel } from '@/components/chatbot/ChatPanel';
import { CloudSun, User, LogOut, Compass } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import Link from 'next/link';

export default function DashboardPage() {
  const { user, loading } = useAuth();
  const { messages, sending, sendMessage, latestQueryResult } = useChat();
  const [mapCenter, setMapCenter] = useState<[number, number]>([23.0225, 72.5714]); // Ahmedabad default
  const [mapZoom, setMapZoom] = useState<number>(7);
  const [activeLayer, setActiveLayer] = useState<MapLayerType>('rain');
  const [marker, setMarker] = useState<LocationMarkerData | null>({
    lat: 23.0225,
    lon: 72.5714,
    name: 'Ahmedabad',
    country: 'IN',
    temp: 29,
    condition: 'Partly cloudy',
    humidity: 72,
  });

  // Sync Chat response to Map center, marker, and active layer
  useEffect(() => {
    if (!latestQueryResult) return;

    const { location, weather, intent } = latestQueryResult;

    if (location?.lat && location?.lon) {
      setMapCenter([location.lat, location.lon]);
      setMapZoom(9);

      setMarker({
        lat: location.lat,
        lon: location.lon,
        name: location.name || weather?.location || 'Target Location',
        country: location.country,
        temp: weather?.temperature,
        condition: weather?.condition,
        humidity: weather?.humidity,
        windSpeed: weather?.windSpeed,
      });

      // Auto-switch layer based on query intent or requested fields
      const reqFields = intent?.requested_data || [];
      const userPrompt = intent?.intent || '';

      if (reqFields.includes('temperature') || userPrompt.includes('heat') || userPrompt.includes('temp')) {
        setActiveLayer('temperature');
      } else if (reqFields.includes('wind_speed') || reqFields.includes('wind_direction')) {
        setActiveLayer('wind');
      } else if (reqFields.includes('cloud') || reqFields.includes('clouds')) {
        setActiveLayer('clouds');
      } else if (reqFields.includes('pressure')) {
        setActiveLayer('pressure');
      } else {
        setActiveLayer('rain');
      }
    }
  }, [latestQueryResult]);

  const handleLogout = () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('weathergpt_token');
      window.location.href = '/login';
    }
  };

  if (loading) {
    return (
      <div className="h-screen w-screen bg-slate-950 flex items-center justify-center text-slate-100 font-sans">
        <div className="flex flex-col items-center gap-3">
          <span className="h-6 w-6 rounded-full border-2 border-cyan-400 border-t-transparent animate-spin" />
          <span className="text-xs text-slate-400 font-mono">Authenticating session...</span>
        </div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="h-screen w-screen bg-slate-950 text-slate-100 flex flex-col overflow-hidden font-sans">

      {/* Top Navbar */}
      <header className="h-14 px-6 border-b border-white/10 flex items-center justify-between bg-slate-950/80 backdrop-blur-xl shrink-0 z-20">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 ">
            <img src="/logo.png" alt="Logo" className="mt-2 object-cover" />
          </div>
          <div>
            <div className="relative w-60 h-15 ms-18">
              <img src="/weatherGPT.png" alt="WeatherGPT Logo" className="w-full h-full" />
            </div>
            <p className="text-[10px] text-slate-400 hidden sm:block">
              A CLEARER CONVERSATION
              WITH THE ATMOSPHERE
            </p>
          </div>
        </div>

        {/* User Actions */}
        <div className="flex items-center gap-3">
          <div className="hidden md:flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-xs text-slate-300">
            <Compass className="w-3.5 h-3.5 text-cyan-400" />
            <span>Interactive Weather GIS</span>
          </div>

          <button
            onClick={handleLogout}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 text-xs transition"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Logout</span>
          </button>
        </div>
      </header>

      {/* Main 2-Panel Layout: MAP (68% width on Desktop) | CHAT (32% width on Desktop) */}
      <main className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-4 p-4 min-h-0 overflow-hidden relative">

        {/* Left Panel: Weather GIS Satellite Map (70% width on lg) */}
        <section className="lg:col-span-8 h-full min-h-[400px] rounded-3xl overflow-hidden relative shadow-2xl border border-white/10">
          <WeatherMap
            center={mapCenter}
            zoom={mapZoom}
            activeLayer={activeLayer}
            selectedMarker={marker}
            onMarkerSelect={(newMarker) => setMarker(newMarker)}
          />
        </section>

        {/* Right Panel: AI Conversational Chatbot (30% width on lg) */}
        <section className="lg:col-span-4 h-full min-h-[400px] overflow-hidden">
          <ChatPanel
            messages={messages}
            sending={sending}
            onSendMessage={(msg) =>
              sendMessage(
                msg,
                marker ? { name: marker.name, lat: marker.lat, lon: marker.lon } : undefined,
              )
            }
          />
        </section>

      </main>
    </div>
  );
}