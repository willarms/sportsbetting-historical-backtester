from contextlib import asynccontextmanager
from typing import Optional
import hashlib
import math
import numpy as np

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy import text

import data

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

# simple password hash
def _hash_password(plain: str) -> str:
    return hashlib.sha256(plain.encode()).hexdigest()

# math for calculating posEV

# American odds to implied prob
def _to_prob(american: float) -> float:
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

# Calculates 'fair' probability for a market --> gets rid of book vig
def _devig_prob(game_odds, market: str, label: str) -> Optional[float]:
    opposite = {"HOME": "AWAY", "AWAY": "HOME", "OVER": "UNDER", "UNDER": "OVER"}
    opp_label = opposite.get(label)
    
    # make sure opposite line exists
    if opp_label is None:
        return None

    mkt_rows = game_odds[game_odds["market_type"] == market]
    side_rows = mkt_rows[mkt_rows["outcome_label"] == label]["price"].dropna()
    opp_rows  = mkt_rows[mkt_rows["outcome_label"] == opp_label]["price"].dropna()

    if side_rows.empty or opp_rows.empty:
        return None

    # Match book
    n = min(len(side_rows), len(opp_rows))
    devigged_probs = []
    for i in range(n):
        p_side = _to_prob(float(side_rows.iloc[i]))
        p_opp  = _to_prob(float(opp_rows.iloc[i]))
        total  = p_side + p_opp
        if total > 0:
            devigged_probs.append(p_side / total)

    if not devigged_probs:
        return None
    return sum(devigged_probs) / len(devigged_probs)


# Compute betting lines for a game --> given all opening line rows for a game, return dictionary of lines
def _compute_lines(game_odds, book: str, home_score: int, away_score: int, total_score: int, home_win: int):
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
        # Check if consesus (if so use average)
        if book != "consensus" or len(subset) == 1:
            return int(subset.iloc[0])
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
        spread_margin = round((home_score - away_score) + spread_line, 1)
        spread_covered = spread_margin > 0

    total_line = _line_val("totals", "OVER")
    went_over, total_margin = None, None
    if total_line is not None:
        total_margin = round(total_score - total_line, 1)
        went_over = total_margin > 0

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

# Add computed game lines to game record in dictionary
def _enrich(record: dict, book: str) -> dict:
    key = (record["home_team"], record["away_team"], record["_game_date_obj"])
    game_odds = data.odds_index.get(key)
    record["lines"] = _compute_lines(
        game_odds, book,
        home_score=record["home_score"],
        away_score=record["away_score"],
        total_score=record["total_score"],
        home_win=record["home_win"],
    )
    # don't need to return this
    del record["_game_date_obj"]
    return record


# API Routes

@app.get("/api/health")
def health():
    return {"status": "ok"}

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
        lines = _compute_lines(
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
            return _to_american(subset.apply(_to_prob).mean())

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
            fair_prob = _devig_prob(game_odds, market, effective_side)
            if fair_prob is None:
                continue
            offered_prob = _to_prob(float(price))
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
    hashed = _hash_password(body.password)
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
    hashed = _hash_password(body.password)
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
        "userID":   int(row[0]),
        "username": row[1],
        "email":    row[2],
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
        "userID":   int(row[0]),
        "email":    row[1],
        "username": row[2],
    }