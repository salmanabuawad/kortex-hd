import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Activity, BarChart3, BookOpen, ClipboardList, Cog, HelpCircle, LayoutDashboard, LifeBuoy,
  LogOut, Search, ShieldCheck, SlidersHorizontal, Table2, Users, Workflow,
} from 'lucide-react';

import { isStaff, useAuth } from '../../lib/auth';
import { useDisplay, useSyncDisplayPreferences } from '../../lib/display';
import { LANGUAGE_NAMES, type Language } from '../../i18n';
import type { Role } from '../../lib/types';
import { Avatar } from '../ui';

/* -------------------------------------------------------------------------- */
/* Navigation model                                                            */
/* -------------------------------------------------------------------------- */

interface RailItem {
  to: string;
  icon: ReactNode;
  labelKey: string;
  roles?: Role[];
}

/** Primary destinations: icon plus label. Section tabs stay on the work canvas. */
const RAIL: RailItem[] = [
  { to: '/', icon: <LayoutDashboard />, labelKey: 'nav.dashboard' },
  { to: '/tickets', icon: <ClipboardList />, labelKey: 'nav.allTickets' },
  { to: '/approvals', icon: <ShieldCheck />, labelKey: 'nav.approvals',
    roles: ['resolver', 'approver', 'admin'] },
  { to: '/knowledge', icon: <BookOpen />, labelKey: 'nav.knowledge',
    roles: ['resolver', 'approver', 'admin'] },
  { to: '/categories', icon: <LifeBuoy />, labelKey: 'nav.categories', roles: ['admin'] },
  { to: '/directory', icon: <Users />, labelKey: 'nav.directory', roles: ['admin'] },
  { to: '/workflows', icon: <Workflow />, labelKey: 'nav.workflows', roles: ['admin'] },
  { to: '/analytics', icon: <BarChart3 />, labelKey: 'nav.analytics', roles: ['admin'] },
  { to: '/field-config', icon: <Table2 />, labelKey: 'nav.fieldConfig', roles: ['admin'] },
  { to: '/settings', icon: <Cog />, labelKey: 'nav.settings', roles: ['admin'] },
  { to: '/health', icon: <Activity />, labelKey: 'nav.health', roles: ['admin'] },
];

/* -------------------------------------------------------------------------- */
/* Display settings popover                                                    */
/* -------------------------------------------------------------------------- */

const LANGUAGES: Language[] = ['he', 'ar', 'en'];

function DisplayMenu({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const {
    language, fontSize, contrast, setLanguage, setFontSize, setContrast,
  } = useDisplay();

  return (
    <div className="settings-pop" role="dialog" aria-label={t('display.settingsMenu')}>
      <div className="settings-pop__group">
        <span className="settings-pop__label">{t('display.language')}</span>
        <div className="settings-pop__options">
          {LANGUAGES.map((code) => (
            <button
              key={code}
              type="button"
              className="settings-pop__option"
              aria-pressed={language === code}
              onClick={() => { setLanguage(code); onClose(); }}
            >
              {LANGUAGE_NAMES[code]}
            </button>
          ))}
        </div>
      </div>

      <div className="settings-pop__group">
        <span className="settings-pop__label">{t('display.fontSize')}</span>
        <div className="settings-pop__options">
          {(['small', 'normal', 'large'] as const).map((size) => (
            <button
              key={size}
              type="button"
              className={`settings-pop__option settings-pop__option--${
                size === 'small' ? 'sm' : size === 'normal' ? 'md' : 'lg'}`}
              aria-pressed={fontSize === size}
              onClick={() => setFontSize(size)}
            >
              {t(`display.${size}`)}
            </button>
          ))}
        </div>
      </div>

      <div className="settings-pop__group">
        <span className="settings-pop__label">{t('display.contrast')}</span>
        <div className="settings-pop__options">
          {(['light', 'normal', 'dark', 'contrast'] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              className="settings-pop__option"
              aria-pressed={contrast === mode}
              onClick={() => setContrast(mode)}
            >
              {t(mode === 'contrast' ? 'display.highContrast' : `display.${mode}`)}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Shell                                                                       */
/* -------------------------------------------------------------------------- */

export function Shell({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [menu, setMenu] = useState<'display' | 'user' | null>(null);
  const [query, setQuery] = useState('');
  const menuRef = useRef<HTMLDivElement>(null);

  useSyncDisplayPreferences(!!user);

  useEffect(() => {
    if (!menu) return undefined;
    const onDown = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setMenu(null);
    };
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setMenu(null); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [menu]);

  useEffect(() => { setMenu(null); }, [location.pathname]);

  if (!user) return null;

  const items = RAIL.filter((item) => !item.roles || item.roles.includes(user.role));
  const isActive = (to: string) =>
    to === '/' ? location.pathname === '/' : location.pathname.startsWith(to);

  return (
    <div className="app-frame">
      <nav className="navrail" aria-label={t('nav.groupWork')}>
        <span className="navrail__brand" aria-hidden><LifeBuoy /></span>
        <span className="navrail__role">{t(`role.${user.role}`)}</span>
        {items.map((item) => (
          <button
            key={item.to}
            type="button"
            className={`navrail__item${isActive(item.to) ? ' navrail__item--active' : ''}`}
            data-label={t(item.labelKey)}
            title={t(item.labelKey)}
            aria-label={t(item.labelKey)}
            aria-current={isActive(item.to) ? 'page' : undefined}
            onClick={() => navigate(item.to)}
          >
            {item.icon}
            <span className="navrail__label">{t(item.labelKey)}</span>
          </button>
        ))}
        <span className="navrail__spacer" />
        <button
          type="button"
          className="navrail__item"
          data-label={t('nav.logout')}
          title={t('nav.logout')}
          aria-label={t('nav.logout')}
          onClick={() => { logout(); navigate('/login'); }}
        >
          <LogOut />
          <span className="navrail__label">{t('nav.logout')}</span>
        </button>
      </nav>

      <div className="workarea">
        <header className="appbar">
          <span className="appbar__brand">
            <span className="appbar__brand-name">{t('app.name')}</span>
            <span className="appbar__brand-council">{t('app.council')}</span>
          </span>

          <form
            className="appbar__search"
            onSubmit={(event) => {
              event.preventDefault();
              const next = query.trim();
              navigate(next ? `/tickets?q=${encodeURIComponent(next)}` : '/tickets');
            }}
          >
            <Search aria-hidden />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t('nav.search')}
              aria-label={t('nav.searchLabel')}
            />
          </form>

          <span className="appbar__spacer" />

          <div className="appbar__menu" ref={menu ? menuRef : undefined}>
            <button
              type="button"
              className="appbar__btn"
              title={t('display.settingsMenu')}
              aria-label={t('display.settingsMenu')}
              aria-expanded={menu === 'display'}
              onClick={() => setMenu(menu === 'display' ? null : 'display')}
            >
              <SlidersHorizontal />
            </button>
            {menu === 'display' && <DisplayMenu onClose={() => setMenu(null)} />}
          </div>

          <button
            type="button"
            className="appbar__btn"
            title={t('nav.knowledge')}
            aria-label={t('nav.knowledge')}
            onClick={() => navigate(isStaff(user) ? '/knowledge' : '/tickets/new')}
          >
            <HelpCircle />
          </button>

          <div className="appbar__menu">
            <button
              type="button"
              className="appbar__user"
              title={user.full_name}
              aria-label={user.full_name}
              aria-expanded={menu === 'user'}
              onClick={() => setMenu(menu === 'user' ? null : 'user')}
            >
              <Avatar initials={user.initials} size="sm" />
              <span className="appbar__user-meta">
                <span className="appbar__user-name">{user.full_name}</span>
              </span>
            </button>
            {menu === 'user' && (
              <div className="settings-pop" role="dialog" aria-label={user.full_name}>
                <div className="settings-pop__group">
                  <div style={{ fontWeight: 700 }}>{user.full_name}</div>
                  <div className="cell-meta">{t(`role.${user.role}`)}</div>
                  <div className="cell-meta ltr">{user.email}</div>
                </div>
                <div className="settings-pop__group">
                  <button
                    type="button"
                    className="settings-pop__option"
                    style={{ width: '100%' }}
                    onClick={() => navigate('/change-password')}
                  >
                    {t('nav.changePassword', 'החלפת סיסמה')}
                  </button>
                  <button
                    type="button"
                    className="settings-pop__option"
                    style={{ width: '100%', marginTop: 'var(--space-1)' }}
                    onClick={() => { logout(); navigate('/login'); }}
                  >
                    {t('nav.logout')}
                  </button>
                </div>
              </div>
            )}
          </div>
        </header>

        {children}

        <footer className="appfooter">© Kortex</footer>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Page frame                                                                  */
/* -------------------------------------------------------------------------- */

export interface PageTab {
  id: string;
  label: string;
  icon?: ReactNode;
  count?: number;
}

/** The repeating page skeleton: tab row, blue title banner, action bar, body. */
export function PageFrame({
  title, summary, icon, tabs, activeTab, onTabChange, actions, filters, banner,
  reading, children,
}: {
  title: string;
  summary?: string;
  icon?: ReactNode;
  tabs?: PageTab[];
  activeTab?: string;
  onTabChange?: (id: string) => void;
  actions?: ReactNode;
  filters?: ReactNode;
  banner?: ReactNode;
  /** Reading layout: narrower column with more spacing, for document pages. */
  reading?: boolean;
  children: ReactNode;
}) {
  return (
    <>
      {tabs && tabs.length > 0 && (
        <div className="tabsbar" role="tablist">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.id}
              className={`tabsbar__tab${activeTab === tab.id ? ' tabsbar__tab--active' : ''}`}
              onClick={() => onTabChange?.(tab.id)}
            >
              {tab.icon}
              {tab.label}
              {tab.count !== undefined && tab.count > 0 && (
                <span className="tabsbar__count">{tab.count}</span>
              )}
            </button>
          ))}
        </div>
      )}

      <div className={`workarea__body${reading ? ' workarea__body--reading' : ''}`}>
        <header className="pagehead">
          {icon && <span className="pagehead__icon">{icon}</span>}
          <div className="pagehead__text">
            <h1 className="pagehead__title">{title}</h1>
            {summary && <p className="pagehead__summary">{summary}</p>}
          </div>
        </header>

        {banner}

        {(actions || filters) && (
          <div className="actionbar">
            <div className="actionbar__filters">{filters}</div>
            <div className="actionbar__actions">{actions}</div>
          </div>
        )}

        {children}
      </div>
    </>
  );
}
