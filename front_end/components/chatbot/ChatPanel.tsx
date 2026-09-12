'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Send, Bot, Sparkles, RefreshCw, MapPin } from 'lucide-react';
import { ChatMessage } from '@/types/api';
import { MapLayerType } from '../weather-map/WeatherLegend';

interface LocationContextData {
  name: string;
  lat: number;
  lon: number;
  country?: string;
  temp?: number;
  condition?: string;
  humidity?: number;
  suggestedLayer?: MapLayerType;
}

interface ChatPanelProps {
  messages: ChatMessage[];
  sending: boolean;
  onSendMessage: (msg: string) => void;
  onLocationUpdate?: (loc: LocationContextData) => void;
}

export function ChatPanel({
  messages,
  sending,
  onSendMessage,
  onLocationUpdate,
}: ChatPanelProps) {
  const [inputMsg, setInputMsg] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, sending]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputMsg.trim() || sending) return;
    onSendMessage(inputMsg.trim());
    setInputMsg('');
  };

  const samplePrompts = [
    '🌧️ Will it rain in Ahmedabad tomorrow?',
    '🌡️ How hot will Delhi be tomorrow afternoon?',
    '🏏 Suitable for cricket in Surat tomorrow?',
    '🎡 Good weather for amusement park in London?',
  ];

  return (
    <div className="flex flex-col h-full rounded-3xl backdrop-blur-xl bg-slate-900/80 border border-white/15 shadow-2xl overflow-hidden text-slate-100">
      
      {/* Header */}
      {/* <div className="p-4 border-b border-white/10 flex items-center justify-between bg-white/[0.03]">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8">
            <img src="/logo.png" alt="WeatherGPT Logo" className="w-full h-full object-cover" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-sm text-slate-100">WeatherGPT</h3>
              <span className="flex h-2 w-2 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
              </span>
            </div>
            <p className="text-[10px] text-slate-400">Conversational Meteorological Intelligence</p>
          </div>
        </div>

      </div> */}

      {/* Message Stream */}
      <div className="flex-1 p-4 overflow-y-auto space-y-4">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center text-slate-400 px-4 my-auto">
            <Sparkles className="w-8 h-8 text-cyan-400 mb-3 animate-pulse" />
            <h4 className="font-bold text-sm text-slate-200">Ask WeatherGPT Anything</h4>
            <p className="text-xs text-slate-400 mt-1 max-w-xs">
              Natural-language forecasts, rain probabilities, wind advisories, and outdoor activity planning.
            </p>

            <div className="mt-4 flex flex-col gap-2 w-full max-w-xs">
              {samplePrompts.map((prompt, idx) => (
                <button
                  key={idx}
                  onClick={() => onSendMessage(prompt.replace(/^[^\s]+\s/, ''))}
                  className="p-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-left text-xs text-cyan-300 border border-white/5 transition"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((msg, index) => (
            <div
              key={index}
              className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
            >
              <div
                className={`max-w-[88%] rounded-2xl p-3.5 text-xs leading-relaxed ${
                  msg.role === 'user'
                    ? 'bg-gradient-to-r from-blue-600 to-cyan-600 text-white rounded-tr-none shadow-md'
                    : 'bg-slate-800/80 text-slate-200 border border-white/10 rounded-tl-none shadow-lg'
                }`}
              >
                {msg.content}
              </div>

              {msg.locationContext && (
                <div className="flex items-center gap-1.5 text-[10px] text-cyan-400 mt-1 px-1">
                  <MapPin className="w-3 h-3" />
                  <span>
                    {msg.locationContext.city} ({msg.locationContext.temp}°C, {msg.locationContext.condition})
                  </span>
                </div>
              )}
            </div>
          ))
        )}

        {sending && (
          <div className="flex items-center gap-2 p-3 rounded-2xl bg-slate-800/50 border border-white/5 max-w-[70%]">
            <span className="text-xs text-slate-400">WeatherGPT analyzing weather facts...</span>
            <div className="flex gap-1">
              <span className="h-1.5 w-1.5 bg-cyan-400 rounded-full animate-bounce" />
              <span className="h-1.5 w-1.5 bg-cyan-400 rounded-full animate-bounce [animation-delay:0.2s]" />
              <span className="h-1.5 w-1.5 bg-cyan-400 rounded-full animate-bounce [animation-delay:0.4s]" />
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Box */}
      <form onSubmit={handleSubmit} className="p-3 border-t border-white/10 flex gap-2 bg-slate-950/60">
        <input
          type="text"
          placeholder="Ask about weather, rain, temperature, or activities..."
          value={inputMsg}
          onChange={(e) => setInputMsg(e.target.value)}
          className="flex-1 px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-xs text-slate-100 placeholder-slate-400 focus:outline-none focus:border-cyan-400 transition"
        />
        <button
          type="submit"
          disabled={sending || !inputMsg.trim()}
          className="px-4 py-2.5 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold rounded-xl text-xs transition disabled:opacity-50 flex items-center justify-center"
        >
          <Send className="w-3.5 h-3.5" />
        </button>
      </form>
    </div>
  );
}
