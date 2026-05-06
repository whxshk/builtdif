import { Link, useLocation } from 'react-router-dom';
import { Outlet } from 'react-router-dom';
import {
  ShieldCheck, Mail, Linkedin, MessageSquare, Phone,
  Ban, Settings, Thermometer, AlertTriangle, Activity,
  ChevronRight
} from 'lucide-react';
import { cn } from '@/lib/utils';

const SUB_SECTIONS = [
  { label: 'Overview',          href: '/compliance',              icon: ShieldCheck },
  { label: 'Sending Accounts',  href: '/compliance/accounts',     icon: Settings },
  { label: 'Email Health',      href: '/compliance/email',        icon: Mail },
  { label: 'LinkedIn Safety',   href: '/compliance/linkedin',     icon: Linkedin },
  { label: 'SMS Compliance',    href: '/compliance/sms',          icon: MessageSquare },
  { label: 'Phone Compliance',  href: '/compliance/phone',        icon: Phone },
  { label: 'Suppression List',  href: '/compliance/suppression',  icon: Ban },
  { label: 'Rate Limit Rules',  href: '/compliance/rate-limits',  icon: Activity },
  { label: 'Warmup Schedules',  href: '/compliance/warmup',       icon: Thermometer },
  { label: 'Risk Alerts',       href: '/compliance/risk',         icon: AlertTriangle },
];

export default function ComplianceCenter() {
  const location = useLocation();

  return (
    <div className="flex h-full">
      {/* Sub-nav */}
      <aside className="w-52 flex-shrink-0 border-r border-border bg-muted/20 flex flex-col py-4 px-2 gap-0.5">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground px-3 mb-2">Compliance Center</p>
        {SUB_SECTIONS.map(({ label, href, icon: Icon }) => {
          const active = href === '/compliance' ? location.pathname === '/compliance' : location.pathname.startsWith(href) && href !== '/compliance';
          const isExact = href === '/compliance' && location.pathname === '/compliance';
          const isActive = href === '/compliance' ? isExact : location.pathname.startsWith(href);
          return (
            <Link
              key={href}
              to={href}
              className={cn(
                'flex items-center gap-2.5 px-3 py-2 rounded-md text-sm font-medium transition-all',
                isActive
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              )}
            >
              <Icon className="w-4 h-4 flex-shrink-0" />
              <span>{label}</span>
              {isActive && <ChevronRight className="w-3 h-3 ml-auto" />}
            </Link>
          );
        })}
      </aside>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <Outlet />
      </div>
    </div>
  );
}