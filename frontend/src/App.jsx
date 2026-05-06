import { useState, useEffect, useRef } from "react";
import { BrowserRouter, Routes, Route, NavLink, Outlet, useNavigate } from "react-router-dom";
import GamesPage            from "./pages/GamesPage.jsx";
import OddsPage             from "./pages/OddsPage.jsx";
import BacktestPage         from "./pages/BacktestPage.jsx";
import SavedStrategiesPage  from "./pages/SavedStrategiesPage.jsx";
import LandingPage, { LandingFooter } from "./pages/LandingPage.jsx";
import LoginPage     from "./pages/LoginPage.jsx";
import RegisterPage  from "./pages/RegisterPage.jsx";
import { loadUser, clearUser, userDisplayName } from "./utils/auth.js";

// ── App-shell pieces (the navbar shown to authenticated users in the app) ──

// Inside the app shell the logo takes the user back to the main app page
// (Backtest), not the public marketing site at "/".
function BrandMark() {
  return (
    <NavLink to="/backtest" className="brand-mark" aria-label="Go to Backtest">
      <img src="/transparent-logo.svg" alt="BetWise" className="brand-logo" />
    </NavLink>
  );
}

function ProfileMenu() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  // Read user fresh on every open so it reflects login/register without a
  // page reload. (loadUser() is cheap - just reads localStorage.)
  const user = open ? loadUser() : null;
  const displayName  = userDisplayName(user);
  const displayEmail = user?.email && user.email !== displayName ? user.email : null;

  // Close on click-outside or Escape.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    }
    function onKey(e) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function handleLogout() {
    clearUser();
    setOpen(false);
    navigate("/");
  }

  return (
    <div className="profile-menu" ref={wrapRef}>
      <button
        type="button"
        className="profile-btn"
        aria-label="Account menu"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
             strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="8" r="4" />
          <path d="M4 21c0-4 4-7 8-7s8 3 8 7" />
        </svg>
      </button>

      {open && (
        <div className="profile-dropdown" role="menu">
          <div className="profile-dropdown-header">
            <div className="profile-dropdown-name">{displayName}</div>
            {displayEmail && (
              <div className="profile-dropdown-email">{displayEmail}</div>
            )}
          </div>
          <div className="profile-dropdown-divider" />
          <button
            type="button"
            role="menuitem"
            className="profile-dropdown-item"
            onClick={handleLogout}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                 strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            Log out
          </button>
        </div>
      )}
    </div>
  );
}

function Navbar() {
  return (
    <header className="navbar">
      <BrandMark />
      <nav className="nav-links">
        <NavLink to="/backtest">Backtest</NavLink>
        <NavLink to="/games">Games</NavLink>
        <NavLink to="/saved">Saved</NavLink>
      </nav>
      <div className="navbar-end">
        <ProfileMenu />
      </div>
    </header>
  );
}

/** Layout for the actual app - wraps the routes that should show the navbar. */
function AppShell() {
  return (
    <div className="shell">
      <Navbar />
      <main className="page">
        <Outlet />
      </main>
      <LandingFooter />
    </div>
  );
}

// ── Routes ─────────────────────────────────────────────────────────────────

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public marketing site */}
        <Route path="/"          element={<LandingPage />} />
        <Route path="/login"     element={<LoginPage />} />
        <Route path="/register"  element={<RegisterPage />} />

        {/* App - wrapped in AppShell so they share the navbar */}
        <Route element={<AppShell />}>
          <Route path="/backtest"       element={<BacktestPage />} />
          <Route path="/games"          element={<GamesPage />} />
          <Route path="/games/:gameId"  element={<OddsPage />} />
          <Route path="/saved"          element={<SavedStrategiesPage />} />
        </Route>

        {/* Anything else → landing */}
        <Route path="*" element={<LandingPage />} />
      </Routes>
    </BrowserRouter>
  );
}
