from contextlib import asynccontextmanager
from typing import Optional
import math

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

import data


@asynccontextmanager
async def lifespan(app: FastAPI):
    data.load()
    yield


app = FastAPI(title="Sports Betting Backtester API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["GET"],
    allow_headers=["*"],
)


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.get("/api/teams")
def get_teams():
    home = data.games_df["home_team"].dropna().unique().tolist()
    away = data.games_df["away_team"].dropna().unique().tolist()
    teams = sorted(set(home + away))
    return teams


@app.get("/api/games")
def get_games(
    team: Optional[str] = Query(None, description="Filter by team name (home or away)"),
    date_from: Optional[str] = Query(None, description="ISO date, e.g. 2024-10-22"),
    date_to: Optional[str] = Query(None, description="ISO date, e.g. 2025-04-15"),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
):
    df = data.games_df.copy()

    if team:
        df = df[(df["home_team"] == team) | (df["away_team"] == team)]

    if date_from:
        from datetime import date
        df = df[df["game_date"] >= date.fromisoformat(date_from)]

    if date_to:
        from datetime import date
        df = df[df["game_date"] <= date.fromisoformat(date_to)]

    df = df.sort_values("game_date", ascending=False)

    total = len(df)
    start = (page - 1) * page_size
    end = start + page_size
    page_df = df.iloc[start:end]

    rows = page_df.assign(game_date=page_df["game_date"].astype(str)).to_dict(orient="records")

    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "pages": math.ceil(total / page_size),
        "games": rows,
    }


@app.get("/api/games/{game_id}")
def get_game(game_id: str):
    row = data.games_df[data.games_df["game_id"] == game_id]
    if row.empty:
        raise HTTPException(status_code=404, detail="Game not found")
    record = row.iloc[0].copy()
    record["game_date"] = str(record["game_date"])
    return record.to_dict()


@app.get("/api/games/{game_id}/odds")
def get_game_odds(game_id: str):
    # Match odds by home/away team + date from the games table
    game_row = data.games_df[data.games_df["game_id"] == game_id]
    if game_row.empty:
        raise HTTPException(status_code=404, detail="Game not found")

    g = game_row.iloc[0]
    mask = (
        (data.odds_df["home_team"] == g["home_team"])
        & (data.odds_df["away_team"] == g["away_team"])
        & (data.odds_df["game_date"] == g["game_date"])
    )
    df = data.odds_df[mask].copy()
    df["game_date"] = df["game_date"].astype(str)

    # Deduplicate: keep one row per (market_type, outcome_label, bookmaker) — latest snapshot
    if not df.empty and "snapshot_time" in df.columns:
        df = (
            df.sort_values("snapshot_time")
            .drop_duplicates(subset=["market_type", "outcome_label", "bookmaker"], keep="last")
        )

    import numpy as np
    df = df.sort_values(["market_type", "bookmaker"]).replace({np.nan: None})
    return df.to_dict(orient="records")
