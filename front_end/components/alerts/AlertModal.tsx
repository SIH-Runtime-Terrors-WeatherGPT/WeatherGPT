'use client';

import { useState } from 'react';
import { useAlerts, WeatherAlert } from '@/hooks/useAlerts';

interface AlertModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultCity: string;
}

export default function AlertModal({ isOpen, onClose, defaultCity }: AlertModalProps) {
  const { createAlert } = useAlerts();
  const [city, setCity] = useState(defaultCity);
  const [alertType, setAlertType] = useState<WeatherAlert['alertType']>('temperature_high');
  const [thresholdValue, setThresholdValue] = useState<number>(35);
  const [notificationMethod, setNotificationMethod] = useState<WeatherAlert['notificationMethod']>('app');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await createAlert({ city, alertType, thresholdValue: Number(thresholdValue), notificationMethod });
      onClose();
    } catch (err) {
      alert('Failed to subscribe alert');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-md">
      <div className="w-full max-w-md p-6 rounded-3xl backdrop-blur-2xl bg-slate-900/90 border border-white/10 shadow-2xl text-slate-100">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-bold bg-gradient-to-r from-blue-400 to-cyan-300 bg-clip-text text-transparent">
            Set Weather Alert Trigger
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white text-sm">✕</button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          <div>
            <label className="block text-slate-400 uppercase font-semibold mb-1">Target City</label>
            <input
              type="text"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              required
              className="w-full px-3 py-2 rounded-xl bg-white/5 border border-white/10 focus:border-cyan-400 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-slate-400 uppercase font-semibold mb-1">Condition Trigger</label>
            <select
              value={alertType}
              onChange={(e) => setAlertType(e.target.value as any)}
              className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-white/10 focus:border-cyan-400 focus:outline-none text-white"
            >
              <option value="temperature_high">High Temperature Alert</option>
              <option value="temperature_low">Low Temperature Alert</option>
              <option value="heavy_rain">Heavy Rain Alert</option>
              <option value="storm">Storm / Squall</option>
              <option value="uv_extreme">Extreme UV Index</option>
            </select>
          </div>

          <div>
            <label className="block text-slate-400 uppercase font-semibold mb-1">Threshold Value (°C / Index)</label>
            <input
              type="number"
              value={thresholdValue}
              onChange={(e) => setThresholdValue(Number(e.target.value))}
              required
              className="w-full px-3 py-2 rounded-xl bg-white/5 border border-white/10 focus:border-cyan-400 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-slate-400 uppercase font-semibold mb-1">Delivery Channel</label>
            <select
              value={notificationMethod}
              onChange={(e) => setNotificationMethod(e.target.value as any)}
              className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-white/10 focus:border-cyan-400 focus:outline-none text-white"
            >
              <option value="app">Push Notification (In-App)</option>
              <option value="email">Email Notification</option>
              <option value="sms">SMS Text Alert</option>
            </select>
          </div>

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="w-1/2 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 transition font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-1/2 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold transition disabled:opacity-50"
            >
              {isSubmitting ? 'Saving...' : 'Activate Alert'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}