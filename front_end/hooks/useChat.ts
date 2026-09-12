'use client';

import { useState } from 'react';
import { apiClient } from '@/lib/api';
import { ChatMessage } from '@/types/api';

interface ChatResponseData {
  sessionId: string;
  userMessage: ChatMessage;
  assistantMessage: ChatMessage;
}

export function useChat() {
  const [sessionId, setSessionId] = useState<string | undefined>(undefined);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sending, setSending] = useState(false);

  const sendMessage = async (userPrompt: string) => {
    if (!userPrompt.trim()) return;

    // Optimistic user update
    const optimisticMsg: ChatMessage = {
      role: 'user',
      content: userPrompt,
      timestamp: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimisticMsg]);
    setSending(true);

    try {
      const res = await apiClient<ChatResponseData>('/api/v1/chat/message', {
        method: 'POST',
        body: JSON.stringify({ message: userPrompt, sessionId }), //[cite: 1]
      });

      if (!sessionId) {
        setSessionId(res.data.sessionId);
      }

      setMessages((prev) => [...prev, res.data.assistantMessage]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: '⚠️ Failed to get a response from WeatherGPT. Please verify your connection.',
          timestamp: new Date().toISOString(),
        },
      ]);
    } finally {
      setSending(false);
    }
  };

  return { messages, sending, sendMessage, sessionId };
}