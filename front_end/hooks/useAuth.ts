'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { apiClient } from '@/lib/api';
import { User } from '@/types/api';

export function useAuth() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchProfile = useCallback(async () => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('weathergpt_token') : null;
    if (!token) {
      setUser(null);
      setLoading(false);
      return;
    }

    try {
      // Calls GET /api/v1/auth/me
      const res = await apiClient<{ user: User }>('/api/v1/auth/me');
      setUser(res.data.user);
    } catch {
      localStorage.removeItem('weathergpt_token');
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = () => {
    localStorage.removeItem('weathergpt_token');
    setUser(null);
    router.push('/login');
  };

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  return { user, loading, logout, refetchUser: fetchProfile };
}