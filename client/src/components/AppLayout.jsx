import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';

import { useAuthStore } from '../store/authStore';
import { cn } from '../utils/cn';
import { ConnectivityBanner } from './ConnectivityBanner';
import { ThemeToggle } from './ThemeToggle';
import { Avatar } from './ui';

const linksByRole = {
  admin: [
    { to: '/dashboard', label: 'Overview', icon: '▦' },
    { to: '/users', label: 'Users', icon: '☷' },
  ],
  teacher: [
    { to: '/dashboard', label: 'Overview', icon: '▦' },
    { to: '/questions', label: 'Question bank', icon: '▤' },
    { to: '/exams', label: 'Exams', icon: '▣' },
  ],
  student: [
    { to: '/dashboard', label: 'My exams', icon: '▦' },
    { to: '/exams/available', label: 'Explore exams', icon: '▣' },
    { to: '/results', label: 'Results', icon: '▤' },
  ],
};

const Brand = () => (
  <NavLink className="flex items-center gap-2.5 rounded-xl focus-visible:outline-none" to="/dashboard">
    <span className="grid h-9 w-9 place-items-center rounded-xl bg-brand-600 text-sm font-black text-white shadow-sm">
      EG
    </span>
    <span>
      <span className="block text-base font-bold tracking-tight text-slate-950 dark:text-white">ExamGuard</span>
      <span className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
        Secure assessment
      </span>
    </span>
  </NavLink>
);

const NavigationLinks = ({ links, onNavigate }) => (
  <nav aria-label="Main navigation" className="space-y-1">
    {links.map((link) => (
      <NavLink
        className={({ isActive }) =>
          cn(
            'flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-semibold transition-colors',
            isActive
              ? 'bg-brand-50 text-brand-800 dark:bg-brand-950/60 dark:text-brand-200'
              : 'text-slate-600 hover:bg-slate-100 hover:text-slate-950 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white',
          )
        }
        key={link.to}
        onClick={onNavigate}
        to={link.to}
      >
        <span aria-hidden="true" className="w-4 text-center text-base opacity-80">
          {link.icon}
        </span>
        {link.label}
      </NavLink>
    ))}
  </nav>
);

export const AppLayout = () => {
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const links = linksByRole[user?.role] || [];

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!mobileOpen) return undefined;
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setMobileOpen(false);
    };
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = originalOverflow;
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [mobileOpen]);

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <a
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[60] focus:rounded-lg focus:bg-brand-600 focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-white"
        href="#main-content"
      >
        Skip to content
      </a>
      <ConnectivityBanner />

      <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-slate-200 bg-white/95 px-4 backdrop-blur dark:border-slate-800 dark:bg-slate-900/95 lg:hidden">
        <Brand />
        <div className="flex items-center gap-1">
          <ThemeToggle compact />
          <button
            aria-expanded={mobileOpen}
            aria-label="Open navigation"
            className="rounded-xl p-2.5 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
            onClick={() => setMobileOpen(true)}
            type="button"
          >
            <span aria-hidden="true" className="text-lg">
              ☰
            </span>
          </button>
        </div>
      </header>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            aria-label="Close navigation"
            className="absolute inset-0 bg-slate-950/50 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
            type="button"
          />
          <aside className="absolute inset-y-0 left-0 flex w-[min(19rem,88vw)] flex-col overflow-y-auto rounded-r-2xl border-r border-slate-200 bg-white p-4 shadow-2xl dark:border-slate-800 dark:bg-slate-900">
            <div className="mb-6 flex items-center justify-between">
              <Brand />
              <button
                aria-label="Close navigation"
                className="rounded-lg p-2 text-xl leading-none text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                onClick={() => setMobileOpen(false)}
                type="button"
              >
                ×
              </button>
            </div>
            <NavigationLinks links={links} onNavigate={() => setMobileOpen(false)} />
            <div className="mt-auto border-t border-slate-200 pt-4 dark:border-slate-800">
              <div className="mb-3 flex items-center gap-3 px-2">
                <Avatar name={user?.name} size="sm" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">{user?.name}</p>
                  <p className="truncate text-xs capitalize text-slate-500 dark:text-slate-400">{user?.role}</p>
                </div>
              </div>
              <ThemeToggle />
              <button className="btn-ghost w-full justify-start" onClick={handleLogout} type="button">
                <span aria-hidden="true">↩</span> Sign out
              </button>
            </div>
          </aside>
        </div>
      )}

      <div className="lg:grid lg:min-h-[calc(100vh-1px)] lg:grid-cols-[16rem_minmax(0,1fr)]">
        <aside className="sticky top-0 hidden h-screen flex-col border-r border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 lg:flex">
          <div className="mb-7 px-1">
            <Brand />
          </div>
          <NavigationLinks links={links} />
          <div className="mt-auto border-t border-slate-200 pt-4 dark:border-slate-800">
            <div className="mb-3 flex items-center gap-3 px-2">
              <Avatar name={user?.name} size="sm" />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">{user?.name}</p>
                <p className="truncate text-xs capitalize text-slate-500 dark:text-slate-400">{user?.role}</p>
              </div>
            </div>
            <ThemeToggle />
            <button className="btn-ghost w-full justify-start" onClick={handleLogout} type="button">
              <span aria-hidden="true">↩</span> Sign out
            </button>
          </div>
        </aside>

        <main className="min-w-0" id="main-content">
          <div className="page">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
};

export default AppLayout;
