import { Link, useLocation, Outlet } from 'react-router-dom';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard, Upload, History, Building2, FolderKanban,
  Send, Settings, ChevronRight,
} from 'lucide-react';

const NAV_ITEMS = [
  { label: 'Dashboard',      href: '/',               icon: LayoutDashboard },
  { label: 'Import Excel',   href: '/import',         icon: Upload },
  { label: 'Import History', href: '/import-history', icon: History },
  { label: 'Companies',      href: '/companies',      icon: Building2 },
  { label: 'Outreach Queue', href: '/outreach',       icon: Send },
  { label: 'Settings',       href: '/settings',       icon: Settings },
];

export default function Layout() {
  const location = useLocation();

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      <aside className="w-56 flex-shrink-0 bg-sidebar flex flex-col border-r border-sidebar-border">
        <div className="px-4 py-5 border-b border-sidebar-border">
          <div className="flex flex-col gap-1">
            <div className="text-base font-bold text-sidebar-foreground tracking-tight">OutreachOS</div>
          </div>
        </div>

        <nav className="flex-1 px-2 py-4 space-y-0.5 overflow-y-auto">
          {NAV_ITEMS.map(({ label, href, icon: Icon }) => {
            const active = href === '/' ? location.pathname === '/' : location.pathname.startsWith(href);
            return (
              <Link
                key={href}
                to={href}
                className={cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-all group',
                  active
                    ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                    : 'text-sidebar-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground'
                )}
              >
                <Icon className={cn('w-4 h-4 flex-shrink-0', active ? 'text-sidebar-primary' : 'text-sidebar-foreground/60 group-hover:text-sidebar-foreground')} />
                <span className="flex-1">{label}</span>
                {active && <ChevronRight className="w-3 h-3 text-sidebar-primary" />}
              </Link>
            );
          })}
        </nav>

        <div className="px-2 py-3 border-t border-sidebar-border">
          <Link
            to="/campaigns"
            className={cn(
              'flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-all group w-full',
              location.pathname.startsWith('/campaigns')
                ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                : 'text-sidebar-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground'
            )}
          >
            <FolderKanban className={cn('w-4 h-4 flex-shrink-0', location.pathname.startsWith('/campaigns') ? 'text-sidebar-primary' : 'text-sidebar-foreground/60 group-hover:text-sidebar-foreground')} />
            <span className="flex-1">Projects</span>
          </Link>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
}