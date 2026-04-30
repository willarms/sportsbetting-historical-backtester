import { useEffect, useState, useCallback } from "react";
import { useNavigate, Link } from "react-router-dom";
import { strategyToSearch, strategyFromApi } from "../utils/strategies.js";
import { bookLabel } from "../utils/bookmakers.js";
import { loadUser } from "../utils/auth.js";
import { fetchUserStrategies, deleteStrategy, apiErrorMessage } from "../api/client.js";

const MARKET_LABELS = { h2h: "Moneyline", spreads: "Spread", totals: "Total" };
const SIDE_LABELS   = { HOME: "Home", AWAY: "Away", OVER: "Over", UNDER: "Under" };

/** Line 2: market · side · book · team · season */
function strategySummaryLine(params) {
  const parts = [
    MARKET_LABELS[params.market] ?? params.market,
    SIDE_LABELS[params.side] ?? params.side,
    bookLabel(params.book),
  ];
  if (params.team)   parts.push(params.team);
  if (params.season) parts.push(params.season);
  return parts.join(" · ");
}

/** Line 3: season · $stake/bet · date range (and optional filter tags) */
function strategyMetaLine(params) {
  const parts = [];
  if (params.season) parts.push(params.season);
  parts.push(`$${params.stake}/bet`);
  let datePart = "—";
  if (params.dateFrom && params.dateTo) datePart = `${params.dateFrom} → ${params.dateTo}`;
  else if (params.dateFrom) datePart = `${params.dateFrom} → …`;
  else if (params.dateTo) datePart = `… → ${params.dateTo}`;
  else datePart = "All Games";
  parts.push(datePart);
  if (params.posEV_only) parts.push("pos EV");
  if (params.fade_btbs) parts.push("no BTB");
  return parts.join(" · ");
}

export default function SavedStrategiesPage() {
  const navigate = useNavigate();
  const user = loadUser();
  const [strategies, setStrategies] = useState([]);
  const [loading, setLoading] = useState(!!user?.userID);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    if (!user?.userID) {
      setStrategies([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const rows = await fetchUserStrategies(user.userID);
      setStrategies(rows.map(strategyFromApi));
    } catch (e) {
      setError(apiErrorMessage(e));
      setStrategies([]);
    } finally {
      setLoading(false);
    }
  }, [user?.userID]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function handleDelete(strategyID) {
    if (!window.confirm("Delete this saved strategy?")) return;
    try {
      await deleteStrategy(strategyID);
      setStrategies((list) => list.filter((s) => s.strategyID !== strategyID));
    } catch (e) {
      setError(apiErrorMessage(e));
    }
  }

  function handleRun(params) {
    navigate(`/backtest?${strategyToSearch(params)}`);
  }

  if (!user?.userID) {
    return (
      <>
        <div className="page-hero">
          <h1>Saved Strategies</h1>
          <p>Sign in to save backtests to your account and open them from any device.</p>
        </div>
        <div className="card">
          <p className="empty">
            <Link to="/login">Log in</Link>
            {" · "}
            <Link to="/register">Create an account</Link>
          </p>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="page-hero">
        <h1>
          Saved Strategies
          {strategies.length > 0 && <span className="count">{strategies.length}</span>}
        </h1>
        <p>Strategies stored in your account. One click re-runs them with the latest data.</p>
      </div>

      {error && <div className="error-msg">{error}</div>}

      {loading ? (
        <p className="loading">Loading strategies…</p>
      ) : strategies.length === 0 ? (
        <div className="card">
          <p className="empty">
            No saved strategies yet. Run a backtest, then use <strong>Save Strategy</strong> to store it here.
          </p>
        </div>
      ) : (
        <div className="strategy-list">
          {strategies.map((s) => (
            <div key={s.strategyID} className="strategy-row">
              <div className="strategy-meta">
                <div className="strategy-title">
                  {s.strategyName}
                </div>
                <div className="strategy-detail">
                  {strategySummaryLine(s.params)}
                </div>
                <span className="strategy-sub">{strategyMetaLine(s.params)}</span>
              </div>
              <div className="strategy-date">
                {s.savedAt ? new Date(s.savedAt).toLocaleDateString() : "—"}
              </div>
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <button type="button" className="btn btn-primary" onClick={() => handleRun(s.params)}>
                  Run
                </button>
                <button type="button" className="btn btn-danger" onClick={() => handleDelete(s.strategyID)}>
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
