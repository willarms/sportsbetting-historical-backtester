import { bookLabel } from "./bookmakers.js";

const STORAGE_KEY = "backtest_strategies";

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

export function strategyToSearch(params) {
  const p = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => { if (v !== "" && v != null) p.set(k, v); });
  return p.toString();
}

export function loadStrategies() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) ?? [];
  } catch {
    return [];
  }
}

export function saveStrategies(list) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

export function addStrategy(params) {
  const list = loadStrategies();
  const entry = {
    id:      Date.now().toString(),
    label:   strategyLabel(params),
    savedAt: new Date().toISOString(),
    params,
  };
  const updated = [entry, ...list];
  saveStrategies(updated);
  return updated;
}

export function removeStrategy(id) {
  const updated = loadStrategies().filter((s) => s.id !== id);
  saveStrategies(updated);
  return updated;
}
