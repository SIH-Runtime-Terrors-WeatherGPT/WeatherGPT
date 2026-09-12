'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiClient } from '@/lib/api';
import { WeatherData, ForecastDay } from '@/types/api';

export function useWeather(defaultCity = 'Mumbai') {
  const [city, setCity] = useState(defaultCity);
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [forecast, setForecast] = useState<ForecastDay[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchWeatherData = useCallback(async (targetCity: string) => {
    setLoading(true);
    setError(null);
    try {
      const [currentRes, forecastRes] = await Promise.all([
        apiClient<WeatherData>(`/api/v1/weather/current?city=${encodeURIComponent(targetCity)}`), //
        apiClient<{ city: string; forecast: ForecastDay[] }>(`/api/v1/weather/forecast?city=${encodeURIComponent(targetCity)}`), //
      ]);

      setWeather(currentRes.data);
      setForecast(forecastRes.data.forecast);
      setCity(targetCity);
    } catch (err: any) {
      setError(err.message || 'Failed to retrieve weather data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchWeatherData(defaultCity);
  }, [fetchWeatherData, defaultCity]);

  return { city, weather, forecast, loading, error, refetch: fetchWeatherData };
}