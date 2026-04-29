"""
Load game and odds data from Oracle DB at startup.
Exposes the same DataFrames and index structures as the old CSV version
so nothing else in main.py needs to change.
"""
import oracledb
import pandas as pd
from sqlalchemy import create_engine, text

# ── Oracle connection ─────────────────────────────────────────────────────────
# Uses oracledb thin mode — no Oracle client libraries required.
# Swap these credentials for the group VM (group10/group10@127.0.0.1:1521/xepdb1)

_DB_USER     = "group10"
_DB_PASSWORD = "group10"
_DB_DSN      = "127.0.0.1:1521/xepdb1"

def _make_conn():
    return oracledb.connect(user=_DB_USER, password=_DB_PASSWORD, dsn=_DB_DSN)

_ENGINE = create_engine("oracle+oracledb://", creator=_make_conn)


# ── Globals (same names/shapes as before) ─────────────────────────────────────
games_df: pd.DataFrame = pd.DataFrame()
odds_df:  pd.DataFrame = pd.DataFrame()

# (home_team, away_team, game_date) -> DataFrame of opening-line rows
# one row per (market_type, outcome_label, bookmaker)
odds_index: dict = {}

available_books: list = []   # sorted list of bookmaker names


# ── Helpers ───────────────────────────────────────────────────────────────────
def _season(d) -> str:
    """Return NBA season string for a date, e.g. '2024-25'."""
    year, month = d.year, d.month
    if month >= 10:
        return f"{year}-{str(year + 1)[2:]}"
    return f"{year - 1}-{str(year)[2:]}"


def _lower_cols(df: pd.DataFrame) -> pd.DataFrame:
    """Oracle returns column names in uppercase — normalise to lowercase."""
    df.columns = [c.lower() for c in df.columns]
    return df


# ── Main load function ────────────────────────────────────────────────────────
def load():
    global games_df, odds_df, odds_index, available_books

    with _ENGINE.connect() as conn:

        # ── Games ─────────────────────────────────────────────────────────────
        # Reconstructs what game_results.csv provided, plus btb flags from DB.
        games_df = _lower_cols(pd.read_sql_query(text("""
            SELECT g.gameID       AS game_id,
                   g.game_date,
                   t1.team_name  AS home_team,
                   t2.team_name  AS away_team,
                   g.home_score,
                   g.away_score,
                   g.total_score,
                   g.home_win,
                   g.home_spread,
                   g.home_btb,
                   g.away_btb
            FROM   Games g
            JOIN   Teams t1 ON g.home_teamID = t1.teamID
            JOIN   Teams t2 ON g.away_teamID = t2.teamID
        """), conn))

        games_df["game_date"] = pd.to_datetime(games_df["game_date"]).dt.date
        games_df["season"]    = games_df["game_date"].apply(_season)

        # ── Odds ──────────────────────────────────────────────────────────────
        # Reconstructs what game_odds.csv provided.
        # We only stored opening lines in the DB so no snapshot filtering needed.
        odds_df = _lower_cols(pd.read_sql_query(text("""
            SELECT g.game_date,
                   t1.team_name  AS home_team,
                   t2.team_name  AS away_team,
                   mk.market_type,
                   mo.outcome_label,
                   mo.line_value,
                   mo.price,
                   b.book_name   AS bookmaker
            FROM   MarketOutcomes mo
            JOIN   Markets mk ON mo.marketID   = mk.marketID
            JOIN   Games   g  ON mk.gameID     = g.gameID
            JOIN   Teams  t1  ON g.home_teamID = t1.teamID
            JOIN   Teams  t2  ON g.away_teamID = t2.teamID
            JOIN   Books   b  ON mk.bookID     = b.bookID
        """), conn))

        odds_df["game_date"] = pd.to_datetime(odds_df["game_date"]).dt.date

    available_books = sorted(odds_df["bookmaker"].dropna().unique().tolist())

    # ── Build odds index ──────────────────────────────────────────────────────
    # Maps (home_team, away_team, game_date) → DataFrame of all opening lines
    # for that game (one row per market_type / outcome_label / bookmaker).
    odds_index = {
        key: group.reset_index(drop=True)
        for key, group in odds_df.groupby(["home_team", "away_team", "game_date"])
    }
