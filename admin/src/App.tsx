import { BrowserRouter, Routes, Route, NavLink, Navigate } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import Reservations from './pages/Reservations';
import Resources from './pages/Resources';
import Schedule from './pages/Schedule';
import Patients from './pages/Patients';
import { useScheduleReservations } from './api/hooks';

const NAV = [
  { to: '/schedule',     label: '予約表',       icon: '📋', showPendingBadge: true },
  { to: '/',             label: '今日の予約',   icon: '📅', showPendingBadge: false },
  { to: '/reservations', label: '予約一覧',     icon: '🗒️', showPendingBadge: false },
  { to: '/patients',     label: '患者管理',     icon: '👤', showPendingBadge: false },
  { to: '/resources',    label: 'マスタ管理',   icon: '⚙️', showPendingBadge: false },
];

function PendingBadge() {
  const today = new Date().toLocaleDateString('sv'); // YYYY-MM-DD
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
            {NAV.map(({ to, label, icon, showPendingBadge }) => (
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
                {showPendingBadge && <PendingBadge />}
              </NavLink>
            ))}
          </nav>
        </aside>

        {/* Main content */}
        <main className="flex-1 overflow-auto print:overflow-visible print:w-full">
          <Routes>
            <Route path="/schedule"     element={<Schedule />} />
            <Route path="/"             element={<Dashboard />} />
            <Route path="/reservations" element={<Reservations />} />
            <Route path="/resources"    element={<Resources />} />
            <Route path="/patients"     element={<Patients />} />
            <Route path="*"             element={<Navigate to="/schedule" replace />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}
