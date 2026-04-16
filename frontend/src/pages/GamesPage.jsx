import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { fetchTeams, fetchGames } from "../api/client.js";

export default function GamesPage() {
  const navigate = useNavigate();

  // Filter state
  const [team, setTeam] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);

  // Data state
  const [teams, setTeams] = useState([]);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Load team list once
  useEffect(() => {
    fetchTeams().then(setTeams).catch(() => {});
  }, []);

  const load = useCallback(
    (p = page) => {
      setLoading(true);
      setError(null);
      fetchGames({ team, dateFrom, dateTo, page: p, pageSize: 50 })
        .then(setResult)
        .catch((e) => setError(e.message))
        .finally(() => setLoading(false));
    },
    [team, dateFrom, dateTo, page]
  );

  // Reload on page change
  useEffect(() => {
    load(page);
  }, [page]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleFilter(e) {
    e.preventDefault();
    setPage(1);
    load(1);
  }

  function handleReset() {
    setTeam("");
    setDateFrom("");
    setDateTo("");
    setPage(1);
    // load with cleared params
    setLoading(true);
    setError(null);
    fetchGames({ page: 1, pageSize: 50 })
      .then(setResult)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }

  const games = result?.games ?? [];
  const totalPages = result?.pages ?? 1;

  return (
    <>
      <h1 className="page-title">Games</h1>

      {/* Filters */}
      <div className="card" style={{ marginBottom: "1.25rem" }}>
        <form className="filters" onSubmit={handleFilter}>
          <div className="filter-group">
            <label>Team</label>
            <select value={team} onChange={(e) => setTeam(e.target.value)}>
              <option value="">All teams</option>
              {teams.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>

          <div className="filter-group">
            <label>From</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
            />
          </div>

          <div className="filter-group">
            <label>To</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
            />
          </div>

          <div className="filter-group" style={{ justifyContent: "flex-end" }}>
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <button type="submit" className="btn btn-primary">Apply</button>
              <button type="button" className="btn btn-ghost" onClick={handleReset}>Reset</button>
            </div>
          </div>
        </form>
      </div>

      {error && <div className="error-msg">{error}</div>}

      {result && (
        <p className="meta">{result.total.toLocaleString()} games found</p>
      )}

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
                  <th>Total</th>
                  <th>Result</th>
                </tr>
              </thead>
              <tbody>
                {games.map((g) => (
                  <tr key={g.game_id} onClick={() => navigate(`/games/${g.game_id}`)}>
                    <td>{g.game_date}</td>
                    <td>{g.home_team}</td>
                    <td>{g.away_team}</td>
                    <td>
                      <strong>{g.home_score}</strong>
                      {" – "}
                      <strong>{g.away_score}</strong>
                    </td>
                    <td>{g.total_score}</td>
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

        {/* Pagination */}
        {!loading && totalPages > 1 && (
          <div className="pagination">
            <button
              className="btn btn-ghost"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              ← Prev
            </button>
            <span>Page {page} of {totalPages}</span>
            <button
              className="btn btn-ghost"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next →
            </button>
          </div>
        )}
      </div>
    </>
  );
}
