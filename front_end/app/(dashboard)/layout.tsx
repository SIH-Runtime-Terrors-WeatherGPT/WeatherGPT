'use client';

import { useAuth } from '@/hooks/useAuth';
import Link from 'next/link';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();

  return (
    <div className="min-h-screen flex flex-col bg-slate-950">
      {/* Top Navbar */}
      <nav className="w-full px-6 py-3 border-b border-white/10 backdrop-blur-xl bg-slate-900/40 flex justify-between items-center sticky top-0 z-40">
        <div className="flex items-center gap-3">
          <span className="text-xl">⚡</span>
          <span className="font-bold text-sm tracking-wider bg-gradient-to-r from-blue-400 to-cyan-300 bg-clip-text text-transparent">
            WEATHERGPT
          </span>
        </div>

        <div className="flex items-center gap-4">
          {user ? (
            <div className="flex items-center gap-3">
              <span className="text-xs text-slate-400 hidden sm:inline">Signed in as <b className="text-white">{user.name}</b></span>
              <button
                onClick={logout}
                className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-red-500/20 text-red-400 text-xs border border-white/10 transition"
              >
                Sign Out
              </button>
            </div>
          ) : (
            <Link
              href="/login"
              className="px-3 py-1.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold text-xs transition"
            >
              Sign In
            </Link>
          )}
        </div>
      </nav>

      <main className="flex-1">{children}</main>
    </div>
  );
}