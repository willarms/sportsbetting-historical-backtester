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

function StatTile({ label, value, tone, color }) {
  const cls = "stat-tile" + (tone === "positive" ? " positive" : tone === "negative" ? " negative" : "");
  return (
    <div className={cls}>
      <div className="stat-label">{label}</div>
      <div className="stat-value" style={color ? { color } : undefined}>{value}</div>
    </div>
  );
}

// ── P&L chart helpers ────────────────────────────────────────────────────────

const COLOR_GREEN = "#10b981";
const COLOR_RED   = "#ef4444";

/**
 * Returns the y=0 crossover as a fraction of the chart height (0..1), so a
 * vertical SVG gradient can hard-switch from green (above zero) to red
 * (below zero) at the right place.
 */
function pnlGradientOffset(data) {
  const max = Math.max(...data.map(d => d.cumulative));
  const min = Math.min(...data.map(d => d.cumulative));
  if (max <= 0) return 0;     // entirely in the red
  if (min >= 0) return 1;     // entirely in the green
  return max / (max - min);
}

/** Tooltip whose value text is green/red depending on the hovered point. */
function PnlTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const { cumulative, date, n } = payload[0].payload;
  const positive = cumulative >= 0;
  return (
    <div
      style={{
        background: "#161c27",
        border: "1px solid rgba(255,255,255,0.12)",
        borderRadius: 6,
        padding: "0.5rem 0.7rem",
        fontSize: 12,
        boxShadow: "0 8px 24px rgba(0,0,0,0.35)",
      }}
    >
      <div style={{ color: "#a3acc0", marginBottom: 2 }}>{date ?? `Bet ${n}`}</div>
      <div style={{ color: positive ? COLOR_GREEN : COLOR_RED, fontWeight: 600 }}>
        Cumulative P&amp;L: ${cumulative.toFixed(2)}
      </div>
    </div>
  );
}

/** Cursor dot whose color matches the sign of the hovered cumulative. */
function PnlActiveDot(props) {
  const { cx, cy, payload } = props;
  if (cx == null || cy == null) return null;
  const color = payload.cumulative >= 0 ? COLOR_GREEN : COLOR_RED;
  return (
    <g>
      <circle cx={cx} cy={cy} r={5}   fill={color} fillOpacity={0.18} />
      <circle cx={cx} cy={cy} r={3.5} fill={color} stroke="#0c1119" strokeWidth={1.5} />
    </g>
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

  // Chart data: one point per bet, downsampled when there are a lot of bets so
  // the line reads as a clean trend instead of 2,500 single-bet wiggles.
  // Cumulative is preserved exactly at every sampled point, so accuracy is
  // unchanged; only visual density goes down.
  const CHART_MAX_POINTS = 300;
  const fullSeries = bets.map((b, i) => ({
    n: i + 1, cumulative: b.cumulative, date: b.game_date,
  }));
  const chartData = (() => {
    if (fullSeries.length <= CHART_MAX_POINTS) return fullSeries;
    const step = Math.ceil(fullSeries.length / CHART_MAX_POINTS);
    const sampled = fullSeries.filter((_, i) => i % step === 0);
    const last = fullSeries[fullSeries.length - 1];
    if (sampled[sampled.length - 1].n !== last.n) sampled.push(last);
    return sampled;
  })();

  // Paginated bet history
  const histTotal = bets.length;
  const histPages = Math.ceil(histTotal / HIST_PAGE_SIZE) || 1;
  const histSlice = bets.slice((histPage - 1) * HIST_PAGE_SIZE, histPage * HIST_PAGE_SIZE);

  return (
    <>
      <div className="page-hero">
        <h1>Backtest a Strategy</h1>
        <p>See how a flat-stake betting strategy would have performed against historical NBA closing lines. Filter by team, season, or date range, and save anything worth revisiting.</p>
      </div>

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

          <div className="filter-actions">
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? "Running…" : "Run Backtest"}
            </button>
            {result && !saved && (
              <button type="button" className="btn btn-ghost" onClick={handleSave}>
                Save Strategy
              </button>
            )}
            {saved && (
              <span style={{ color: "var(--green)", fontSize: "0.85rem", fontWeight: 500 }}>
                ✓ Saved
              </span>
            )}
          </div>

        </form>
      </div>

      {loading && (
        <div
          className="backtest-loading"
          role="status"
          aria-live="polite"
          aria-busy="true"
          aria-label="Running backtest"
        >
          <div className="backtest-spinner" />
        </div>
      )}

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
                tone={s.net_profit >= 0 ? "positive" : "negative"}
                color={s.net_profit >= 0 ? "var(--green)" : "var(--red)"}
              />
              <StatTile
                label="ROI"
                value={fmtPercent(s.roi)}
                tone={s.roi >= 0 ? "positive" : "negative"}
                color={s.roi >= 0 ? "var(--green)" : "var(--red)"}
              />
              <StatTile label="Win Rate" value={fmtPercent(s.win_rate)} />
              <StatTile
                label="EV / Bet"
                value={fmtMoney(s.ev_per_bet)}
                color={s.ev_per_bet >= 0 ? "var(--green)" : "var(--red)"}
              />
              <StatTile
                label="Max Drawdown"
                value={fmtMoney(s.max_drawdown)}
                color={s.max_drawdown < 0 ? "var(--red)" : undefined}
              />
              <StatTile label="Volatility" value={`$${s.volatility.toFixed(2)}`} />
            </div>
            <p style={{ marginTop: "0.75rem", fontSize: "0.75rem", color: "var(--text-3)" }}>
              {s.wins}W · {s.losses}L · {s.pushes} push{s.pushes !== 1 ? "es" : ""}
            </p>
          </div>

          {/* ── P&L Chart ── */}
          {bets.length > 0 && (
            <div className="card" style={{ marginBottom: "1.25rem" }}>
              <p className="card-title">Cumulative P&amp;L</p>
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 16 }}>
                  <defs>
                    <linearGradient id="pnl-split" x1="0" y1="0" x2="0" y2="1">
                      <stop offset={pnlGradientOffset(chartData)} stopColor={COLOR_GREEN} />
                      <stop offset={pnlGradientOffset(chartData)} stopColor={COLOR_RED}   />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis
                    dataKey="n"
                    tick={{ fill: "#6b7488", fontSize: 11 }}
                    tickLine={false}
                    axisLine={{ stroke: "rgba(255,255,255,0.08)" }}
                    label={{ value: "Bet #", position: "insideBottom", offset: -8, fill: "#6b7488", fontSize: 11 }}
                  />
                  <YAxis
                    tick={{ fill: "#6b7488", fontSize: 11 }}
                    tickLine={false}
                    axisLine={{ stroke: "rgba(255,255,255,0.08)" }}
                    tickFormatter={v => `$${v}`}
                    width={70}
                  />
                  <Tooltip content={<PnlTooltip />} cursor={{ stroke: "rgba(255,255,255,0.18)", strokeWidth: 1 }} />
                  <ReferenceLine y={0} stroke="#4a5163" strokeDasharray="4 4" />
                  <Line
                    type="natural"
                    dataKey="cumulative"
                    stroke="url(#pnl-split)"
                    dot={false}
                    activeDot={<PnlActiveDot />}
                    strokeWidth={2}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                    isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* ── Bet history ── */}
          <div className="card">
            <p className="card-title">Bet History · {histTotal.toLocaleString()} bets</p>

            {bets.length === 0 ? (
              <p className="empty">No bets matched. Try different filters or a different bookmaker.</p>
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
                          {b.result === "push" && <span className="badge badge-push">Push</span>}
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
