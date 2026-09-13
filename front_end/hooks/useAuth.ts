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
      if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
        router.replace('/login');
      }
      return;
    }

    try {
      const res = await apiClient<any>('/api/users/me');
      const userData = res.data?.user || res.data;
      if (userData && userData.id) {
        setUser(userData);
      } else {
        throw new Error('Invalid user profile');
      }
    } catch (err) {
      console.warn('Authentication check failed:', err);
      if (typeof window !== 'undefined') {
        localStorage.removeItem('weathergpt_token');
      }
      setUser(null);
      if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
        router.replace('/login');
      }
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