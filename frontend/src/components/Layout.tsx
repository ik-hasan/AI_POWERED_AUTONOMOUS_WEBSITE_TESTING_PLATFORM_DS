import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, FolderKanban, Globe, FlaskConical, Play,
  FileText, BarChart3, LogOut, Moon, Sun, Menu, X, Zap,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import {
  PROJECTS_LAST_PATH_KEY,
  EXECUTIONS_LAST_PATH_KEY,
  safeProjectsPath,
  safeExecutionsPath,
  usePersistedState,
} from '@/hooks/usePersistedState';
import clsx from 'clsx';

const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/projects', icon: FolderKanban, label: 'Projects', match: 'projects' as const },
  { to: '/test-cases', icon: FlaskConical, label: 'Test Cases' },
  { to: '/executions', icon: Play, label: 'Executions', match: 'executions' as const },
  { to: '/reports', icon: FileText, label: 'Reports' },
  { to: '/analytics', icon: BarChart3, label: 'Analytics' },
];

export default function Layout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const { dark, toggle } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const mainRef = useRef<HTMLElement>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [projectsLastPath] = usePersistedState(PROJECTS_LAST_PATH_KEY, '/projects');
  const [executionsLastPath] = usePersistedState(EXECUTIONS_LAST_PATH_KEY, '/executions');

  useEffect(() => {
    const el = mainRef.current;
    if (!el) return;
    const key = `scroll:${location.pathname}`;
    const saved = sessionStorage.getItem(key);
    if (saved) el.scrollTop = Number(saved);

    const onScroll = () => sessionStorage.setItem(key, String(el.scrollTop));
    el.addEventListener('scroll', onScroll);
    return () => {
      sessionStorage.setItem(key, String(el.scrollTop));
      el.removeEventListener('scroll', onScroll);
    };
  }, [location.pathname]);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div className="flex h-screen overflow-hidden">
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 bg-black/50 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      <aside className={clsx(
        'fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-gray-200 bg-white transition-transform dark:border-gray-800 dark:bg-gray-900 lg:static lg:translate-x-0',
        sidebarOpen ? 'translate-x-0' : '-translate-x-full'
      )}>
        <div className="flex h-16 items-center gap-2 border-b border-gray-200 px-6 dark:border-gray-800">
          <Zap className="h-6 w-6 text-brand-600" />
          <span className="text-lg font-bold">AI Test Platform</span>
          <button className="ml-auto lg:hidden" onClick={() => setSidebarOpen(false)}>
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex-1 space-y-1 p-4">
          {navItems.map(({ to, icon: Icon, label, match }) => {
            const href =
              match === 'projects' ? safeProjectsPath(projectsLastPath)
                : match === 'executions' ? safeExecutionsPath(executionsLastPath)
                : to;
            return (
            <NavLink
              key={label}
              to={href}
              end={to === '/'}
              onClick={() => setSidebarOpen(false)}
              className={({ isActive }) => clsx(
                'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-400'
                  : 'text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800'
              )}
            >
              <Icon className="h-5 w-5" />
              {label}
            </NavLink>
            );
          })}
        </nav>

        <div className="border-t border-gray-200 p-4 dark:border-gray-800">
          <div className="mb-3 flex items-center gap-3 px-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-100 text-sm font-semibold text-brand-700 dark:bg-brand-900/50 dark:text-brand-400">
              {user?.name?.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 truncate">
              <p className="text-sm font-medium truncate">{user?.name}</p>
              <p className="text-xs text-gray-500 truncate">{user?.email}</p>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={toggle} className="btn-secondary flex-1 py-1.5">
              {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
            <button onClick={handleLogout} className="btn-secondary flex-1 py-1.5">
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>

      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex h-16 items-center border-b border-gray-200 bg-white px-6 dark:border-gray-800 dark:bg-gray-900 lg:hidden">
          <button onClick={() => setSidebarOpen(true)}>
            <Menu className="h-6 w-6" />
          </button>
          <span className="ml-4 font-semibold">AI Test Platform</span>
        </header>
        <main ref={mainRef} className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  );
}
