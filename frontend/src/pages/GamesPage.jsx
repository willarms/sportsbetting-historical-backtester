import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { fetchTeams, fetchSeasons, fetchBookmakers, fetchGames } from "../api/client.js";
import { BOOK_LABELS, bookLabel } from "../utils/bookmakers.js";
import { fmtOdds, fmtLine, fmtMargin } from "../utils/formatting.js";

// ── Cells for each betting market ───────────────────────────────────────────

function MLCell({ lines }) {
  if (!lines || lines.ml_home == null) return <td className="no-odds">–</td>;
  const { ml_home, ml_away, ml_home_hit } = lines;
  return (
    <td>
      <span style={{ color: ml_home_hit ? "var(--green)" : "var(--muted)", fontWeight: ml_home_hit ? 600 : 400 }}>
        H {fmtOdds(ml_home)}
      </span>
      <span style={{ color: "var(--muted)", margin: "0 4px" }}>/</span>
      <span style={{ color: !ml_home_hit ? "var(--green)" : "var(--muted)", fontWeight: !ml_home_hit ? 600 : 400 }}>
        A {fmtOdds(ml_away)}
      </span>
    </td>
  );
}

function SpreadCell({ lines }) {
  if (!lines || lines.spread_line == null) return <td className="no-odds">–</td>;
  const { spread_line, spread_home_covered, spread_margin } = lines;
  const hit = spread_home_covered;
  return (
    <td>
      <span style={{ color: "var(--text-dim)" }}>H {fmtLine(spread_line)}</span>
      {" "}
      <span style={{ color: hit ? "var(--green)" : "var(--red)", fontWeight: 600 }}>
        {hit ? "✓" : "✗"} {fmtMargin(spread_margin)}
      </span>
    </td>
  );
}

function TotalCell({ lines }) {
  if (!lines || lines.total_line == null) return <td className="no-odds">–</td>;
  const { total_line, total_went_over, total_margin } = lines;
  return (
    <td>
      <span style={{ color: "var(--text-dim)" }}>{total_line}</span>
      {" "}
      <span style={{ color: total_went_over ? "var(--green)" : "var(--red)", fontWeight: 600 }}>
        {total_went_over ? "O" : "U"} {fmtMargin(total_margin)}
      </span>
    </td>
  );
}

// ── Main page ───────────────────────────────────────────────────────────────

export default function GamesPage() {
  const navigate = useNavigate();

  const [team, setTeam]         = useState("");
  const [season, setSeason]     = useState("");
  const [book, setBook]         = useState("draftkings");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo]     = useState("");
  const [page, setPage]         = useState(1);

  const [teams, setTeams]         = useState([]);
  const [seasons, setSeasons]     = useState([]);
  const [bookmakers, setBookmakers] = useState([]);
  const [result, setResult]       = useState(null);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState(null);

  useEffect(() => {
    fetchTeams().then(setTeams).catch(() => {});
    fetchSeasons().then(setSeasons).catch(() => {});
    fetchBookmakers().then(setBookmakers).catch(() => {});
  }, []);

  const load = useCallback((p = 1, overrides = {}) => {
    const params = { team, season, book, dateFrom, dateTo, page: p, pageSize: 50, ...overrides };
    setLoading(true);
    setError(null);
    fetchGames(params)
      .then(setResult)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [team, season, book, dateFrom, dateTo]);

  // Re-fetch whenever page changes OR whenever any filter changes (load recreates when filters change)
  useEffect(() => { load(page); }, [page, load]); // eslint-disable-line

  function handleFilter(e) {
    e.preventDefault();
    setPage(1);
    load(1);
  }

  function handleReset() {
    setTeam(""); setSeason(""); setBook("draftkings"); setDateFrom(""); setDateTo("");
    setPage(1);
    setLoading(true);
    setError(null);
    fetchGames({ book: "draftkings", page: 1, pageSize: 50 })
      .then(setResult)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }

  const games      = result?.games ?? [];
  const totalPages = result?.pages ?? 1;

  return (
    <>
      <div className="page-hero">
        <h1>
          Games
          {result && <span className="count">{result.total.toLocaleString()} total</span>}
        </h1>
        <p>Browse historical NBA games with closing-line odds across major books. Click a row to see every bookmaker's price.</p>
      </div>

      {/* Filters */}
      <div className="card" style={{ marginBottom: "1.25rem" }}>
        <form className="filters" onSubmit={handleFilter}>
          <div className="filter-group">
            <label>Team</label>
            <select value={team} onChange={(e) => setTeam(e.target.value)}>
              <option value="">All teams</option>
              {teams.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>

          <div className="filter-group">
            <label>Season</label>
            <select value={season} onChange={(e) => setSeason(e.target.value)}>
              <option value="">All seasons</option>
              {seasons.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          <div className="filter-group">
            <label>Odds from</label>
            <select value={book} onChange={(e) => setBook(e.target.value)}>
              <option value="consensus">Consensus (avg)</option>
              {bookmakers.map((b) => (
                <option key={b} value={b}>{bookLabel(b)}</option>
              ))}
            </select>
          </div>

          <div className="filter-group">
            <label>From</label>
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          </div>

          <div className="filter-group">
            <label>To</label>
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </div>

          <div className="filter-actions">
            <button type="submit" className="btn btn-primary">Apply</button>
            <button type="button" className="btn btn-ghost" onClick={handleReset}>Reset</button>
          </div>
        </form>
      </div>

      {error && <div className="error-msg">{error}</div>}

      <div className="card">
        {loading ? (
          <p className="loading">Loading…</p>
        ) : games.length === 0 ? (
          <p className="empty">No games match the current filters.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Home</th>
                  <th>Away</th>
                  <th>Score</th>
                  <th title="Opening moneyline (DraftKings preferred). Bold = winner.">Moneyline</th>
                  <th title="Home team spread. ✓/✗ = covered/missed, number = by how much.">Spread (H)</th>
                  <th title="Over/under line. O/U = result, number = by how much.">Total O/U</th>
                  <th>Result</th>
                </tr>
              </thead>
              <tbody>
                {games.map((g) => (
                  <tr key={g.game_id} className="clickable" onClick={() => navigate(`/games/${g.game_id}`)}>
                    <td style={{ whiteSpace: "nowrap" }}>{g.game_date}</td>
                    <td>{g.home_team}</td>
                    <td>{g.away_team}</td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      <strong>{g.home_score}</strong>–<strong>{g.away_score}</strong>
                    </td>
                    <MLCell    lines={g.lines} />
                    <SpreadCell lines={g.lines} />
                    <TotalCell  lines={g.lines} />
                    <td>
                      {g.home_win
                        ? <span className="badge badge-win">Home W</span>
                        : <span className="badge badge-loss">Away W</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!loading && totalPages > 1 && (
          <div className="pagination">
            <button className="btn btn-ghost" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              ← Prev
            </button>
            <span>Page {page} of {totalPages}</span>
            <button className="btn btn-ghost" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
              Next →
            </button>
          </div>
        )}
      </div>
    </>
  );
}
