import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { fetchGame, fetchGameOdds } from "../api/client.js";

const MARKET_LABELS = {
  h2h: "Moneyline (h2h)",
  spreads: "Spreads",
  totals: "Totals",
  player_points: "Player Points",
};

function formatOdds(price) {
  if (price == null) return "–";
  return price > 0 ? `+${price}` : `${price}`;
}

export default function OddsPage() {
  const { gameId } = useParams();
  const [game, setGame] = useState(null);
  const [odds, setOdds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    setLoading(true);
    Promise.all([fetchGame(gameId), fetchGameOdds(gameId)])
      .then(([g, o]) => {
        setGame(g);
        setOdds(o);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [gameId]);

  if (loading) return <p className="loading">Loading…</p>;
  if (error) return <div className="error-msg">{error}</div>;
  if (!game) return null;

  // Group odds by market type
  const byMarket = odds.reduce((acc, row) => {
    const key = row.market_type;
    if (!acc[key]) acc[key] = [];
    acc[key].push(row);
    return acc;
  }, {});

  const marketOrder = ["h2h", "spreads", "totals", "player_points"];
  const markets = [
    ...marketOrder.filter((m) => byMarket[m]),
    ...Object.keys(byMarket).filter((m) => !marketOrder.includes(m)),
  ];

  return (
    <>
      <Link to="/" className="back-link">← Back to games</Link>

      {/* Game header */}
      <div className="card game-header">
        <span className="team-name">{game.home_team}</span>
        <span className="score">{game.home_score}</span>
        <span className="at">vs</span>
        <span className="score">{game.away_score}</span>
        <span className="team-name">{game.away_team}</span>
        <span style={{ marginLeft: "auto", color: "#64748b", fontSize: "0.85rem" }}>
          {game.game_date}
          {game.home_win
            ? <span className="badge badge-win" style={{ marginLeft: "0.5rem" }}>Home W</span>
            : <span className="badge badge-loss" style={{ marginLeft: "0.5rem" }}>Away W</span>}
        </span>
      </div>

      {markets.length === 0 ? (
        <p className="empty" style={{ marginTop: "1.5rem" }}>No odds data for this game.</p>
      ) : (
        markets.map((market) => (
          <div key={market} className="card market-section" style={{ marginTop: "1rem" }}>
            <p className="market-title">{MARKET_LABELS[market] ?? market}</p>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Bookmaker</th>
                    <th>Outcome</th>
                    <th>Line</th>
                    <th>Odds (American)</th>
                  </tr>
                </thead>
                <tbody>
                  {byMarket[market].map((row, i) => (
                    <tr key={i} style={{ cursor: "default" }}>
                      <td style={{ textTransform: "capitalize" }}>{row.bookmaker}</td>
                      <td>{row.outcome_label}</td>
                      <td>{row.line_value ?? "–"}</td>
                      <td style={{ fontWeight: 600, color: row.price > 0 ? "#4ade80" : "#f87171" }}>
                        {formatOdds(row.price)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))
      )}
    </>
  );
}
