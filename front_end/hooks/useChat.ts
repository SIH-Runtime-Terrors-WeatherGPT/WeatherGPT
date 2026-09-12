'use client';

import { useState } from 'react';
import { apiClient } from '@/lib/api';
import { ChatMessage } from '@/types/api';

export interface WeatherQueryResponse {
  answer: string;
  intent: {
    location?: string;
    country?: string;
    intent?: string;
    date?: string;
    time_period?: string;
    requested_data?: string[];
  };
  location: {
    name: string;
    country: string;
    lat: number;
    lon: number;
  };
  weather: {
    location: string;
    date: string;
    temperature: number;
    temperatureHigh?: number;
    temperatureLow?: number;
    rainProbability?: number;
    condition: string;
    windSpeed?: number;
    humidity?: number;
  };
  conversationId?: string;
}

export interface MapLocationContext {
  name?: string;
  lat?: number;
  lon?: number;
}

export function useChat() {
  const [conversationId, setConversationId] = useState<string | undefined>(undefined);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sending, setSending] = useState(false);
  const [latestQueryResult, setLatestQueryResult] = useState<WeatherQueryResponse | null>(null);

  const sendMessage = async (userPrompt: string, mapLocation?: MapLocationContext) => {
    if (!userPrompt.trim()) return;

    const optimisticMsg: ChatMessage = {
      role: 'user',
      content: userPrompt,
      timestamp: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimisticMsg]);
    setSending(true);

    try {
      const res = await apiClient<WeatherQueryResponse>('/weather/chat', {
        method: 'POST',
        body: JSON.stringify({ prompt: userPrompt, conversationId, mapLocation }),
      });

      const data = res.data;

      if (data?.conversationId) {
        setConversationId(data.conversationId);
      }

      setLatestQueryResult(data);

      const assistantMsg: ChatMessage = {
        role: 'assistant',
        content: data?.answer || 'Weather data retrieved successfully.',
        locationContext: data?.weather
          ? {
              city: data.location?.name || data.weather.location,
              country: data.location?.country || '',
              temp: data.weather.temperature,
              condition: data.weather.condition,
            }
          : undefined,
        timestamp: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err: any) {
      let errorMessage = err?.message || 'Failed to get a response from WeatherGPT. Please verify your connection.';
      if (errorMessage === 'Failed to fetch') {
        errorMessage = 'Failed To fetch';
      }
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: `⚠️ ${errorMessage}`,
          timestamp: new Date().toISOString(),
        },
      ]);
    } finally {
      setSending(false);
    }
  };

  return {
    messages,
    sending,
    sendMessage,
    conversationId,
    sessionId: conversationId,
    latestQueryResult,
  };
}