from contextlib import asynccontextmanager
from typing import Optional
import math
import numpy as np

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy import text

import data
from helpers import (hash_password, to_prob, to_american, devig_prob, compute_lines, enrich, strategy_row_to_dict)

@asynccontextmanager
async def lifespan(app: FastAPI):
    data.load()
    yield

app = FastAPI(title="Sports Betting Backtester API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173",
                   "http://3.217.167.62:8010/"],
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["*"],
)

# there are non nba teams in the dataset (ex: all star weekend teams) that we don't care about betting on or offering
NBA_TEAMS = {
    "Atlanta Hawks", "Boston Celtics", "Brooklyn Nets", "Charlotte Hornets",
    "Chicago Bulls", "Cleveland Cavaliers", "Dallas Mavericks", "Denver Nuggets",
    "Detroit Pistons", "Golden State Warriors", "Houston Rockets", "Indiana Pacers",
    "LA Clippers", "Los Angeles Lakers", "Memphis Grizzlies", "Miami Heat",
    "Milwaukee Bucks", "Minnesota Timberwolves", "New Orleans Pelicans", "New York Knicks",
    "Oklahoma City Thunder", "Orlando Magic", "Philadelphia 76ers", "Phoenix Suns",
    "Portland Trail Blazers", "Sacramento Kings", "San Antonio Spurs", "Toronto Raptors",
    "Utah Jazz", "Washington Wizards",
}


def _games_df_rows_for_path_id(game_id: str):
    """URL segments are strings; DB game_id may be numeric — compare as string."""
    key = str(game_id).strip()
    return data.games_df[data.games_df["game_id"].astype(str) == key]


# API Routes

@app.get("/api/health")
def health():
    return {"status": "ok"}

@app.get("/api/teams")
def get_teams():
    home = data.games_df["home_team"].dropna().unique().tolist()
    away = data.games_df["away_team"].dropna().unique().tolist()
    all_teams = set(home + away)
    return sorted(all_teams & NBA_TEAMS)    # makes sure only NBA teams are returned

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
    book:      str = Query("draftkings", description="Bookmaker name or 'consensus'"),
    page:      int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
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

    rows = [enrich(r, book) for r in rows]

    return {
        "total":     total,
        "page":      page,
        "page_size": page_size,
        "pages":     math.ceil(total / page_size) if total else 1,
        "games":     rows,
    }

@app.get("/api/games/{game_id}")
def get_game(game_id: str):
    row = _games_df_rows_for_path_id(game_id)
    if row.empty:
        raise HTTPException(status_code=404, detail="Game not found")
    record = row.iloc[0].to_dict()
    record["_game_date_obj"] = record["game_date"]
    record["game_date"] = str(record["game_date"])
    return enrich(record, "consensus")

@app.get("/api/backtest")
def run_backtest(
    market: str = Query(..., description="h2h, spreads, or totals"),
    side: str = Query(..., description="HOME/AWAY or OVER/UNDER"),
    book: str = Query("draftkings"),
    stake: float = Query(100.0, gt=0),
    team: Optional[str] = Query(None),
    season: Optional[str] = Query(None),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    posEV_only: bool = Query(False, description="Only include bets where offered odds have positive expected value vs devigged consensus"),
    fade_btbs: bool = Query(False, description="Skip bets where the relevant team played the night before"),
    team_side: Optional[str] = Query(None, description="When filtering by team: WIN (bet on that team) or LOSS (bet against them)"),
):
    from datetime import date as date_type

    df = data.games_df.copy()
    if team:
        df = df[(df["home_team"] == team) | (df["away_team"] == team)]
    if season:
        df = df[df["season"] == season]
    if date_from:
        df = df[df["game_date"] >= date_type.fromisoformat(date_from)]
    if date_to:
        df = df[df["game_date"] <= date_type.fromisoformat(date_to)]

    df = df.sort_values("game_date", ascending=True)

    bets = []
    cumulative = 0.0

    for row in df.itertuples():
        key = (row.home_team, row.away_team, row.game_date)
        game_odds = data.odds_index.get(key)
        if game_odds is None or game_odds.empty:
            continue

        # Resolve which side to bet --> if side filter is set, this should either pick "HOME" or "AWAY"
        # If team filter is set, this should either bet on the team (WIN) or against them (LOSS)
        effective_side = side
        if team and team_side:
            team_is_home = (row.home_team == team)
            if team_side == "WIN":
                effective_side = "HOME" if team_is_home else "AWAY"
            else:  # LOSS — bet against the team
                effective_side = "AWAY" if team_is_home else "HOME"

        # back to back filter
        if fade_btbs:
            if team:
                # Only check the filtered team's btb status
                team_is_home = (row.home_team == team)
                btb_flag = row.home_btb if team_is_home else row.away_btb
            else:
                # Check the side we're betting on
                btb_flag = row.home_btb if effective_side == "HOME" else row.away_btb
            if btb_flag == 1:
                continue

        # get the lines using the compute lines helper function
        lines = compute_lines(
            game_odds, book,
            home_score=row.home_score, away_score=row.away_score,
            total_score=row.total_score, home_win=row.home_win,
        )
        if lines is None:
            continue

        # look up the price of the bets
        if book == "consensus":
            rows_for_book = game_odds
        else:
            rows_for_book = game_odds[game_odds["bookmaker"] == book]
            if rows_for_book.empty:
                continue

        def _price_for(mkt, label):
            subset = rows_for_book[
                (rows_for_book["market_type"] == mkt) &
                (rows_for_book["outcome_label"] == label)
            ]["price"].dropna()
            if subset.empty:
                return None
            if book != "consensus" or len(subset) == 1:
                return int(subset.iloc[0])
            return to_american(subset.apply(to_prob).mean())

        if market == "h2h":
            price = lines["ml_home"] if effective_side == "HOME" else lines["ml_away"]
            line_val = None
        elif market == "spreads":
            price = _price_for("spreads", effective_side)
            line_val = lines["spread_line"] if effective_side == "HOME" else (
                -lines["spread_line"] if lines["spread_line"] is not None else None
            )
        else:  # totals
            price = _price_for("totals", effective_side)
            line_val = lines["total_line"]

        if price is None:
            continue

        # posEV filter
        if posEV_only:
            fair_prob = devig_prob(game_odds, market, effective_side)
            if fair_prob is None:
                continue
            offered_prob = to_prob(float(price))
            if offered_prob >= fair_prob:
                # Not posEV — skip it
                continue

        sm = lines.get("spread_margin")
        tm = lines.get("total_margin")

        if market == "h2h":
            result = "win" if (effective_side == "HOME") == bool(row.home_win) else "loss"
        elif market == "spreads":
            if sm is None:
                continue
            result = "push" if sm == 0 else ("win" if (effective_side == "HOME") == (sm > 0) else "loss")
        else:  # totals
            if tm is None:
                continue
            result = "push" if tm == 0 else ("win" if (effective_side == "OVER") == (tm > 0) else "loss")

        # calculate profit
        if result == "push":
            profit = 0.0
        elif result == "win":
            if price > 0:
                profit = stake*(price/100)
            else:
                profit = stake*(100/abs(price))
        else:
            profit = -stake # lost all money put in

        profit = round(profit, 2)   # keep in cents
        cumulative = round(cumulative + profit, 2)

        bets.append({
            "game_date":  str(row.game_date),
            "home_team":  row.home_team,
            "away_team":  row.away_team,
            "odds":       price,
            "line":       line_val,
            "stake":      stake,
            "result":     result,
            "profit":     profit,
            "cumulative": cumulative,
        })

    # stats to display on frontend
    num_bets = len(bets)
    wins = sum(1 for b in bets if b["result"] == "win")
    losses = sum(1 for b in bets if b["result"] == "loss")
    pushes = sum(1 for b in bets if b["result"] == "push")
    decided = wins + losses
    profits = [b["profit"] for b in bets]
    net_profit = round(cumulative,2)
    wagered = round(num_bets*stake,2)
    roi = round(net_profit/wagered, 6) if wagered else 0.0
    win_rate = round(wins/decided, 4) if decided else 0.0
    ev_per_bet = round(net_profit/num_bets, 4) if num_bets else 0.0

    # Max drawdown
    peak = max_dd = 0.0
    for b in bets:
        if b["cumulative"] > peak:
            peak = b["cumulative"]
        dd = peak - b["cumulative"]
        if dd > max_dd:
            max_dd = dd

    volatility = round(float(np.std(profits, ddof=1)), 2) if len(profits) >= 2 else 0.0

    return {
        "params": {
            "market": market, "side": side, "book": book, "stake": stake,
            "team": team, "season": season, "date_from": date_from, "date_to": date_to,
            "posEV_only": posEV_only, "fade_btbs": fade_btbs, "team_side": team_side,
        },
        "stats": {
            "total_bets":    num_bets,
            "total_wagered": wagered,
            "net_profit":    net_profit,
            "roi":           roi,
            "win_rate":      win_rate,
            "wins":          wins,
            "losses":        losses,
            "pushes":        pushes,
            "ev_per_bet":    ev_per_bet,
            "max_drawdown":  round(-max_dd, 2),
            "volatility":    volatility,
        },
        "bets": bets,
    }

@app.get("/api/games/{game_id}/odds")
def get_game_odds(game_id: str):
    game_row = _games_df_rows_for_path_id(game_id)
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

    # DB only stores opening lines — no snapshot dedup needed
    df = df.sort_values(["market_type", "bookmaker"]).replace({np.nan: None})
    return df.to_dict(orient="records")

# User endpoints
class RegisterRequest(BaseModel):
    email:    str
    username: str
    password: str

class LoginRequest(BaseModel):
    username: str
    password: str


@app.post("/api/users/register", status_code=201)
def register_user(body: RegisterRequest):
    email = body.email.strip()
    username = body.username.strip()
    if not email or not username:
        raise HTTPException(status_code=400, detail="Email and username cannot be empty")
    hashed = hash_password(body.password)
    with data._ENGINE.begin() as conn:
        # Check if username or email already taken
        existing = conn.execute(
            text("SELECT userID FROM Users WHERE username = :u OR email = :e"),
            {"u": username, "e": email}
        ).fetchone()
        if existing:
            raise HTTPException(status_code=409, detail="Username or email already in use")

        # Get next userID
        row = conn.execute(text("SELECT NVL(MAX(userID), 0) + 1 FROM Users")).fetchone()
        new_id = int(row[0])

        # Column name must match the DB (Oracle Users: USERID, EMAIL, USERNAME, PASSWORD).
        conn.execute(
            text("""
                INSERT INTO Users (userID, email, username, PASSWORD)
                VALUES (:id, :email, :username, :pw)
            """),
            {"id": new_id, "email": email, "username": username, "pw": hashed}
        )

    return {"userID": new_id, "username": username, "email": email}

@app.post("/api/users/login")
def login_user(body: LoginRequest):
    ident = body.username.strip()
    if not ident:
        raise HTTPException(status_code=400, detail="Username or email cannot be empty")
    hashed = hash_password(body.password)
    with data._ENGINE.connect() as conn:
        row = conn.execute(
            text(
                "SELECT userID, username, email FROM Users "
                "WHERE (username = :u OR email = :u) AND PASSWORD = :pw"
            ),
            {"u": ident, "pw": hashed}
        ).fetchone()
    if not row:
        raise HTTPException(status_code=401, detail="Invalid username or password")
    return {
        "userID": int(row[0]),
        "username": row[1],
        "email": row[2],
    }

@app.get("/api/users/{user_id}")
def get_user(user_id: int):
    with data._ENGINE.connect() as conn:
        row = conn.execute(
            text("SELECT userID, email, username FROM Users WHERE userID = :id"),
            {"id": user_id}
        ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="User not found")
    return {
        "userID": int(row[0]),
        "email": row[1],
        "username": row[2],
    }

# Strategy endpoints

class CreateStrategyRequest(BaseModel):
    userID: int
    strategy_name: str
    description:Optional[str] = None
    market_type:str
    side: str
    book: str
    stake: float
    team_filter: Optional[str] = None
    team_side: Optional[str] = None
    season_filter: Optional[str] = None
    posEV_only: bool = False
    fade_btbs: bool = False
    date_from: Optional[str] = None
    date_to: Optional[str] = None

@app.post("/api/strategies", status_code=201)
def create_strategy(body: CreateStrategyRequest):
    with data._ENGINE.begin() as conn:
        # Look up bookID (if consensus, value will be NULL)
        if body.book == "consensus":
            book_id = None
        else:
            book_row = conn.execute(
                text("SELECT bookID FROM Books WHERE book_name = :b"),
                {"b": body.book}
            ).fetchone()
            if not book_row:
                raise HTTPException(status_code=400, detail=f"Unknown bookmaker: {body.book}")
            book_id = int(book_row[0])

        # Next strategyID
        row = conn.execute(text("SELECT NVL(MAX(strategyID), 0) + 1 FROM Strategies")).fetchone()
        new_id = int(row[0])

        conn.execute(text("""
            INSERT INTO Strategies (
            strategyID, userID, strategy_name, description,
            market_type, side, bookID, stake,
            team_filter, team_side, season_filter,
            posEV_only, fade_btbs, date_from, date_to
            ) VALUES (
            :sid, :uid, :name, :desc,
            :mkt, :side, :bid, :stake,
            :team, :tside, :season,
            :posev, :fadebtb,
            TO_DATE(:dfrom, 'YYYY-MM-DD'), TO_DATE(:dto, 'YYYY-MM-DD')
            )
        """), {
            "sid": new_id,
            "uid":body.userID,
            "name": body.strategy_name,
            "desc":body.description,
            "mkt": body.market_type,
            "side": body.side,
            "bid": book_id,
            "stake": body.stake,
            "team": body.team_filter,
            "tside": body.team_side,
            "season": body.season_filter,
            "posev": 1 if body.posEV_only else 0,
            "fadebtb": 1 if body.fade_btbs else 0,
            "dfrom": body.date_from,
            "dto": body.date_to,
        })

        # Fetch back the inserted row to return it
        saved = conn.execute(text("""
            SELECT s.strategyID, s.userID, s.strategy_name, s.description,
            s.market_type, s.side, b.book_name, s.stake,
            s.team_filter, s.team_side, s.season_filter,
            s.posEV_only, s.fade_btbs, s.date_from, s.date_to, s.created_at
            FROM Strategies s
            LEFT JOIN Books b ON s.bookID = b.bookID
            WHERE s.strategyID = :id
        """), {"id": new_id}).fetchone()

    return strategy_row_to_dict(saved)

@app.get("/api/users/{user_id}/strategies")
def get_user_strategies(user_id: int):
    with data._ENGINE.connect() as conn:
        rows = conn.execute(text("""
            SELECT s.strategyID, s.userID, s.strategy_name, s.description,
    s.market_type, s.side, b.book_name, s.stake,
    s.team_filter, s.team_side, s.season_filter,
            s.posEV_only, s.fade_btbs, s.date_from, s.date_to, s.created_at
            FROM Strategies s
            LEFT JOIN Books b ON s.bookID = b.bookID
            WHERE s.userID = :uid
            ORDER BY s.created_at DESC
        """), {"uid": user_id}).fetchall()
    return [strategy_row_to_dict(r) for r in rows]

@app.post("/api/strategies/{strategy_id}/run", status_code=201)
def log_strategy_run(strategy_id: int):
    with data._ENGINE.begin() as conn:
        if not conn.execute(
            text("SELECT strategyID FROM Strategies WHERE strategyID = :id"),
            {"id": strategy_id}
        ).fetchone():
            raise HTTPException(status_code=404, detail="Strategy not found")

        run_id_row = conn.execute(text("SELECT NVL(MAX(runID), 0) + 1 FROM StrategyRuns")).fetchone()
        run_id = int(run_id_row[0])

        conn.execute(text("""
        INSERT INTO StrategyRuns (runID, strategyID, status)
        VALUES (:rid, :sid, 'COMPLETE')
        """), {"rid": run_id, "sid": strategy_id})

    return {"runID": run_id, "strategyID": strategy_id, "status": "COMPLETE"}

@app.delete("/api/strategies/{strategy_id}", status_code=200)
def delete_strategy(strategy_id: int):
    with data._ENGINE.begin() as conn:
        row = conn.execute(
            text("SELECT strategyID FROM Strategies WHERE strategyID = :id"),
            {"id": strategy_id}
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Strategy not found")

        # FK order: StrategyRuns first, then Strategies
        conn.execute(
            text("DELETE FROM StrategyRuns WHERE strategyID = :id"),
            {"id": strategy_id}
        )
        conn.execute(
            text("DELETE FROM Strategies WHERE strategyID = :id"),
            {"id": strategy_id}
        )
    return {"strategyID": strategy_id, "deleted": True}