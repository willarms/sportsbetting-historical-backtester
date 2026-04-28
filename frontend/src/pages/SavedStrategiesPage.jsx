import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { loadStrategies, removeStrategy, strategyToSearch } from "../utils/strategies.js";
import { bookLabel } from "../utils/bookmakers.js";

const MARKET_LABELS = { h2h: "Moneyline", spreads: "Spread", totals: "Totals" };
const SIDE_LABELS   = { HOME: "Home", AWAY: "Away", OVER: "Over", UNDER: "Under" };

function ParamSummary({ params }) {
  const parts = [];
  if (params.team)     parts.push(params.team);
  if (params.season)   parts.push(params.season);
  if (params.dateFrom || params.dateTo) {
    parts.push([params.dateFrom, params.dateTo].filter(Boolean).join(" → "));
  }
  parts.push(`$${params.stake}/bet`);
  return <span style={{ color: "var(--muted)", fontSize: "0.8rem" }}>{parts.join(" · ")}</span>;
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
      <h1 className="page-title">
        Saved Strategies
        {strategies.length > 0 && (
          <span style={{ marginLeft: "0.75rem", fontSize: "0.9rem", fontWeight: 400, color: "var(--muted)" }}>
            {strategies.length}
          </span>
        )}
      </h1>

      {strategies.length === 0 ? (
        <div className="card">
          <p className="empty">
            No saved strategies yet. Run a backtest and hit <strong>Save Strategy</strong> to save it here.
          </p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          {strategies.map((s) => (
            <div key={s.id} className="card" style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, marginBottom: "0.2rem" }}>
                  {MARKET_LABELS[s.params.market] ?? s.params.market}
                  {" · "}
                  {SIDE_LABELS[s.params.side] ?? s.params.side}
                  {" · "}
                  {bookLabel(s.params.book)}
                </div>
                <ParamSummary params={s.params} />
              </div>
              <div style={{ color: "#3d4460", fontSize: "0.75rem", whiteSpace: "nowrap" }}>
                {new Date(s.savedAt).toLocaleDateString()}
              </div>
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <button className="btn btn-primary" onClick={() => handleRun(s.params)}>
                  Run
                </button>
                <button
                  className="btn btn-ghost"
                  style={{ color: "var(--red)", borderColor: "#450a0a" }}
                  onClick={() => handleDelete(s.id)}
                >
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
