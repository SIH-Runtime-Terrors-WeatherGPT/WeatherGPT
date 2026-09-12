'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiClient } from '@/lib/api';

export interface WeatherAlert {
  _id: string;
  city: string;
  alertType: 'temperature_high' | 'temperature_low' | 'heavy_rain' | 'storm' | 'uv_extreme';
  thresholdValue: number;
  isActive: boolean;
  notificationMethod: 'app' | 'email' | 'sms';
}

export function useAlerts() {
  const [alerts, setAlerts] = useState<WeatherAlert[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchAlerts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Calls GET /api/v1/alerts
      const res = await apiClient<{ alerts: WeatherAlert[] }>('/api/v1/alerts');
      setAlerts(res.data.alerts || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load active alerts');
    } finally {
      setLoading(false);
    }
  }, []);

  const createAlert = async (alertData: Omit<WeatherAlert, '_id' | 'isActive'>) => {
    // Calls POST /api/v1/alerts
    const res = await apiClient<{ alert: WeatherAlert }>('/api/v1/alerts', {
      method: 'POST',
      body: JSON.stringify(alertData),
    });
    setAlerts((prev) => [...prev, res.data.alert]);
    return res.data.alert;
  };

  const deleteAlert = async (alertId: string) => {
    // Calls DELETE /api/v1/alerts/:id
    await apiClient(`/api/v1/alerts/${alertId}`, { method: 'DELETE' });
    setAlerts((prev) => prev.filter((item) => item._id !== alertId));
  };

  useEffect(() => {
    fetchAlerts();
  }, [fetchAlerts]);

  return { alerts, loading, error, createAlert, deleteAlert, refetchAlerts: fetchAlerts };
}