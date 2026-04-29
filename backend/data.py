import oracledb
import pandas as pd
from sqlalchemy import create_engine, text

# data layer for backend --> runs once at startup, pulls from oracle db into pd dfs so that main.py can just read from dfs

# Connection
DB_USER     = "group10"
DB_PASSWORD = "group10"
DB_ADDRESS      = "127.0.0.1:1521/xepdb1"

def _make_conn():
    return oracledb.connect(user=DB_USER, password=DB_PASSWORD, dsn=DB_ADDRESS)

_ENGINE = create_engine("oracle+oracledb://", creator=_make_conn)

# Dfs 
games_df: pd.DataFrame = pd.DataFrame()
odds_df:  pd.DataFrame = pd.DataFrame()

odds_index: dict = {}

available_books: list = []   # sorted list of bookmaker names

# Gets season given date
def _season(d) -> str:
    year, month = d.year, d.month
    if month >= 10:
        return f"{year}-{str(year + 1)[2:]}"
    return f"{year - 1}-{str(year)[2:]}"

# To lowercase for columns
def _lower_cols(df: pd.DataFrame) -> pd.DataFrame:
    df.columns = [c.lower() for c in df.columns]
    return df

# load from db
def load():
    global games_df, odds_df, odds_index, available_books

    with _ENGINE.connect() as conn:
        # Load games
        games_df = _lower_cols(pd.read_sql_query(text("""
            SELECT g.gameID AS game_id,
            g.game_date,
            t1.team_name AS home_team,
            t2.team_name AS away_team,
            g.home_score,
            g.away_score,
            g.total_score,
            g.home_win,
            g.home_spread,
            g.home_btb,
            g.away_btb
            FROM Games g
            JOIN Teams t1 ON g.home_teamID = t1.teamID
            JOIN Teams t2 ON g.away_teamID = t2.teamID
        """), conn))

        games_df["game_date"] = pd.to_datetime(games_df["game_date"]).dt.date
        games_df["season"]    = games_df["game_date"].apply(_season)

        # Load odds
        odds_df = _lower_cols(pd.read_sql_query(text("""
            SELECT g.game_date,
            t1.team_name AS home_team,
            t2.team_name AS away_team,
            mk.market_type,
            mo.outcome_label,
            mo.line_value,
            mo.price,
            b.book_name AS bookmaker
            FROM MarketOutcomes mo
            JOIN Markets mk ON mo.marketID = mk.marketID
            JOIN Games g ON mk.gameID = g.gameID
            JOIN Teams t1 ON g.home_teamID = t1.teamID
            JOIN Teams t2 ON g.away_teamID = t2.teamID
            JOIN Books b ON mk.bookID = b.bookID
        """), conn))

        odds_df["game_date"] = pd.to_datetime(odds_df["game_date"]).dt.date

    available_books = sorted(odds_df["bookmaker"].dropna().unique().tolist())

    # building odds index
    odds_index = {
        key: group.reset_index(drop=True)
        for key, group in odds_df.groupby(["home_team", "away_team", "game_date"])
    }
