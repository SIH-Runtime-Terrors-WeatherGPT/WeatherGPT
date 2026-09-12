'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function RootPage() {
  const router = useRouter();

  useEffect(() => {
    const token = localStorage.getItem('weathergpt_token');
    if (token) {
      router.replace('/login'); // or your default dashboard page
    } else {
      router.replace('/login');
    }
  }, [router]);

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center">
      <span className="h-4 w-4 rounded-full bg-cyan-400 animate-ping" />
    </div>
  );
}