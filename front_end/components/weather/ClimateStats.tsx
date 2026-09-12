'use client';

import { useState, useEffect } from 'react';
import { apiClient } from '@/lib/api';

interface ClimateData {
  city: string;
  country: string;
  climateStats: {
    historicalAvgTemp: number;
    anomaly: string;
    recordedExtremeHigh: number;
    recordedExtremeLow: number;
  };
  seasonalOutlook: string;
  carbonEmissionsTier: string;
}

export default function ClimateStats({ city }: { city: string }) {
  const [data, setData] = useState<ClimateData | null>(null);

  useEffect(() => {
    // Calls GET /api/v1/weather/climate?city=
    apiClient<ClimateData>(`/api/v1/weather/climate?city=${encodeURIComponent(city)}`)
      .then((res) => setData(res.data))
      .catch(() => setData(null));
  }, [city]);

  if (!data) return null;

  return (
    <div className="p-5 rounded-3xl backdrop-blur-xl bg-slate-900/60 border border-white/10 space-y-3">
      <div className="flex justify-between items-center">
        <h4 className="text-xs uppercase font-bold tracking-wider text-slate-400">Long-term Climate Trends</h4>
        <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
          {data.carbonEmissionsTier}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="p-2.5 rounded-xl bg-white/5">
          <span className="text-slate-400 block text-[10px]">30-Yr Norm / Anomaly</span>
          <span className="font-semibold text-cyan-300">{data.climateStats.historicalAvgTemp}°C ({data.climateStats.anomaly})</span>
        </div>
        <div className="p-2.5 rounded-xl bg-white/5">
          <span className="text-slate-400 block text-[10px]">Recorded Extremes</span>
          <span className="font-semibold text-rose-300">Min: {data.climateStats.recordedExtremeLow}°C | Max: {data.climateStats.recordedExtremeHigh}°C</span>
        </div>
      </div>
      <p className="text-xs text-slate-300 italic">"{data.seasonalOutlook}"</p>
    </div>
  );
}