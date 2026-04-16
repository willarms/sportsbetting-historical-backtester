"""
Load the CSV files once at startup and expose them as DataFrames.
The CSVs live at the repo root (one level up from this file).
"""
import os
import pandas as pd

_HERE = os.path.dirname(__file__)
_ROOT = os.path.join(_HERE, "..")

# Team name differences between the two CSVs
_TEAM_ALIASES = {
    "LA Clippers": "Los Angeles Clippers",
}

games_df: pd.DataFrame = pd.DataFrame()
odds_df: pd.DataFrame = pd.DataFrame()

# (home_team, away_team, game_date) -> DataFrame of opening-line rows
# one row per (market_type, outcome_label, bookmaker)
odds_index: dict = {}

available_books: list = []  # sorted list of bookmaker names in the data


def _season(d) -> str:
    """Return NBA season string for a date, e.g. '2024-25'."""
    year, month = d.year, d.month
    if month >= 10:
        return f"{year}-{str(year + 1)[2:]}"
    return f"{year - 1}-{str(year)[2:]}"


def load():
    global games_df, odds_df, odds_index, available_books

    games_df = pd.read_csv(
        os.path.join(_ROOT, "game_results.csv"),
        dtype={"game_id": str},
        parse_dates=["game_date"],
    )
    games_df["game_date"] = games_df["game_date"].dt.date

    for col in ("home_team", "away_team"):
        games_df[col] = games_df[col].replace(_TEAM_ALIASES)

    games_df["season"] = games_df["game_date"].apply(_season)

    odds_df = pd.read_csv(
        os.path.join(_ROOT, "game_odds.csv"),
        dtype={"event_id": str},
        parse_dates=["game_date"],
    )
    odds_df["game_date"] = odds_df["game_date"].dt.date

    available_books = sorted(odds_df["bookmaker"].dropna().unique().tolist())

    # Keep only the opening line (earliest snapshot) for each
    # (home, away, date, market, outcome, bookmaker) combination
    o_open = (
        odds_df
        .sort_values("snapshot_time")
        .drop_duplicates(
            subset=["home_team", "away_team", "game_date",
                    "market_type", "outcome_label", "bookmaker"],
            keep="first",
        )
    )

    odds_index = {
        key: group.reset_index(drop=True)
        for key, group in o_open.groupby(["home_team", "away_team", "game_date"])
    }
