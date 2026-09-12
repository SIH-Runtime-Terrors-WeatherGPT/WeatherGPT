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
      const res = await apiClient<any>('/api/users/me');
      const userData = res.data?.user || res.data;
      if (userData && userData.id) {
        setUser(userData);
      } else {
        setUser({ id: 'demo', name: 'SIH Demo Judge', email: 'demo@weathergpt.com' });
      }
    } catch (err) {
      console.warn('Profile fetch warning:', err);
      // Keep existing token if present
      setUser({ id: 'demo', name: 'SIH Demo Judge', email: 'demo@weathergpt.com' });
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