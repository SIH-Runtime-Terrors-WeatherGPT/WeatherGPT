'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiClient } from '@/lib/api';

export default function LoginPage() {
  const router = useRouter();
  const [isLogin, setIsLogin] = useState(true);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const endpoint = isLogin ? '/api/auth/login' : '/api/auth/register';
    const payload = isLogin ? { email, password } : { name, email, password };

    try {
      const res = await apiClient<{ accessToken?: string; token?: string; access_token?: string; user?: any }>(endpoint, {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      const dataObj = res.data || (res as any);
      let token = dataObj?.accessToken || dataObj?.token || dataObj?.access_token;

      // If registering and backend returned user without direct token, auto-login
      if (!token && !isLogin) {
        try {
          const loginRes = await apiClient<{ accessToken?: string; token?: string; access_token?: string }>('/api/auth/login', {
            method: 'POST',
            body: JSON.stringify({ email, password }),
          });
          const loginData = loginRes.data || (loginRes as any);
          token = loginData?.accessToken || loginData?.token || loginData?.access_token;
        } catch {
          // If auto-login fails (e.g. duplicate user registered earlier), prompt user to sign in
          setIsLogin(true);
          setError('Account created! Please sign in with your credentials.');
          return;
        }
      }

      if (token) {
        localStorage.setItem('weathergpt_token', token);
        router.push('/dashboard');
      } else {
        throw new Error('Could not authenticate session. Please try logging in.');
      }
    } catch (err: any) {
      setError(err.message || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  const handleUseDemo = () => {
    setEmail('demo@weathergpt.com');
    setPassword('Password123!');
  };

  return (
    <div className="min-h-screen relative flex items-center justify-center p-4 bg-slate-950 overflow-hidden text-slate-100">
      {/* Dynamic Background Glows */}
      <div className="absolute -top-40 -left-40 w-96 h-96 bg-blue-600/30 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-cyan-500/20 rounded-full blur-[120px] pointer-events-none" />

      {/* Glassmorphic Form Card */}
      <div className="w-full max-w-md p-8 rounded-2xl backdrop-blur-2xl bg-slate-900/60 border border-white/10 shadow-2xl z-10 transition-all">
        <div className="text-center mb-8">
          <div className="inline-flex w-14 h-14 overflow-hidden">
            <img src="/logo.png" alt="Logo" className="w-full h-full " />
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-blue-400 via-teal-300 to-cyan-400 bg-clip-text text-transparent">
            WeatherGPT
          </h1>
          <p className="text-sm text-slate-400">
            {isLogin ? 'Access your AI-powered meteorological hub' : 'Create an account for hyper-local climate intelligence'}
          </p>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-xs text-center">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {!isLogin && (
            <div>
              <label className="block text-xs uppercase font-semibold text-slate-400 mb-1">Name</label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Enter your name"
                className="w-full px-4 py-2.5 rounded-xl bg-slate-800/60 border border-white/10 focus:border-cyan-400 focus:outline-none text-white text-sm"
              />
            </div>
          )}

          <div>
            <label className="block text-xs uppercase font-semibold text-slate-400 mb-1">Email Address</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Enter your email"
              className="w-full px-4 py-2.5 rounded-xl bg-slate-800/60 border border-white/10 focus:border-cyan-400 focus:outline-none text-white text-sm"
            />
          </div>

          <div>
            <label className="block text-xs uppercase font-semibold text-slate-400 mb-1">Password</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              className="w-full px-4 py-2.5 rounded-xl bg-slate-800/60 border border-white/10 focus:border-cyan-400 focus:outline-none text-white text-sm"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 mt-4 rounded-xl font-medium bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 transition shadow-lg shadow-cyan-500/20 disabled:opacity-50 text-sm font-semibold"
          >
            {loading ? 'Authenticating...' : isLogin ? 'Sign In' : 'Register'}
          </button>
        </form>

        <div className="mt-4 pt-4 border-t border-white/10 flex flex-col gap-2 text-center">
          <button
            type="button"
            onClick={handleUseDemo}
            className="w-full py-2 px-3 rounded-xl bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 text-xs font-semibold transition"
          >
            ✨ Auto-fill SIH Demo Credentials
          </button>

          <button
            type="button"
            onClick={() => setIsLogin(!isLogin)}
            className="text-xs text-slate-400 hover:text-cyan-400 transition mt-1"
          >
            {isLogin ? "Don't have an account? Sign Up" : 'Already have an account? Sign In'}
          </button>
        </div>
      </div>
    </div>
  );
}