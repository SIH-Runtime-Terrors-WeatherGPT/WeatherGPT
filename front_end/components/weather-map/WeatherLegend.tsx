'use client';

import React from 'react';

export type MapLayerType = 'rain' | 'temperature' | 'wind' | 'clouds' | 'pressure';

interface WeatherLegendProps {
  activeLayer: MapLayerType;
}

export function WeatherLegend({ activeLayer }: WeatherLegendProps) {
  const getLegendContent = () => {
    switch (activeLayer) {
      case 'rain':
        return {
          title: 'Rain / Precipitation Intensity',
          minLabel: 'Light (0.1 mm/h)',
          maxLabel: 'Extreme (50+ mm/h)',
          gradient: 'from-sky-300 via-blue-500 via-emerald-400 via-yellow-400 to-red-600',
          ticks: ['Light', 'Moderate', 'Heavy', 'Extreme'],
        };
      case 'temperature':
        return {
          title: 'Temperature (°C)',
          minLabel: '-20°C (Freezing)',
          maxLabel: '45°C (Extreme Heat)',
          gradient: 'from-blue-600 via-cyan-400 via-emerald-400 via-yellow-400 to-red-600',
          ticks: ['-20°C', '0°C', '15°C', '30°C', '45°C'],
        };
      case 'wind':
        return {
          title: 'Wind Speed (km/h)',
          minLabel: 'Calm (0 km/h)',
          maxLabel: 'Gale (100+ km/h)',
          gradient: 'from-cyan-300 via-teal-400 via-yellow-400 via-orange-500 to-rose-600',
          ticks: ['Calm', 'Breeze', 'Moderate', 'Gale'],
        };
      case 'clouds':
        return {
          title: 'Cloud Coverage (%)',
          minLabel: 'Clear (0%)',
          maxLabel: 'Overcast (100%)',
          gradient: 'from-slate-800/40 via-slate-500/60 to-slate-200/90',
          ticks: ['Clear', 'Partly', 'Mostly', 'Overcast'],
        };
      case 'pressure':
        return {
          title: 'Atmospheric Pressure (hPa)',
          minLabel: 'Low (950 hPa)',
          maxLabel: 'High (1050 hPa)',
          gradient: 'from-purple-600 via-blue-500 via-emerald-400 via-amber-400 to-red-500',
          ticks: ['950 hPa', '980 hPa', '1013 hPa', '1050 hPa'],
        };
      default:
        return null;
    }
  };

  const legend = getLegendContent();
  if (!legend) return null;

  return (
    <div className="absolute bottom-4 left-4 z-[1000] p-3 rounded-2xl bg-slate-950/85 backdrop-blur-md border border-white/15 shadow-2xl text-slate-100 max-w-xs text-xs pointer-events-auto">
      <div className="flex justify-between items-center mb-1.5 font-semibold text-slate-200">
        <span>{legend.title}</span>
      </div>
      
      {/* Color Bar Gradient */}
      <div className={`h-3 w-full rounded-md bg-gradient-to-r ${legend.gradient} shadow-inner border border-white/10`} />

      {/* Legend Labels */}
      <div className="flex justify-between items-center mt-1 text-[10px] text-slate-400 font-mono">
        <span>{legend.minLabel}</span>
        <span>{legend.maxLabel}</span>
      </div>
    </div>
  );
}
