import { BrowserRouter, Routes, Route, NavLink } from "react-router-dom";
import GamesPage from "./pages/GamesPage.jsx";
import OddsPage from "./pages/OddsPage.jsx";

function Navbar() {
  return (
    <header className="navbar">
      <span className="brand">NBA Backtester</span>
      <nav style={{ display: "flex", gap: "1.25rem" }}>
        <NavLink to="/" end>Games</NavLink>
      </nav>
    </header>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <div className="shell">
        <Navbar />
        <main className="page">
          <Routes>
            <Route path="/" element={<GamesPage />} />
            <Route path="/games/:gameId" element={<OddsPage />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}
