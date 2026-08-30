import { useEffect, useState, type ReactNode } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  Activity, BarChart3, BookOpen, ChevronDown, ClipboardList, Cog, Inbox,
  LayoutDashboard, LifeBuoy, LogOut, Menu, Plus, Search, ShieldCheck, Ticket, Users, Workflow, X,
} from 'lucide-react';

import { useAuth } from '../../lib/auth';
import { roleLabel } from '../../lib/labels';
import { Avatar, IconButton } from '../ui';
import type { Role } from '../../lib/types';

interface NavItem {
  to: string;
  label: string;
  icon: ReactNode;
  roles?: Role[];
  end?: boolean;
}

interface NavGroup {
  label: string;
  items: NavItem[];
  roles?: Role[];
}

const NAV: NavGroup[] = [
  {
    label: 'עבודה',
    items: [
      { to: '/', label: 'לוח בקרה', icon: <LayoutDashboard />, end: true },
      { to: '/tickets', label: 'הקריאות שלי', icon: <Ticket />, roles: ['requester'] },
      { to: '/tickets?scope=mine', label: 'הקריאות שלי', icon: <Inbox />,
        roles: ['resolver', 'approver', 'admin'] },
      { to: '/tickets', label: 'כל הקריאות', icon: <ClipboardList />,
        roles: ['resolver', 'approver', 'admin'] },
      { to: '/approvals', label: 'ממתין לאישור', icon: <ShieldCheck />,
        roles: ['resolver', 'approver', 'admin'] },
    ],
  },
  {
    label: 'מוקד השירות',
    roles: ['resolver', 'approver', 'admin'],
    items: [
      { to: '/knowledge', label: 'פתרונות ותקלות ידועות', icon: <BookOpen /> },
      { to: '/categories', label: 'קטגוריות', icon: <LifeBuoy />, roles: ['admin'] },
    ],
  },
  {
    label: 'ניהול',
    roles: ['admin'],
    items: [
      { to: '/directory', label: 'משתמשים', icon: <Users /> },
      { to: '/workflows', label: 'כללי תהליך', icon: <Workflow /> },
      { to: '/analytics', label: 'דוחות', icon: <BarChart3 /> },
      { to: '/settings', label: 'הגדרות', icon: <Cog /> },
      { to: '/health', label: 'תקינות המערכת', icon: <Activity /> },
    ],
  },
];

function visibleFor(role: Role): NavGroup[] {
  return NAV
    .filter((group) => !group.roles || group.roles.includes(role))
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => !item.roles || item.roles.includes(role)),
    }))
    .filter((group) => group.items.length > 0);
}

export function Shell({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [search, setSearch] = useState('');

  // Close the mobile drawer whenever navigation happens.
  useEffect(() => { setMenuOpen(false); }, [location.pathname, location.search]);

  if (!user) return null;
  const groups = visibleFor(user.role);

  const submitSearch = (event: React.FormEvent) => {
    event.preventDefault();
    const term = search.trim();
    navigate(term ? `/tickets?q=${encodeURIComponent(term)}` : '/tickets');
  };

  return (
    <div className="shell">
      {menuOpen && (
        <div className="sidebar-scrim" onClick={() => setMenuOpen(false)} aria-hidden />
      )}

      <aside className={`sidebar${menuOpen ? ' sidebar--open' : ''}`}>
        <div className="sidebar__brand">
          <span className="sidebar__mark"><LifeBuoy size={20} /></span>
          <div className="grow">
            <div className="sidebar__title">מוקד שירות</div>
            <div className="sidebar__subtitle">מועצה מקומית בוקעאתא</div>
          </div>
          <IconButton
            label="סגירת התפריט" className="mobile-only"
            onClick={() => setMenuOpen(false)}
            style={{ color: 'var(--shell-text)' }}
          >
            <X />
          </IconButton>
        </div>

        <nav className="sidebar__nav" aria-label="ניווט ראשי">
          {groups.map((group) => (
            <div className="sidebar__group" key={group.label}>
              <div className="sidebar__group-label">{group.label}</div>
              <ul>
                {group.items.map((item) => (
                  <li key={`${group.label}-${item.to}-${item.label}`}>
                    <NavLink
                      to={item.to}
                      end={item.end}
                      className={({ isActive }) => {
                        // NavLink ignores the query string, so "my tickets" and
                        // "all tickets" would both light up. Compare explicitly.
                        const [path, query] = item.to.split('?');
                        const samePath = location.pathname === path;
                        const sameQuery = (location.search.replace('?', '') || '') === (query || '');
                        const active = item.to.includes('?')
                          ? samePath && sameQuery
                          : isActive && (item.end ? true : sameQuery);
                        return `sidebar__link${active ? ' sidebar__link--active' : ''}`;
                      }}
                    >
                      {item.icon}
                      <span className="grow">{item.label}</span>
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>

        <div className="sidebar__footer">
          <button className="sidebar__user" onClick={() => navigate('/change-password')}>
            <Avatar initials={user.initials} />
            <span className="grow">
              <span className="sidebar__user-name" style={{ display: 'block' }}>
                {user.full_name}
              </span>
              <span className="sidebar__user-role">{roleLabel[user.role]}</span>
            </span>
            <ChevronDown size={15} />
          </button>
          <button
            className="sidebar__user"
            onClick={() => { logout(); navigate('/login'); }}
          >
            <LogOut size={17} />
            <span className="grow" style={{ fontSize: 'var(--text-sm)' }}>יציאה</span>
          </button>
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <IconButton
            label="פתיחת התפריט" className="mobile-only"
            onClick={() => setMenuOpen(true)}
          >
            <Menu />
          </IconButton>

          <form className="topbar__search" onSubmit={submitSearch} role="search">
            <Search aria-hidden />
            <input
              type="search"
              placeholder="חיפוש קריאה לפי נושא או מספר…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              aria-label="חיפוש קריאות"
            />
          </form>

          <div className="topbar__spacer" />

          <div className="topbar__actions">
            <Link to="/tickets/new" className="btn btn--primary btn--sm">
              <Plus size={16} />
              <span className="grow">קריאה חדשה</span>
            </Link>
          </div>
        </header>

        <main className="content">{children}</main>
      </div>
    </div>
  );
}
