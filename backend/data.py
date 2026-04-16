"""
Load the CSV files once at startup and expose them as DataFrames.
The CSVs live at the repo root (one level up from this file).
"""
import os
import pandas as pd

_HERE = os.path.dirname(__file__)
_ROOT = os.path.join(_HERE, "..")

games_df: pd.DataFrame = pd.DataFrame()
odds_df: pd.DataFrame = pd.DataFrame()


def load():
    global games_df, odds_df

    games_df = pd.read_csv(
        os.path.join(_ROOT, "game_results.csv"),
        dtype={"game_id": str},
        parse_dates=["game_date"],
    )
    games_df["game_date"] = games_df["game_date"].dt.date

    odds_df = pd.read_csv(
        os.path.join(_ROOT, "game_odds.csv"),
        dtype={"event_id": str},
        parse_dates=["game_date"],
    )
    odds_df["game_date"] = odds_df["game_date"].dt.date
