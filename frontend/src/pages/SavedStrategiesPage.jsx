import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { loadStrategies, removeStrategy, strategyToSearch } from "../utils/strategies.js";
import { bookLabel } from "../utils/bookmakers.js";

const MARKET_LABELS = { h2h: "Moneyline", spreads: "Spread", totals: "Totals" };
const SIDE_LABELS   = { HOME: "Home", AWAY: "Away", OVER: "Over", UNDER: "Under" };

function ParamSummary({ params }) {
  const parts = [];
  if (params.team)   parts.push(params.team);
  if (params.season) parts.push(params.season);
  if (params.dateFrom || params.dateTo) {
    parts.push([params.dateFrom, params.dateTo].filter(Boolean).join(" → "));
  }
  parts.push(`$${params.stake}/bet`);
  return <span className="strategy-sub">{parts.join(" · ")}</span>;
}

export default function SavedStrategiesPage() {
  const navigate = useNavigate();
  const [strategies, setStrategies] = useState(() => loadStrategies());

  function handleDelete(id) {
    setStrategies(removeStrategy(id));
  }

  function handleRun(params) {
    navigate(`/backtest?${strategyToSearch(params)}`);
  }

  return (
    <>
      <div className="page-hero">
        <h1>
          Saved Strategies
          {strategies.length > 0 && <span className="count">{strategies.length}</span>}
        </h1>
        <p>Strategies you've saved from the Backtest page. One click re-runs them against the latest data.</p>
      </div>

      {strategies.length === 0 ? (
        <div className="card">
          <p className="empty">
            No saved strategies yet. Run a backtest and hit <strong>Save Strategy</strong> to save it here.
          </p>
        </div>
      ) : (
        <div className="strategy-list">
          {strategies.map((s) => (
            <div key={s.id} className="strategy-row">
              <div className="strategy-meta">
                <div className="strategy-title">
                  {MARKET_LABELS[s.params.market] ?? s.params.market}
                  {" · "}
                  {SIDE_LABELS[s.params.side] ?? s.params.side}
                  {" · "}
                  {bookLabel(s.params.book)}
                </div>
                <ParamSummary params={s.params} />
              </div>
              <div className="strategy-date">
                {new Date(s.savedAt).toLocaleDateString()}
              </div>
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <button className="btn btn-primary" onClick={() => handleRun(s.params)}>
                  Run
                </button>
                <button className="btn btn-danger" onClick={() => handleDelete(s.id)}>
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
