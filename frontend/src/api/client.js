import axios from "axios";

// All requests go to /api/* — Vite proxies them to http://localhost:8000 in dev.
// In production, Apache proxies them instead. The frontend code never changes.
const api = axios.create({ baseURL: "/api" });

/** Extract a readable message from a failed axios / FastAPI response. */
export function apiErrorMessage(err) {
  if (!axios.isAxiosError(err)) {
    return err instanceof Error ? err.message : "Something went wrong";
  }
  const detail = err.response?.data?.detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    const msgs = detail
      .map((d) => (typeof d?.msg === "string" ? d.msg : JSON.stringify(d)))
      .join(" ")
      .trim();
    if (msgs) return msgs;
  }
  const status = err.response?.status;
  if (status === 409) return "That username or email is already taken.";
  if (status === 401) return "Invalid username or password.";
  if (status) return `Request failed (${status}).`;
  return err.message || "Something went wrong";
}

export async function registerUser({ email, username, password }) {
  const { data } = await api.post("/users/register", {
    email: email.trim(),
    username: username.trim(),
    password,
  });
  return data;
}

/** `username` field may hold either a username or the account email — backend resolves both. */
export async function loginUser({ identifier, password }) {
  const { data } = await api.post("/users/login", {
    username: identifier.trim(),
    password,
  });
  return data;
}

export async function fetchTeams() {
  const { data } = await api.get("/teams");
  return data;
}

export async function fetchSeasons() {
  const { data } = await api.get("/seasons");
  return data;
}

export async function fetchBookmakers() {
  const { data } = await api.get("/bookmakers");
  return data;
}

export async function fetchGames({ team, season, book, dateFrom, dateTo, page = 1, pageSize = 50 } = {}) {
  const params = { page, page_size: pageSize };
  if (team)     params.team      = team;
  if (season)   params.season    = season;
  if (book)     params.book      = book;
  if (dateFrom) params.date_from = dateFrom;
  if (dateTo)   params.date_to   = dateTo;
  const { data } = await api.get("/games", { params });
  return data;
}

export async function runBacktest({
  market, side, book, stake, team, season, dateFrom, dateTo,
  posEV_only, fade_btbs,
} = {}) {
  const params = { market, side, book, stake };
  if (team)       params.team       = team;
  if (season)     params.season     = season;
  if (dateFrom)   params.date_from  = dateFrom;
  if (dateTo)     params.date_to    = dateTo;
  if (posEV_only) params.posEV_only = true;
  if (fade_btbs)  params.fade_btbs  = true;
  const { data } = await api.get("/backtest", { params });
  return data;
}

export async function fetchGame(gameId) {
  const { data } = await api.get(`/games/${gameId}`);
  return data;
}

export async function fetchGameOdds(gameId) {
  const { data } = await api.get(`/games/${gameId}/odds`);
  return data;
}

/** @param {object} body — matches CreateStrategyRequest in backend/main.py */
export async function createStrategy(body) {
  const { data } = await api.post("/strategies", body);
  return data;
}

export async function fetchUserStrategies(userId) {
  const { data } = await api.get(`/users/${userId}/strategies`);
  return data;
}

export async function deleteStrategy(strategyId) {
  const { data } = await api.delete(`/strategies/${strategyId}`);
  return data;
}

export async function logStrategyRun(strategyId) {
  const { data } = await api.post(`/strategies/${strategyId}/run`);
  return data;
}
