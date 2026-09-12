'use client';

import dynamic from 'next/dynamic';
import React from 'react';
import { MapLayerType } from './WeatherLegend';
import { LocationMarkerData } from './WeatherMapInner';

interface WeatherMapProps {
  center?: [number, number];
  zoom?: number;
  activeLayer?: MapLayerType;
  selectedMarker?: LocationMarkerData | null;
  onMarkerSelect?: (marker: LocationMarkerData) => void;
}

const DynamicWeatherMapInner = dynamic(() => import('./WeatherMapInner'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full min-h-[450px] rounded-3xl bg-slate-900/60 border border-white/10 flex flex-col items-center justify-center text-slate-400 gap-3">
      <div className="w-8 h-8 rounded-full border-2 border-cyan-400 border-t-transparent animate-spin" />
      <span className="text-xs font-medium text-slate-300">Loading Weather Satellite Map...</span>
    </div>
  ),
});

export function WeatherMap(props: WeatherMapProps) {
  return <DynamicWeatherMapInner {...props} />;
}
