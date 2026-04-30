import { useEffect, useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { bookLabel } from "../utils/bookmakers.js";
import { fmtOdds, fmtLine, fmtMargin } from "../utils/formatting.js";
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

function normOutcome(row) {
  return String(row.outcome_label ?? "").trim().toUpperCase();
}

/** Split rows into two columns: home vs away, or over vs under when applicable. */
function partitionOddsForMarket(market, rows, homeTeam, awayTeam) {
  const homeRows = rows.filter((r) => normOutcome(r) === "HOME");
  const awayRows = rows.filter((r) => normOutcome(r) === "AWAY");
  const overRows = rows.filter((r) => normOutcome(r) === "OVER");
  const underRows = rows.filter((r) => normOutcome(r) === "UNDER");

  if (market === "h2h" || market === "spreads") {
    return {
      mode: "split",
      left: homeRows,
      right: awayRows,
      leftTitle: homeTeam,
      rightTitle: awayTeam,
    };
  }

  if (market === "totals") {
    return {
      mode: "split",
      left: overRows,
      right: underRows,
      leftTitle: "Over",
      rightTitle: "Under",
    };
  }

  if (market === "player_points") {
    if (overRows.length + underRows.length === rows.length && rows.length > 0) {
      return {
        mode: "split",
        left: overRows,
        right: underRows,
        leftTitle: "Over",
        rightTitle: "Under",
      };
    }
  }

  if (homeRows.length + awayRows.length === rows.length && rows.length > 0) {
    return {
      mode: "split",
      left: homeRows,
      right: awayRows,
      leftTitle: homeTeam,
      rightTitle: awayTeam,
    };
  }

  if (overRows.length + underRows.length === rows.length && rows.length > 0) {
    return {
      mode: "split",
      left: overRows,
      right: underRows,
      leftTitle: "Over",
      rightTitle: "Under",
    };
  }

  return { mode: "single", rows };
}

function OddsTable({ rows, showOutcome }) {
  if (!rows.length) {
    return <p className="odds-split-empty">No lines</p>;
  }
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Bookmaker</th>
            {showOutcome ? <th>Outcome</th> : null}
            <th>Line</th>
            <th>Odds (American)</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={`${row.bookmaker}-${row.outcome_label}-${row.line_value}-${i}`}>
              <td>{bookLabel(row.bookmaker)}</td>
              {showOutcome ? <td>{row.outcome_label}</td> : null}
              <td>{row.line_value ?? "–"}</td>
              <td style={{ fontWeight: 600, color: row.price > 0 ? "var(--green)" : "var(--red)" }}>
                {formatOdds(row.price)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
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

  const sortedByMarket = useMemo(() => {
    const byMarket = odds.reduce((acc, row) => {
      const key = row.market_type;
      if (!acc[key]) acc[key] = [];
      acc[key].push(row);
      return acc;
    }, {});
    for (const key of Object.keys(byMarket)) {
      byMarket[key].sort((a, b) => {
        const bk = bookLabel(a.bookmaker).localeCompare(bookLabel(b.bookmaker));
        if (bk !== 0) return bk;
        return String(a.outcome_label ?? "").localeCompare(String(b.outcome_label ?? ""));
      });
    }
    return byMarket;
  }, [odds]);

  if (loading) return <p className="loading">Loading…</p>;
  if (error) return <div className="error-msg">{error}</div>;
  if (!game) return null;

  const marketOrder = ["h2h", "spreads", "totals", "player_points"];
  const markets = [
    ...marketOrder.filter((m) => sortedByMarket[m]?.length),
    ...Object.keys(sortedByMarket).filter((m) => !marketOrder.includes(m)),
  ];

  const homeWon = !!game.home_win;
  const lines = game.lines;

  return (
    <>
      <Link to="/games" className="back-link">← Back to games</Link>

      <div className="page-hero">
        <h1>
          {game.away_team} @ {game.home_team}
        </h1>
        <p className="meta" style={{ marginBottom: 0 }}>
          {game.game_date}
          {game.season ? ` · Season ${game.season}` : ""}
        </p>
      </div>

      <div className="card game-header" style={{ marginBottom: "1.25rem" }}>
        <span className="team-name">{game.home_team}</span>
        <span className={"score" + (homeWon ? " win" : "")}>{game.home_score}</span>
        <span className="at">vs</span>
        <span className={"score" + (!homeWon ? " win" : "")}>{game.away_score}</span>
        <span className="team-name">{game.away_team}</span>
        <span style={{ marginLeft: "auto", color: "var(--text-3)", fontSize: "0.85rem", display: "inline-flex", alignItems: "center", gap: "0.5rem" }}>
          Final
          {homeWon
            ? <span className="badge badge-win">Home W</span>
            : <span className="badge badge-loss">Away W</span>}
        </span>
      </div>

      <div className="card" style={{ marginBottom: "1.25rem" }}>
        <p className="market-title">Consensus closing lines</p>
        {lines ? (
          <>
            <p className="meta" style={{ marginTop: "-0.35rem" }}>Source: {lines.bookmaker}</p>
            <div className="stats-grid">
              <div className={"stat-tile" + (lines.ml_home_hit ? " positive" : " negative")}>
                <div className="stat-label">Moneyline · home</div>
                <div className="stat-value" style={{ fontSize: "1.15rem" }}>{fmtOdds(lines.ml_home)}</div>
              </div>
              <div className={"stat-tile" + (!lines.ml_home_hit ? " positive" : " negative")}>
                <div className="stat-label">Moneyline · away</div>
                <div className="stat-value" style={{ fontSize: "1.15rem" }}>{fmtOdds(lines.ml_away)}</div>
              </div>
              <div
                className={
                  "stat-tile" +
                  (lines.spread_line != null
                    ? lines.spread_home_covered
                      ? " positive"
                      : " negative"
                    : "")
                }
              >
                <div className="stat-label">Spread (home)</div>
                <div className="stat-value" style={{ fontSize: "1.05rem" }}>
                  {lines.spread_line != null ? (
                    <>
                      {fmtLine(lines.spread_line)}
                      {" "}
                      <span style={{ fontWeight: 600, fontSize: "0.95rem" }}>
                        {lines.spread_home_covered ? "✓" : "✗"} {fmtMargin(lines.spread_margin)}
                      </span>
                    </>
                  ) : "–"}
                </div>
              </div>
              <div
                className={
                  "stat-tile" +
                  (lines.total_line != null
                    ? lines.total_went_over
                      ? " positive"
                      : " negative"
                    : "")
                }
              >
                <div className="stat-label">Total O/U</div>
                <div className="stat-value" style={{ fontSize: "1.05rem" }}>
                  {lines.total_line != null ? (
                    <>
                      {lines.total_line}
                      {" "}
                      <span style={{ fontWeight: 600, fontSize: "0.95rem" }}>
                        {lines.total_went_over ? "O" : "U"} {fmtMargin(lines.total_margin)}
                      </span>
                    </>
                  ) : "–"}
                </div>
              </div>
            </div>
          </>
        ) : (
          <p className="empty" style={{ padding: "1rem 0" }}>No consensus line data for this game.</p>
        )}
      </div>

      {markets.length === 0 ? (
        <div className="card">
          <p className="empty" style={{ padding: "2rem 0" }}>No odds data for this game.</p>
        </div>
      ) : (
        markets.map((market) => {
          const rows = sortedByMarket[market];
          const part = partitionOddsForMarket(market, rows, game.home_team, game.away_team);
          return (
            <div key={market} className="card market-section" style={{ marginTop: "1rem" }}>
              <p className="market-title">{MARKET_LABELS[market] ?? market}</p>
              <p className="meta" style={{ marginTop: "-0.35rem", marginBottom: "0.85rem" }}>
                All book odds by market
              </p>
              {part.mode === "split" ? (
                <div className="odds-split">
                  <div className="odds-split-col">
                    <p className="odds-split-heading">{part.leftTitle}</p>
                    <OddsTable rows={part.left} showOutcome={false} />
                  </div>
                  <div className="odds-split-col">
                    <p className="odds-split-heading">{part.rightTitle}</p>
                    <OddsTable rows={part.right} showOutcome={false} />
                  </div>
                </div>
              ) : (
                <OddsTable rows={part.rows} showOutcome />
              )}
            </div>
          );
        })
      )}
    </>
  );
}
