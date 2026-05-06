import { bookLabel } from "./bookmakers.js";

const MARKET_LABELS = { h2h: "ML", spreads: "Spread", totals: "Total" };
const SIDE_LABELS   = { HOME: "Home", AWAY: "Away", OVER: "Over", UNDER: "Under" };

export function strategyLabel(params) {
  const parts = [
    MARKET_LABELS[params.market] ?? params.market,
    SIDE_LABELS[params.side]     ?? params.side,
    bookLabel(params.book),
  ];
  if (params.team)   parts.push(params.team);
  if (params.season) parts.push(params.season);
  return parts.join(" · ");
}

/** Normalize Oracle / API date strings to YYYY-MM-DD for <input type="date"> */
function isoDatePart(s) {
  if (!s) return "";
  const m = String(s).match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : "";
}

/**
 * Form state (BacktestPage) → API query string for /backtest.
 * Uses snake_case keys the backend expects.
 */
export function strategyToSearch(params) {
  const p = new URLSearchParams();
  const set = (k, v) => {
    if (v === "" || v == null || v === false) return;
    p.set(k, String(v));
  };
  set("market", params.market);
  set("side", params.side);
  set("book", params.book);
  set("stake", params.stake);
  set("team", params.team);
  set("season", params.season);
  set("date_from", params.dateFrom);
  set("date_to", params.dateTo);
  if (params.posEV_only) p.set("posEV_only", "true");
  if (params.fade_btbs) p.set("fade_btbs", "true");
  return p.toString();
}

/** One row from GET /api/users/{id}/strategies → backtest form shape */
export function apiRowToFormParams(row) {
  return {
    market:   row.market_type,
    side:     row.side,
    book:     row.book,
    stake:    row.stake,
    team:     row.team_filter ?? "",
    season:   row.season_filter ?? "",
    dateFrom: isoDatePart(row.date_from),
    dateTo:   isoDatePart(row.date_to),
    posEV_only: !!row.posEV_only,
    fade_btbs:  !!row.fade_btbs,
  };
}

/** API strategy row → shape used by SavedStrategiesPage */
export function strategyFromApi(row) {
  return {
    strategyID:   row.strategyID,
    strategyName: row.strategy_name,
    description:  row.description,
    savedAt:      row.created_at,
    params:       apiRowToFormParams(row),
  };
}

/**
 * Build POST /api/strategies body (CreateStrategyRequest in main.py).
 * `form` is BacktestPage state: market, side, book, stake, team, season, dateFrom, dateTo, posEV_only, fade_btbs
 */
export function buildCreateStrategyBody(userId, form, opts = {}) {
  const stake = Number(form.stake);
  const f = { ...form, stake };
  const name = (opts.strategyName ?? "").trim() || strategyLabel(f);
  return {
    userID: userId,
    strategy_name: name,
    description: opts.description ?? null,
    market_type: f.market,
    side: f.side,
    book: f.book,
    stake,
    team_filter: f.team || null,
    team_side: null,
    season_filter: f.season || null,
    posEV_only: !!f.posEV_only,
    fade_btbs: !!f.fade_btbs,
    date_from: f.dateFrom || null,
    date_to: f.dateTo || null,
  };
}
