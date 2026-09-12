'use client';

import React from 'react';
import { CloudRain, Thermometer, Wind, Cloud, Gauge } from 'lucide-react';
import { MapLayerType } from './WeatherLegend';

interface WeatherLayerControlProps {
  activeLayer: MapLayerType;
  onSelectLayer: (layer: MapLayerType) => void;
}

export function WeatherLayerControl({ activeLayer, onSelectLayer }: WeatherLayerControlProps) {
  const layers: { id: MapLayerType; label: string; icon: React.ReactNode; color: string }[] = [
    { id: 'rain', label: 'Rain', icon: <CloudRain className="w-4 h-4" />, color: 'text-cyan-400' },
    { id: 'temperature', label: 'Temperature', icon: <Thermometer className="w-4 h-4" />, color: 'text-amber-400' },
    { id: 'wind', label: 'Wind', icon: <Wind className="w-4 h-4" />, color: 'text-teal-300' },
    { id: 'clouds', label: 'Clouds', icon: <Cloud className="w-4 h-4" />, color: 'text-slate-300' },
    { id: 'pressure', label: 'Pressure', icon: <Gauge className="w-4 h-4" />, color: 'text-purple-400' },
  ];

  return (
    <div className="absolute top-4 right-4 z-[1000] p-2 rounded-2xl bg-slate-950/85 backdrop-blur-md border border-white/15 shadow-2xl flex flex-col gap-1 pointer-events-auto">
      <span className="text-[10px] uppercase font-bold text-slate-400 px-2 py-1 tracking-wider border-b border-white/10 mb-1">
        Weather Layers
      </span>
      {layers.map((l) => {
        const isActive = activeLayer === l.id;
        return (
          <button
            key={l.id}
            onClick={() => onSelectLayer(l.id)}
            className={`flex items-center gap-2.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-all ${
              isActive
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm'
                : 'text-slate-300 hover:bg-white/10 hover:text-white border border-transparent'
            }`}
          >
            <span className={l.color}>{l.icon}</span>
            <span>{l.label}</span>
            <span
              className={`ml-auto w-2 h-2 rounded-full ${
                isActive ? 'bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.8)]' : 'bg-slate-600'
              }`}
            />
          </button>
        );
      })}
    </div>
  );
}
