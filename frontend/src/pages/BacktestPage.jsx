import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ReferenceLine, ResponsiveContainer,
} from "recharts";

import { runBacktest, fetchTeams, fetchSeasons, fetchBookmakers } from "../api/client.js";
import { bookLabel, BOOK_LABELS }  from "../utils/bookmakers.js";
import { fmtOdds, fmtLine, fmtMoney, fmtPercent } from "../utils/formatting.js";
import { addStrategy } from "../utils/strategies.js";

// ── Constants ────────────────────────────────────────────────────────────────

const SIDE_OPTIONS = {
  h2h:     [{ value: "HOME", label: "Home (ML)"     }, { value: "AWAY",  label: "Away (ML)"     }],
  spreads: [{ value: "HOME", label: "Home (spread)" }, { value: "AWAY",  label: "Away (spread)"  }],
  totals:  [{ value: "OVER", label: "Over"          }, { value: "UNDER", label: "Under"          }],
};

const MARKET_LABELS = { h2h: "Moneyline", spreads: "Spread", totals: "Totals" };

const HIST_PAGE_SIZE = 50;

const DEFAULT_FORM = {
  market: "h2h", side: "HOME", book: "draftkings",
  stake: 100, team: "", season: "", dateFrom: "", dateTo: "",
};

// ── Stat tile ────────────────────────────────────────────────────────────────

function StatTile({ label, value, color }) {
  return (
    <div className="stat-tile">
      <div className="stat-label">{label}</div>
      <div className="stat-value" style={color ? { color } : undefined}>{value}</div>
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────

export default function BacktestPage() {
  const [searchParams] = useSearchParams();

  const [form, setForm]       = useState(() => {
    // Pre-fill from URL params if navigating from a saved strategy
    const p = Object.fromEntries(searchParams.entries());
    if (!p.market) return DEFAULT_FORM;
    return {
      market:   p.market   ?? DEFAULT_FORM.market,
      side:     p.side     ?? SIDE_OPTIONS[p.market ?? "h2h"][0].value,
      book:     p.book     ?? DEFAULT_FORM.book,
      stake:    Number(p.stake ?? DEFAULT_FORM.stake),
      team:     p.team     ?? "",
      season:   p.season   ?? "",
      dateFrom: p.date_from ?? "",
      dateTo:   p.date_to   ?? "",
    };
  });

  const [result, setResult]     = useState(null);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState(null);
  const [histPage, setHistPage] = useState(1);
  const [saved, setSaved]       = useState(false);

  const [teams, setTeams]         = useState([]);
  const [seasons, setSeasons]     = useState([]);
  const [bookmakers, setBookmakers] = useState([]);

  useEffect(() => {
    fetchTeams().then(setTeams).catch(() => {});
    fetchSeasons().then(setSeasons).catch(() => {});
    fetchBookmakers().then(setBookmakers).catch(() => {});
  }, []);

  // Auto-run if we arrived via saved strategy URL params
  useEffect(() => {
    if (searchParams.has("market")) {
      handleRun();
    }
  }, []); // eslint-disable-line

  function handleMarketChange(e) {
    const m = e.target.value;
    setForm(f => ({ ...f, market: m, side: SIDE_OPTIONS[m][0].value }));
  }

  function handleField(e) {
    const { name, value } = e.target;
    setForm(f => ({ ...f, [name]: name === "stake" ? Number(value) : value }));
  }

  function handleRun(e) {
    e?.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);
    setSaved(false);
    setHistPage(1);
    runBacktest({
      market: form.market, side: form.side, book: form.book, stake: form.stake,
      team: form.team || undefined, season: form.season || undefined,
      dateFrom: form.dateFrom || undefined, dateTo: form.dateTo || undefined,
    })
      .then(setResult)
      .catch(e => setError(e.response?.data?.detail ?? e.message))
      .finally(() => setLoading(false));
  }

  function handleSave() {
    addStrategy({ ...form, stake: Number(form.stake) });
    setSaved(true);
  }

  const s = result?.stats;
  const bets = result?.bets ?? [];

  // Chart data — one point per bet
  const chartData = bets.map((b, i) => ({
    n: i + 1, cumulative: b.cumulative, date: b.game_date,
  }));

  // Paginated bet history
  const histTotal = bets.length;
  const histPages = Math.ceil(histTotal / HIST_PAGE_SIZE) || 1;
  const histSlice = bets.slice((histPage - 1) * HIST_PAGE_SIZE, histPage * HIST_PAGE_SIZE);

  return (
    <>
      <h1 className="page-title">Backtest a Strategy</h1>

      {/* ── Strategy form ── */}
      <div className="card" style={{ marginBottom: "1.25rem" }}>
        <form className="filters" onSubmit={handleRun}>

          <div className="filter-group">
            <label>Market</label>
            <select name="market" value={form.market} onChange={handleMarketChange}>
              {Object.entries(MARKET_LABELS).map(([v, l]) =>
                <option key={v} value={v}>{l}</option>
              )}
            </select>
          </div>

          <div className="filter-group">
            <label>Side</label>
            <select name="side" value={form.side} onChange={handleField}>
              {SIDE_OPTIONS[form.market].map(o =>
                <option key={o.value} value={o.value}>{o.label}</option>
              )}
            </select>
          </div>

          <div className="filter-group">
            <label>Book</label>
            <select name="book" value={form.book} onChange={handleField}>
              <option value="consensus">Consensus (avg)</option>
              {bookmakers.map(b =>
                <option key={b} value={b}>{bookLabel(b)}</option>
              )}
            </select>
          </div>

          <div className="filter-group">
            <label>Stake ($)</label>
            <input
              type="number" name="stake" value={form.stake} min="1" step="1"
              onChange={handleField}
              style={{ width: "80px" }}
            />
          </div>

          <div className="filter-group">
            <label>Team</label>
            <select name="team" value={form.team} onChange={handleField}>
              <option value="">All teams</option>
              {teams.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>

          <div className="filter-group">
            <label>Season</label>
            <select name="season" value={form.season} onChange={handleField}>
              <option value="">All seasons</option>
              {seasons.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          <div className="filter-group">
            <label>From</label>
            <input type="date" name="dateFrom" value={form.dateFrom} onChange={handleField} />
          </div>

          <div className="filter-group">
            <label>To</label>
            <input type="date" name="dateTo" value={form.dateTo} onChange={handleField} />
          </div>

          <div className="filter-group" style={{ justifyContent: "flex-end" }}>
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <button type="submit" className="btn btn-primary" disabled={loading}>
                {loading ? "Running…" : "Run Backtest"}
              </button>
              {result && !saved && (
                <button type="button" className="btn btn-ghost" onClick={handleSave}>
                  Save Strategy
                </button>
              )}
              {saved && (
                <span style={{ alignSelf: "center", color: "var(--green)", fontSize: "0.85rem" }}>
                  ✓ Saved
                </span>
              )}
            </div>
          </div>

        </form>
      </div>

      {error && <div className="error-msg">{error}</div>}

      {result && (
        <>
          <p className="meta">
            {MARKET_LABELS[result.params.market]} · {result.params.side} ·{" "}
            {bookLabel(result.params.book)} · ${result.params.stake}/bet
            {result.params.team   ? ` · ${result.params.team}`   : ""}
            {result.params.season ? ` · ${result.params.season}` : ""}
          </p>

          {/* ── Stats grid ── */}
          <div className="card" style={{ marginBottom: "1.25rem" }}>
            <div className="stats-grid">
              <StatTile label="Total Bets"    value={s.total_bets.toLocaleString()} />
              <StatTile label="Total Wagered" value={fmtMoney(s.total_wagered)} />
              <StatTile
                label="Net Profit"
                value={fmtMoney(s.net_profit)}
                color={s.net_profit >= 0 ? "var(--green)" : "var(--red)"}
              />
              <StatTile
                label="ROI"
                value={fmtPercent(s.roi)}
                color={s.roi >= 0 ? "var(--green)" : "var(--red)"}
              />
              <StatTile label="Win Rate"    value={fmtPercent(s.win_rate)} />
              <StatTile label="EV / Bet"    value={fmtMoney(s.ev_per_bet)}
                color={s.ev_per_bet >= 0 ? "var(--green)" : "var(--red)"} />
              <StatTile label="Max Drawdown" value={fmtMoney(s.max_drawdown)}
                color={s.max_drawdown < 0 ? "var(--red)" : undefined} />
              <StatTile label="Volatility"  value={`$${s.volatility.toFixed(2)}`} />
            </div>
            <p style={{ marginTop: "0.75rem", fontSize: "0.75rem", color: "#64748b" }}>
              {s.wins}W · {s.losses}L · {s.pushes} push{s.pushes !== 1 ? "es" : ""}
            </p>
          </div>

          {/* ── P&L Chart ── */}
          {bets.length > 0 && (
            <div className="card" style={{ marginBottom: "1.25rem" }}>
              <p className="market-title" style={{ marginBottom: "0.75rem" }}>Cumulative P&amp;L</p>
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 16 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#2d3150" />
                  <XAxis
                    dataKey="n"
                    tick={{ fill: "#64748b", fontSize: 11 }}
                    tickLine={false}
                    label={{ value: "Bet #", position: "insideBottom", offset: -8, fill: "#64748b", fontSize: 11 }}
                  />
                  <YAxis
                    tick={{ fill: "#64748b", fontSize: 11 }}
                    tickLine={false}
                    tickFormatter={v => `$${v}`}
                    width={70}
                  />
                  <Tooltip
                    contentStyle={{ background: "#1a1d2e", border: "1px solid #2d3150", borderRadius: 6, fontSize: 12 }}
                    labelStyle={{ color: "#94a3b8" }}
                    formatter={v => [`$${v.toFixed(2)}`, "Cumulative P&L"]}
                    labelFormatter={(n, payload) => payload?.[0]?.payload?.date ?? `Bet ${n}`}
                  />
                  <ReferenceLine y={0} stroke="#3d4460" strokeDasharray="4 4" />
                  <Line
                    type="monotone"
                    dataKey="cumulative"
                    stroke={s.net_profit >= 0 ? "var(--green)" : "var(--red)"}
                    dot={false}
                    strokeWidth={2}
                    isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* ── Bet history ── */}
          <div className="card">
            <p className="market-title" style={{ marginBottom: "0.75rem" }}>
              Bet History ({histTotal.toLocaleString()} bets)
            </p>

            {bets.length === 0 ? (
              <p className="empty">No bets matched — try different filters or a different bookmaker.</p>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Matchup</th>
                      <th>Odds</th>
                      <th>Line</th>
                      <th>Result</th>
                      <th>Profit</th>
                      <th>Cumulative</th>
                    </tr>
                  </thead>
                  <tbody>
                    {histSlice.map((b, i) => (
                      <tr key={i} style={{ cursor: "default" }}>
                        <td style={{ whiteSpace: "nowrap" }}>{b.game_date}</td>
                        <td style={{ fontSize: "0.8rem" }}>
                          {b.home_team} <span style={{ color: "var(--muted)" }}>vs</span> {b.away_team}
                        </td>
                        <td>{fmtOdds(b.odds)}</td>
                        <td>{b.line != null ? fmtLine(b.line) : "–"}</td>
                        <td>
                          {b.result === "win"  && <span className="badge badge-win">Win</span>}
                          {b.result === "loss" && <span className="badge badge-loss">Loss</span>}
                          {b.result === "push" && <span className="badge" style={{ background:"#1e2235", color:"#94a3b8" }}>Push</span>}
                        </td>
                        <td style={{ color: b.profit >= 0 ? "var(--green)" : "var(--red)", fontWeight: 600 }}>
                          {fmtMoney(b.profit)}
                        </td>
                        <td style={{ color: b.cumulative >= 0 ? "var(--green)" : "var(--red)" }}>
                          {fmtMoney(b.cumulative)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {histPages > 1 && (
              <div className="pagination">
                <button className="btn btn-ghost" disabled={histPage <= 1} onClick={() => setHistPage(p => p - 1)}>
                  ← Prev
                </button>
                <span>Page {histPage} of {histPages}</span>
                <button className="btn btn-ghost" disabled={histPage >= histPages} onClick={() => setHistPage(p => p + 1)}>
                  Next →
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </>
  );
}
