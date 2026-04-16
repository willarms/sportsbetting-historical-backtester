import axios from "axios";

// All requests go to /api/* — Vite proxies them to http://localhost:8000 in dev.
// In production, Apache proxies them instead. The frontend code never changes.
const api = axios.create({ baseURL: "/api" });

export async function fetchTeams() {
  const { data } = await api.get("/teams");
  return data;
}

export async function fetchGames({ team, dateFrom, dateTo, page = 1, pageSize = 50 } = {}) {
  const params = { page, page_size: pageSize };
  if (team) params.team = team;
  if (dateFrom) params.date_from = dateFrom;
  if (dateTo) params.date_to = dateTo;
  const { data } = await api.get("/games", { params });
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
