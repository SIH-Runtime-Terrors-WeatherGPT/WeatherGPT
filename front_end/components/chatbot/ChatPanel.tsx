'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Send, Bot, Sparkles, RefreshCw, MapPin, Mic, MicOff, Volume2, VolumeX } from 'lucide-react';
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
  const [isListening, setIsListening] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(true);
  const [speakingMsgIndex, setSpeakingMsgIndex] = useState<number | null>(null);
  const recognitionRef = useRef<any>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, sending]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const SpeechRecognition =
        (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        const recognition = new SpeechRecognition();
        recognition.continuous = false;
        recognition.interimResults = true;
        recognition.lang = 'en-US';

        recognition.onresult = (event: any) => {
          let transcript = '';
          for (let i = event.resultIndex; i < event.results.length; i++) {
            transcript += event.results[i][0].transcript;
          }
          if (transcript) {
            setInputMsg(transcript);
          }
        };

        recognition.onend = () => {
          setIsListening(false);
        };

        recognition.onerror = (event: any) => {
          console.warn('Voice speech recognition error:', event.error);
          setIsListening(false);
        };

        recognitionRef.current = recognition;
      } else {
        setSpeechSupported(false);
      }
    }
  }, []);

  const toggleListening = () => {
    if (!recognitionRef.current) {
      alert('Speech recognition is not supported in this browser. Please use Google Chrome or Microsoft Edge.');
      return;
    }
    if (isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
    } else {
      try {
        recognitionRef.current.start();
        setIsListening(true);
      } catch (err) {
        console.error('Failed to start voice recognition:', err);
      }
    }
  };

  const handleSpeakMessage = (index: number, text: string) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;

    if (speakingMsgIndex === index) {
      window.speechSynthesis.cancel();
      setSpeakingMsgIndex(null);
      return;
    }

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    utterance.onend = () => setSpeakingMsgIndex(null);
    utterance.onerror = () => setSpeakingMsgIndex(null);

    setSpeakingMsgIndex(index);
    window.speechSynthesis.speak(utterance);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputMsg.trim() || sending) return;
    if (isListening && recognitionRef.current) {
      recognitionRef.current.stop();
      setIsListening(false);
    }
    onSendMessage(inputMsg.trim());
    setInputMsg('');
  };

  const samplePrompts = [
    '🌧️ Will it rain in Ahmedabad tomorrow?',
    '🌡️ How hot will Delhi be tomorrow afternoon?',
    '🎡 Good weather for amusement park in London?',
  ];

  return (
    <div className="flex flex-col h-full rounded-3xl backdrop-blur-xl bg-slate-900/80 border border-white/15 shadow-2xl overflow-hidden text-slate-100">
      
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
                className={`max-w-[88%] rounded-2xl p-3.5 text-xs leading-relaxed relative group ${
                  msg.role === 'user'
                    ? 'bg-gradient-to-r from-blue-600 to-cyan-600 text-white rounded-tr-none shadow-md'
                    : 'bg-slate-800/80 text-slate-200 border border-white/10 rounded-tl-none shadow-lg'
                }`}
              >
                {msg.content}

                {msg.role === 'assistant' && (
                  <button
                    onClick={() => handleSpeakMessage(index, msg.content)}
                    title={speakingMsgIndex === index ? 'Stop reading' : 'Read forecast aloud'}
                    className="ml-2 inline-flex items-center justify-center p-1 rounded-lg hover:bg-white/10 text-cyan-400 transition"
                  >
                    {speakingMsgIndex === index ? (
                      <VolumeX className="w-3.5 h-3.5 animate-pulse text-amber-400" />
                    ) : (
                      <Volume2 className="w-3.5 h-3.5 opacity-70 hover:opacity-100" />
                    )}
                  </button>
                )}
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

      {/* Input Box with Voice Prompt & Send */}
      <form onSubmit={handleSubmit} className="p-3 border-t border-white/10 flex gap-2 bg-slate-950/60 items-center">
        <input
          type="text"
          placeholder={isListening ? 'Listening to your voice prompt...' : 'Ask about weather, rain, temperature, or activities...'}
          value={inputMsg}
          onChange={(e) => setInputMsg(e.target.value)}
          className={`flex-1 px-4 py-2.5 rounded-xl border text-xs text-slate-100 placeholder-slate-400 focus:outline-none transition ${
            isListening
              ? 'bg-red-500/10 border-red-500/50 text-red-200 placeholder-red-400 animate-pulse ring-2 ring-red-500/30'
              : 'bg-white/5 border-white/10 focus:border-cyan-400'
          }`}
        />

        {/* Voice Input Microphone Button */}
        <button
          type="button"
          onClick={toggleListening}
          title={isListening ? 'Stop listening' : 'Speak your query (Voice Prompt)'}
          className={`px-3 py-2.5 rounded-xl text-xs transition flex items-center justify-center ${
            isListening
              ? 'bg-red-500 hover:bg-red-600 text-white animate-bounce shadow-lg shadow-red-500/30'
              : 'bg-white/10 hover:bg-white/20 text-slate-300 hover:text-cyan-400 border border-white/10'
          }`}
        >
          {isListening ? (
            <MicOff className="w-4 h-4 animate-spin" />
          ) : (
            <Mic className="w-4 h-4" />
          )}
        </button>

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
