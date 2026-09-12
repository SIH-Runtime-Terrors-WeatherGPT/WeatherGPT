'use client';

import { useState } from 'react';
import { useWeather } from '@/hooks/useWeather';
import { useChat } from '@/hooks/useChat';

export default function DashboardPage() {
  const [searchCity, setSearchCity] = useState('');
  const { city, weather, forecast, loading, error, refetch } = useWeather('Mumbai'); //[cite: 1]
  const { messages, sending, sendMessage } = useChat();
  const [inputMsg, setInputMsg] = useState('');

  const handleCitySearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchCity.trim()) {
      refetch(searchCity.trim());
      setSearchCity('');
    }
  };

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputMsg.trim()) {
      sendMessage(inputMsg);
      setInputMsg('');
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 md:p-8 flex flex-col gap-6 relative overflow-hidden">
      {/* Background Ambience */}
      <div className="absolute top-10 left-1/3 w-96 h-96 bg-blue-500/10 rounded-full blur-[140px] pointer-events-none" />

      {/* Top Header & Search Bar */}
      <header className="flex flex-col md:flex-row justify-between items-center gap-4 z-10">
        <div>
          <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-400 to-cyan-300 bg-clip-text text-transparent">
            WeatherGPT Intelligence
          </h1>
          <p className="text-xs text-slate-400">Live Satellite & Meteorological Ground Data</p>
        </div>

        <form onSubmit={handleCitySearch} className="flex gap-2 w-full md:w-auto">
          <input
            type="text"
            placeholder="Search city (e.g., Delhi, London)..."
            value={searchCity}
            onChange={(e) => setSearchCity(e.target.value)}
            className="px-4 py-2 rounded-xl bg-slate-900/70 border border-white/10 text-sm focus:border-cyan-400 focus:outline-none w-full md:w-64"
          />
          <button
            type="submit"
            className="px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-600 text-slate-950 font-semibold text-sm transition"
          >
            Locate
          </button>
        </form>
      </header>

      {error && (
        <div className="p-3 bg-red-500/20 border border-red-500/30 text-red-300 text-sm rounded-xl">
          {error}
        </div>
      )}

      {/* Main Grid: Weather Telemetry on the left, Conversational AI on the right */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 z-10">
        
        {/* Left Section: Live Weather & Forecast (7 Cols) */}
        <section className="lg:col-span-7 flex flex-col gap-6">
          
          {/* Main Hero Card */}
          <div className="p-6 rounded-3xl backdrop-blur-xl bg-slate-900/60 border border-white/10 relative overflow-hidden shadow-2xl">
            <div className="flex justify-between items-start">
              <div>
                <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                  {weather?.city || city}, {weather?.country || 'IN'} {/*[cite: 1] */}
                </span>
                <h2 className="text-6xl font-black mt-3 tracking-tighter">
                  {loading ? '--' : !weather ? '--' : `${weather.current.temp}°C`} {/*[cite: 1] */}
                </h2>
                <p className="text-sm text-slate-300 mt-1 capitalize">
                  {loading || !weather ? 'Data unavailable' : `${weather.current.condition} • Feels like ${weather.current.feelsLike}°C`} {/*[cite: 1] */}
                </p>
              </div>

              <div className="text-right">
                <span className="text-xs text-slate-400 block">Air Quality Index</span>
                <span className="text-xl font-bold text-emerald-400">
                  {loading || !weather ? '--' : `${weather.current.airQuality.aqi} (${weather.current.airQuality.status})`} {/*[cite: 1] */}
                </span>
              </div>
            </div>

            {/* Quick Stats Strip */}
            <div className="grid grid-cols-3 gap-3 mt-6 pt-4 border-t border-white/10 text-center">
              <div className="p-2 rounded-xl bg-white/5">
                <span className="text-xs text-slate-400 block">Humidity</span>
                <span className="text-sm font-semibold">{loading || !weather ? '--' : `${weather.current.humidity}%`}</span> {/*[cite: 1] */}
              </div>
              <div className="p-2 rounded-xl bg-white/5">
                <span className="text-xs text-slate-400 block">Wind Speed</span>
                <span className="text-sm font-semibold">{loading || !weather ? '--' : `${weather.current.windSpeed} km/h`}</span> {/*[cite: 1] */}
              </div>
              <div className="p-2 rounded-xl bg-white/5">
                <span className="text-xs text-slate-400 block">UV Index</span>
                <span className="text-sm font-semibold">{loading || !weather ? '--' : `${weather.current.uvIndex} / 10`}</span> {/*[cite: 1] */}
              </div>
            </div>
          </div>

          {/* 5-Day Forecast Rail */}
          <div className="p-6 rounded-3xl backdrop-blur-xl bg-slate-900/60 border border-white/10">
            <h3 className="text-sm font-bold text-slate-300 uppercase tracking-wider mb-4">5-Day Outlook</h3> {/*[cite: 1] */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              {forecast.slice(0, 5).map((f, i) => (
                <div key={i} className="p-3 rounded-2xl bg-white/5 border border-white/5 flex flex-col items-center text-center">
                  <span className="text-xs text-slate-400 font-medium">{f.day.slice(0, 3)}</span> {/*[cite: 1] */}
                  <span className="text-sm font-bold mt-1">{f.tempMax}°</span> {/*[cite: 1] */}
                  <span className="text-xs text-slate-500">{f.tempMin}°</span> {/*[cite: 1] */}
                  <span className="text-[10px] text-cyan-400 mt-2 truncate w-full">{f.condition}</span> {/*[cite: 1] */}
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Right Section: Conversational AI WeatherGPT Assistant (5 Cols) */}
        <section className="lg:col-span-5 flex flex-col h-[600px] rounded-3xl backdrop-blur-xl bg-slate-900/60 border border-white/10 shadow-2xl overflow-hidden">
          
          {/* Chat Header */}
          <div className="p-4 border-b border-white/10 flex items-center justify-between bg-white/[0.02]">
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-sm font-semibold">WeatherGPT Copilot</span>
            </div>
            <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-blue-500/20 text-blue-300">
              RAG Enabled
            </span>
          </div>

          {/* Message Stream */}
          <div className="flex-1 p-4 overflow-y-auto space-y-3">
            {messages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center text-slate-500 text-xs px-4">
                <p>Ask anything about conditions, agricultural impacts, travel advice, or rainfall projections.</p>
                <div className="mt-3 flex flex-wrap gap-2 justify-center">
                  <button
                    onClick={() => setInputMsg(`Will it rain in ${city} today?`)}
                    className="p-1.5 px-3 rounded-lg bg-white/5 hover:bg-white/10 text-[11px] text-cyan-300 border border-white/5"
                  >
                    🌧️ Rain in {city}?
                  </button>
                  <button
                    onClick={() => setInputMsg(`Should I carry an umbrella today?`)}
                    className="p-1.5 px-3 rounded-lg bg-white/5 hover:bg-white/10 text-[11px] text-cyan-300 border border-white/5"
                  >
                    ☂️ Carry umbrella?
                  </button>
                </div>
              </div>
            ) : (
              messages.map((msg, index) => (
                <div
                  key={index}
                  className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
                >
                  <div
                    className={`max-w-[85%] rounded-2xl p-3 text-xs leading-relaxed ${
                      msg.role === 'user'
                        ? 'bg-gradient-to-r from-blue-600 to-cyan-600 text-white rounded-tr-none'
                        : 'bg-white/10 text-slate-200 border border-white/10 rounded-tl-none'
                    }`}
                  >
                    {msg.content} {/*[cite: 1] */}
                  </div>
                  {msg.locationContext && (
                    <span className="text-[9px] text-cyan-400/80 mt-1">
                      Context: {msg.locationContext.city} ({msg.locationContext.temp}°C) {/*[cite: 1] */}
                    </span>
                  )}
                </div>
              ))
            )}
            {sending && (
              <div className="flex items-center gap-1 text-slate-400 text-xs">
                <span className="h-1.5 w-1.5 bg-cyan-400 rounded-full animate-bounce" />
                <span className="h-1.5 w-1.5 bg-cyan-400 rounded-full animate-bounce [animation-delay:0.2s]" />
                <span className="h-1.5 w-1.5 bg-cyan-400 rounded-full animate-bounce [animation-delay:0.4s]" />
              </div>
            )}
          </div>

          {/* Chat Input */}
          <form onSubmit={handleSend} className="p-3 border-t border-white/10 flex gap-2 bg-slate-950/40">
            <input
              type="text"
              placeholder="Ask WeatherGPT..."
              value={inputMsg}
              onChange={(e) => setInputMsg(e.target.value)}
              className="flex-1 px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-xs focus:outline-none focus:border-cyan-400"
            />
            <button
              type="submit"
              disabled={sending || !inputMsg.trim()}
              className="px-4 py-2 bg-cyan-500 text-slate-950 font-semibold rounded-xl text-xs hover:bg-cyan-400 transition disabled:opacity-50"
            >
              Send
            </button>
          </form>
        </section>

      </div>
    </div>
  );
}