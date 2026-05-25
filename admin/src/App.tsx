import { BrowserRouter, Routes, Route, NavLink, Navigate } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import Reservations from './pages/Reservations';
import Resources from './pages/Resources';
import Schedule from './pages/Schedule';

const NAV = [
  { to: '/schedule',     label: '予約表',       icon: '📋' },
  { to: '/',             label: '今日の予約',   icon: '📅' },
  { to: '/reservations', label: '予約一覧',     icon: '🗒️' },
  { to: '/resources',    label: 'マスタ管理',   icon: '⚙️' },
];

export default function App() {
  return (
    <BrowserRouter>
      <div className="flex h-screen bg-slate-50 font-sans print:block">
        {/* Sidebar — hidden on print */}
        <aside className="print:hidden w-56 bg-slate-800 text-white flex flex-col shrink-0">
          <div className="px-5 py-5 border-b border-slate-700">
            <p className="text-xs text-slate-400 font-medium tracking-widest uppercase">Clinic</p>
            <h1 className="text-lg font-bold leading-tight mt-0.5">予約管理</h1>
          </div>
          <nav className="flex-1 px-3 py-4 space-y-1">
            {NAV.map(({ to, label, icon }) => (
              <NavLink
                key={to}
                to={to}
                end={to === '/' || to === '/schedule'}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                    isActive
                      ? 'bg-indigo-600 text-white font-medium'
                      : 'text-slate-300 hover:bg-slate-700'
                  }`
                }
              >
                <span className="text-base">{icon}</span>
                {label}
              </NavLink>
            ))}
          </nav>
          <div className="px-5 py-4 border-t border-slate-700 text-xs text-slate-500">
            Mock data — 2026-03-30
          </div>
        </aside>

        {/* Main content */}
        <main className="flex-1 overflow-auto print:overflow-visible print:w-full">
          <Routes>
            <Route path="/schedule"     element={<Schedule />} />
            <Route path="/"             element={<Dashboard />} />
            <Route path="/reservations" element={<Reservations />} />
            <Route path="/resources"    element={<Resources />} />
            <Route path="*"             element={<Navigate to="/schedule" replace />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}
