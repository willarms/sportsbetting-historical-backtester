from contextlib import asynccontextmanager
from typing import Optional
import math
import numpy as np

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


# ── Odds math ────────────────────────────────────────────────────────────────

def _to_prob(american: float) -> float:
    """American odds → implied probability (0–1)."""
    if american > 0:
        return 100 / (american + 100)
    return -american / (-american + 100)


def _to_american(prob: float) -> int:
    """Implied probability → American odds (rounded to nearest integer)."""
    if prob <= 0 or prob >= 1:
        return 0
    if prob >= 0.5:
        return round(-(prob * 100) / (1 - prob))
    return round((1 - prob) * 100 / prob)


# ── Line computation ─────────────────────────────────────────────────────────

def _compute_lines(game_odds, book: str, home_score: int, away_score: int, total_score: int, home_win: int):
    """
    Given the opening-line rows for one game, return a lines dict.

    book = a bookmaker name (e.g. 'draftkings') or 'consensus'.
    Consensus averages implied probabilities for prices, and averages
    line values for spreads/totals.
    """
    if game_odds is None or (hasattr(game_odds, 'empty') and game_odds.empty):
        return None

    if book == "consensus":
        rows = game_odds
    else:
        rows = game_odds[game_odds["bookmaker"] == book]
        if rows.empty:
            return None

    def _price(mkt, label):
        subset = rows[(rows["market_type"] == mkt) & (rows["outcome_label"] == label)]["price"].dropna()
        if subset.empty:
            return None
        if book != "consensus" or len(subset) == 1:
            return int(subset.iloc[0])
        # Consensus: average implied probabilities, convert back
        avg_prob = subset.apply(_to_prob).mean()
        return _to_american(avg_prob)

    def _line_val(mkt, label):
        subset = rows[(rows["market_type"] == mkt) & (rows["outcome_label"] == label)]["line_value"].dropna()
        if subset.empty:
            return None
        # For consensus, average the line values across books
        val = subset.mean() if book == "consensus" else subset.iloc[0]
        # NaN guard
        return None if val != val else round(float(val), 1)

    ml_home = _price("h2h", "HOME")
    ml_away = _price("h2h", "AWAY")

    spread_line = _line_val("spreads", "HOME")
    spread_covered, spread_margin = None, None
    if spread_line is not None:
        # home covers if (actual margin + spread_line) > 0
        # e.g. home +10.5, lost by 8  → -8 + 10.5 = +2.5 ✓
        # e.g. home -3.5,  won by 2   →  2 + (-3.5) = -1.5 ✗
        spread_margin = round((home_score - away_score) + spread_line, 1)
        spread_covered = spread_margin > 0

    total_line = _line_val("totals", "OVER")
    went_over, total_margin = None, None
    if total_line is not None:
        total_margin = round(total_score - total_line, 1)
        went_over = total_margin > 0

    # Label shown in UI
    if book == "consensus":
        book_label = "Consensus"
    else:
        book_label = book

    return {
        "bookmaker":           book_label,
        "ml_home":             ml_home,
        "ml_away":             ml_away,
        "ml_home_hit":         bool(home_win),
        "spread_line":         spread_line,
        "spread_home_covered": spread_covered,
        "spread_margin":       spread_margin,
        "total_line":          total_line,
        "total_went_over":     went_over,
        "total_margin":        total_margin,
    }


def _enrich(record: dict, book: str) -> dict:
    """Attach computed betting lines to a game record dict."""
    key = (record["home_team"], record["away_team"], record["_game_date_obj"])
    game_odds = data.odds_index.get(key)
    record["lines"] = _compute_lines(
        game_odds, book,
        home_score=record["home_score"],
        away_score=record["away_score"],
        total_score=record["total_score"],
        home_win=record["home_win"],
    )
    del record["_game_date_obj"]   # cleanup — was only needed for the index lookup
    return record


# ── Routes ───────────────────────────────────────────────────────────────────

@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.get("/api/teams")
def get_teams():
    home = data.games_df["home_team"].dropna().unique().tolist()
    away = data.games_df["away_team"].dropna().unique().tolist()
    return sorted(set(home + away))


@app.get("/api/seasons")
def get_seasons():
    return sorted(data.games_df["season"].unique().tolist())


@app.get("/api/bookmakers")
def get_bookmakers():
    return data.available_books


@app.get("/api/games")
def get_games(
    team:      Optional[str] = Query(None),
    season:    Optional[str] = Query(None),
    date_from: Optional[str] = Query(None),
    date_to:   Optional[str] = Query(None),
    book:      str           = Query("draftkings", description="Bookmaker name or 'consensus'"),
    page:      int           = Query(1, ge=1),
    page_size: int           = Query(50, ge=1, le=200),
):
    df = data.games_df.copy()

    if team:
        df = df[(df["home_team"] == team) | (df["away_team"] == team)]
    if season:
        df = df[df["season"] == season]
    if date_from:
        from datetime import date
        df = df[df["game_date"] >= date.fromisoformat(date_from)]
    if date_to:
        from datetime import date
        df = df[df["game_date"] <= date.fromisoformat(date_to)]

    df = df.sort_values("game_date", ascending=False)
    total = len(df)

    page_df = df.iloc[(page - 1) * page_size: page * page_size]

    rows = page_df.to_dict(orient="records")
    for r in rows:
        r["_game_date_obj"] = r["game_date"]   # stash date object before stringifying
        r["game_date"] = str(r["game_date"])

    rows = [_enrich(r, book) for r in rows]

    return {
        "total":     total,
        "page":      page,
        "page_size": page_size,
        "pages":     math.ceil(total / page_size) if total else 1,
        "games":     rows,
    }


@app.get("/api/games/{game_id}")
def get_game(game_id: str):
    row = data.games_df[data.games_df["game_id"] == game_id]
    if row.empty:
        raise HTTPException(status_code=404, detail="Game not found")
    record = row.iloc[0].to_dict()
    record["_game_date_obj"] = record["game_date"]
    record["game_date"] = str(record["game_date"])
    return _enrich(record, "consensus")


@app.get("/api/games/{game_id}/odds")
def get_game_odds(game_id: str):
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

    if not df.empty and "snapshot_time" in df.columns:
        df = (
            df.sort_values("snapshot_time")
            .drop_duplicates(subset=["market_type", "outcome_label", "bookmaker"], keep="last")
        )

    df = df.sort_values(["market_type", "bookmaker"]).replace({np.nan: None})
    return df.to_dict(orient="records")
