import { Component, type ErrorInfo, type ReactNode } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';

import { AuthProvider, RequireAuth, RequireRole } from './lib/auth';
import { DisplayProvider } from './lib/display';
import { Shell } from './components/layout/Shell';
import { ToastProvider } from './components/ui/toast';
import { Button, DeniedState, EmptyState } from './components/ui';

import Login from './pages/Login';
import ChangePassword from './pages/ChangePassword';
import Dashboard from './pages/Dashboard';
import Tickets from './pages/Tickets';
import NewTicket from './pages/NewTicket';
import TicketDetail from './pages/TicketDetail';
import Approvals from './pages/Approvals';
import Categories from './pages/Categories';
import Directory from './pages/Directory';
import Workflows from './pages/Workflows';
import Analytics from './pages/Analytics';
import Settings from './pages/Settings';
import Health from './pages/Health';
import Knowledge from './pages/Knowledge';
import ExternalWorkspace from './pages/ExternalWorkspace';
import FieldConfigPage from './pages/FieldConfig';

/** Catches render-time failures so a broken page shows a message instead of a
 *  blank white screen. */
class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('render error', error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="state" style={{ minHeight: '60vh' }}>
          <div className="state__icon state__icon--danger">!</div>
          <p className="state__title">אירעה שגיאה בהצגת העמוד</p>
          <p className="state__text">
            הפעולה נעצרה כדי למנוע נזק לנתונים. רענון העמוד בדרך כלל פותר את הבעיה.
          </p>
          <Button variant="primary" onClick={() => window.location.reload()}>
            רענון העמוד
          </Button>
        </div>
      );
    }
    return this.props.children;
  }
}

/** Wraps an authenticated page in the application shell. */
const inShell = (element: ReactNode) => (
  <RequireAuth>
    <Shell>
      <ErrorBoundary>{element}</ErrorBoundary>
    </Shell>
  </RequireAuth>
);

const adminOnly = (element: ReactNode) => inShell(
  <RequireRole roles={['admin']}>{element}</RequireRole>,
);

const staffOnly = (element: ReactNode) => inShell(
  <RequireRole roles={['resolver', 'approver', 'admin']}>{element}</RequireRole>,
);

export default function App() {
  return (
    // The base is "/" for the council's own host and "/hd/" when built with
    // --base=/hd/ to sit under a path on a shared host.
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <ToastProvider>
        <DisplayProvider>
        <AuthProvider>
          <Routes>
            {/* Public */}
            <Route path="/login" element={<Login />} />
            <Route path="/external/subtask/:token" element={<ExternalWorkspace />} />

            {/* Forced first-login password change: inside auth, outside the shell */}
            <Route
              path="/change-password"
              element={<RequireAuth><ChangePassword /></RequireAuth>}
            />

            {/* Work */}
            <Route path="/" element={inShell(<Dashboard />)} />
            <Route path="/tickets" element={inShell(<Tickets />)} />
            <Route path="/tickets/new" element={inShell(<NewTicket />)} />
            <Route path="/tickets/:id" element={inShell(<TicketDetail />)} />
            <Route path="/approvals" element={staffOnly(<Approvals />)} />
            <Route path="/knowledge" element={staffOnly(<Knowledge />)} />

            {/* Administration */}
            <Route path="/categories" element={adminOnly(<Categories />)} />
            <Route path="/directory" element={adminOnly(<Directory />)} />
            <Route path="/workflows" element={adminOnly(<Workflows />)} />
            <Route path="/analytics" element={adminOnly(<Analytics />)} />
            <Route path="/settings" element={adminOnly(<Settings />)} />
            <Route path="/health" element={adminOnly(<Health />)} />
            <Route path="/field-config" element={adminOnly(<FieldConfigPage />)} />

            <Route
              path="/denied"
              element={inShell(
                <div className="workarea__body workarea__body--reading"><DeniedState /></div>,
              )}
            />
            <Route
              path="*"
              element={inShell(
                <div className="workarea__body workarea__body--reading">
                <EmptyState
                  title="העמוד לא נמצא"
                  text="ייתכן שהקישור שגוי או שהעמוד הוסר."
                  action={<a className="btn btn--primary" href={import.meta.env.BASE_URL}>חזרה ללוח הבקרה</a>}
                />
                </div>,
              )}
            />
          </Routes>
        </AuthProvider>
        </DisplayProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}
