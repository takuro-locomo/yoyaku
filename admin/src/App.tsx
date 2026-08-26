import { useState } from 'react';
import { BrowserRouter, Routes, Route, NavLink, Navigate } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import Reservations from './pages/Reservations';
import Resources from './pages/Resources';
import Schedule from './pages/Schedule';
import Patients from './pages/Patients';
import Backup from './pages/Backup';
import { useScheduleReservations } from './api/hooks';

const NAV = [
  { to: '/schedule',     label: '予約入力',         icon: '📋', showPendingBadge: true },
  { to: '/',             label: '今日の予約の確認', icon: '📅', showPendingBadge: false },
  { to: '/reservations', label: '予約一覧',     icon: '🗒️', showPendingBadge: false },
  { to: '/patients',     label: '患者管理',     icon: '👤', showPendingBadge: false },
  { to: '/resources',    label: 'マスタ管理',   icon: '⚙️', showPendingBadge: false },
  { to: '/backup',       label: 'バックアップ', icon: '💾', showPendingBadge: false },
];

function PendingBadge() {
  const today = new Date().toLocaleDateString('sv');
  const { data: reservations = [] } = useScheduleReservations(today);
  const count = reservations.filter(r => r.status === 'pending').length;
  if (count === 0) return null;
  return (
    <span className="ml-auto bg-orange-400 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none min-w-[18px] text-center">
      {count}
    </span>
  );
}

export default function App() {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <BrowserRouter>
      <div className="flex h-screen bg-slate-50 font-sans print:block">

        {/* Mobile overlay */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 bg-black/50 z-40 md:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Sidebar */}
        <aside className={`
          print:hidden bg-slate-800 text-white flex flex-col shrink-0
          fixed inset-y-0 left-0 z-50 w-56 transition-transform duration-200
          md:relative md:translate-x-0
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
        `}>
          <div className="px-5 py-5 border-b border-slate-700 flex items-center justify-between">
            <div>
              <p className="text-xs text-slate-400 font-medium tracking-widest uppercase">Clinic</p>
              <h1 className="text-lg font-bold leading-tight mt-0.5">予約管理</h1>
            </div>
            {/* Close button (mobile only) */}
            <button
              className="md:hidden text-slate-400 hover:text-white p-1"
              onClick={() => setSidebarOpen(false)}
            >
              ✕
            </button>
          </div>
          <nav className="flex-1 px-3 py-4 space-y-1">
            {NAV.map(({ to, label, icon, showPendingBadge }) => (
              <NavLink
                key={to}
                to={to}
                end={to === '/' || to === '/schedule'}
                onClick={() => setSidebarOpen(false)}
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
                {showPendingBadge && <PendingBadge />}
              </NavLink>
            ))}
          </nav>
        </aside>

        {/* Main content */}
        <main className="flex-1 overflow-auto print:overflow-visible print:w-full flex flex-col min-w-0">
          {/* Mobile header bar */}
          <div className="md:hidden print:hidden flex items-center gap-3 px-3 py-2 bg-slate-800 text-white shrink-0">
            <button
              onClick={() => setSidebarOpen(true)}
              className="text-slate-300 hover:text-white p-1.5 rounded-lg hover:bg-slate-700 transition-colors"
            >
              <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                <rect y="3" width="20" height="2" rx="1"/>
                <rect y="9" width="20" height="2" rx="1"/>
                <rect y="15" width="20" height="2" rx="1"/>
              </svg>
            </button>
            <span className="text-sm font-bold">予約管理</span>
          </div>

          <div className="flex-1 overflow-auto">
            <Routes>
              <Route path="/schedule"     element={<Schedule />} />
              <Route path="/"             element={<Dashboard />} />
              <Route path="/reservations" element={<Reservations />} />
              <Route path="/resources"    element={<Resources />} />
              <Route path="/patients"     element={<Patients />} />
              <Route path="/backup"       element={<Backup />} />
              <Route path="*"             element={<Navigate to="/schedule" replace />} />
            </Routes>
          </div>
        </main>
      </div>
    </BrowserRouter>
  );
}
