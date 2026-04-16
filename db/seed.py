"""
ETL script: load game_results.csv + game_odds.csv into Oracle DB.

Usage:
    python seed.py --user <db_user> --password <db_pass> --dsn <host>:<port>/<service>

    Or set env vars: DB_USER, DB_PASSWORD, DB_DSN
    Example DSN: localhost:1521/ORCL

Run schema.sql first:
    sqlplus <user>/<pass>@<dsn> @schema.sql
"""

import csv
import sys
import os
import argparse
from datetime import date, datetime
from pathlib import Path

try:
    import cx_Oracle
except ImportError:
    sys.exit("cx_Oracle not installed. Run: pip install cx_Oracle")

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

SCRIPT_DIR = Path(__file__).parent
RESULTS_CSV = SCRIPT_DIR.parent / "game_results.csv"
ODDS_CSV    = SCRIPT_DIR.parent / "game_odds.csv"

# "Los Angeles Clippers" appears in odds; "LA Clippers" appears in results
TEAM_ALIASES = {
    "Los Angeles Clippers": "LA Clippers",
}

BATCH_SIZE = 500


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def normalize_team(name: str) -> str:
    return TEAM_ALIASES.get(name, name)


def parse_date(s: str) -> date:
    return datetime.strptime(s, "%Y-%m-%d").date()


def to_num(s: str):
    """Return float or None for empty string."""
    s = s.strip()
    return float(s) if s else None


def compute_outcome(market_type: str, outcome_label: str, result: dict):
    """
    Derive is_winner (0/1) and is_push (0/1) from the matched game result.
    Returns (None, None) when result is unavailable.
    """
    if result is None:
        return None, None

    home_score  = result.get("home_score_f")
    away_score  = result.get("away_score_f")
    total_score = result.get("total_score_f")
    home_win    = result.get("home_win_i")

    if market_type == "h2h":
        if home_win is None:
            return None, None
        if outcome_label == "HOME":
            return home_win, 0
        else:  # AWAY
            return 1 - home_win, 0

    elif market_type == "spreads":
        if home_score is None or away_score is None:
            return None, None
        line = result.get("line_value_f")
        if line is None:
            return None, None
        margin = home_score - away_score  # positive = home won by margin
        if outcome_label == "HOME":
            covered = margin + line  # home covers if margin > -line, i.e. margin+line > 0
            # e.g. line=-5.5, margin=6 → 0.5 > 0 → covered
        else:  # AWAY
            covered = -(margin + line)  # away covers when home does not
        if covered > 0:
            return 1, 0
        elif covered < 0:
            return 0, 0
        else:
            return 0, 1  # push

    elif market_type == "totals":
        if total_score is None:
            return None, None
        line = result.get("line_value_f")
        if line is None:
            return None, None
        if outcome_label == "OVER":
            diff = total_score - line
        else:  # UNDER
            diff = line - total_score
        if diff > 0:
            return 1, 0
        elif diff < 0:
            return 0, 0
        else:
            return 0, 1  # push

    return None, None


def batched_insert(cursor, sql, rows):
    for i in range(0, len(rows), BATCH_SIZE):
        cursor.executemany(sql, rows[i : i + BATCH_SIZE])


# ---------------------------------------------------------------------------
# Main ETL
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--user",     default=os.getenv("DB_USER"))
    parser.add_argument("--password", default=os.getenv("DB_PASSWORD"))
    parser.add_argument("--dsn",      default=os.getenv("DB_DSN"))
    args = parser.parse_args()

    if not all([args.user, args.password, args.dsn]):
        sys.exit(
            "Provide --user, --password, --dsn  or set DB_USER, DB_PASSWORD, DB_DSN"
        )

    print(f"Connecting to Oracle at {args.dsn} ...")
    conn   = cx_Oracle.connect(args.user, args.password, args.dsn)
    cursor = conn.cursor()
    print("Connected.\n")

    # -----------------------------------------------------------------------
    # 1. Sports
    # -----------------------------------------------------------------------
    sport_id   = 1
    sport_name = "NBA"
    cursor.execute(
        "INSERT INTO Sports (sportID, sport_name) VALUES (:1, :2)",
        [sport_id, sport_name],
    )
    print(f"Inserted 1 sport: {sport_name}")

    # -----------------------------------------------------------------------
    # 2. Teams  (collected from both CSVs, normalized)
    # -----------------------------------------------------------------------
    team_names = set()

    with open(RESULTS_CSV) as f:
        for row in csv.DictReader(f):
            team_names.add(row["home_team"])
            team_names.add(row["away_team"])

    with open(ODDS_CSV) as f:
        for row in csv.DictReader(f):
            team_names.add(normalize_team(row["home_team"]))
            team_names.add(normalize_team(row["away_team"]))

    team_id_map = {}  # name -> teamID
    team_rows   = []
    for tid, name in enumerate(sorted(team_names), start=1):
        team_id_map[name] = tid
        team_rows.append((tid, name, sport_id))

    batched_insert(
        cursor,
        "INSERT INTO Teams (teamID, team_name, sportID) VALUES (:1, :2, :3)",
        team_rows,
    )
    print(f"Inserted {len(team_rows)} teams")

    # -----------------------------------------------------------------------
    # 3. Games  (from game_results.csv)
    # -----------------------------------------------------------------------
    game_id_map = {}  # (game_date_str, home_team, away_team) -> gameID
    game_result_map = {}  # same key -> dict of numeric result fields
    game_rows   = []
    game_id_ctr = 1

    with open(RESULTS_CSV) as f:
        for row in csv.DictReader(f):
            home = row["home_team"]
            away = row["away_team"]
            key  = (row["game_date"], home, away)

            gid         = game_id_ctr
            game_id_ctr += 1
            game_id_map[key] = gid

            home_score  = to_num(row["home_score"])
            away_score  = to_num(row["away_score"])
            total_score = to_num(row["total_score"])
            home_spread = to_num(row["home_spread"])
            home_win    = int(row["home_win"]) if row["home_win"].strip() else None

            game_result_map[key] = {
                "home_score_f":  home_score,
                "away_score_f":  away_score,
                "total_score_f": total_score,
                "home_win_i":    home_win,
            }

            game_rows.append((
                gid,
                parse_date(row["game_date"]),
                sport_id,
                team_id_map[home],
                team_id_map[away],
                home_score,
                away_score,
                total_score,
                home_spread,
                home_win,
                None,   # home_btb – not in CSV
                None,   # away_btb – not in CSV
            ))

    batched_insert(
        cursor,
        """INSERT INTO Games
           (gameID, game_date, sportID, home_teamID, away_teamID,
            home_score, away_score, total_score, home_spread, home_win,
            home_btb, away_btb)
           VALUES (:1, :2, :3, :4, :5, :6, :7, :8, :9, :10, :11, :12)""",
        game_rows,
    )
    print(f"Inserted {len(game_rows)} games")

    # -----------------------------------------------------------------------
    # 4. Books  (from game_odds.csv)
    # -----------------------------------------------------------------------
    book_names = set()
    with open(ODDS_CSV) as f:
        for row in csv.DictReader(f):
            book_names.add(row["bookmaker"])

    book_id_map = {}
    book_rows   = []
    for bid, name in enumerate(sorted(book_names), start=1):
        book_id_map[name] = bid
        book_rows.append((bid, name))

    batched_insert(
        cursor,
        "INSERT INTO Book (bookID, book_name) VALUES (:1, :2)",
        book_rows,
    )
    print(f"Inserted {len(book_rows)} books")

    # -----------------------------------------------------------------------
    # 5 & 6. Markets + MarketOutcomes  (from game_odds.csv)
    #
    #   Dedup: keep latest snapshot per (event_id, bookmaker, market_type,
    #          outcome_label).  Only retain rows whose game exists in Games.
    # -----------------------------------------------------------------------

    # --- dedup odds: keep latest snapshot_time per unique outcome key ---
    deduped = {}  # (event_id, bookmaker, market_type, outcome_label) -> row
    with open(ODDS_CSV) as f:
        for row in csv.DictReader(f):
            k = (
                row["event_id"],
                row["bookmaker"],
                row["market_type"],
                row["outcome_label"],
            )
            prev = deduped.get(k)
            if prev is None or row["snapshot_time"] > prev["snapshot_time"]:
                deduped[k] = row

    # --- group into markets: (game_key, bookmaker, market_type) -> [outcomes] ---
    market_groups = {}  # (game_key, bookmaker, market_type) -> list of rows
    skipped = 0

    for row in deduped.values():
        home = normalize_team(row["home_team"])
        away = normalize_team(row["away_team"])
        key  = (row["game_date"], home, away)

        if key not in game_id_map:
            skipped += 1
            continue

        mk = (key, row["bookmaker"], row["market_type"])
        market_groups.setdefault(mk, []).append(row)

    if skipped:
        print(f"  Skipped {skipped} odds rows with no matching game in results")

    # --- insert Markets then MarketOutcomes ---
    market_rows  = []
    outcome_rows = []
    market_id_ctr  = 1
    outcome_id_ctr = 1

    for (game_key, bookmaker, market_type), outcomes in market_groups.items():
        gid = game_id_map[game_key]
        bid = book_id_map[bookmaker]
        mid = market_id_ctr
        market_id_ctr += 1

        market_rows.append((mid, gid, bid, market_type))

        game_result = game_result_map.get(game_key)

        for row in outcomes:
            line_value = to_num(row["line_value"])
            price      = to_num(row["price"])

            # Attach line_value to result dict for compute_outcome
            result_ctx = dict(game_result) if game_result else {}
            result_ctx["line_value_f"] = line_value

            is_winner, is_push = compute_outcome(
                market_type, row["outcome_label"], result_ctx
            )

            outcome_rows.append((
                outcome_id_ctr,
                mid,
                bid,
                row["outcome_label"],
                line_value,
                price,
                is_winner,
                is_push,
            ))
            outcome_id_ctr += 1

    batched_insert(
        cursor,
        "INSERT INTO Markets (marketID, gameID, bookID, market_type) VALUES (:1, :2, :3, :4)",
        market_rows,
    )
    print(f"Inserted {len(market_rows)} markets")

    batched_insert(
        cursor,
        """INSERT INTO MarketOutcomes
           (outcomeID, marketID, bookID, outcome_label, line_value, price, is_winner, is_push)
           VALUES (:1, :2, :3, :4, :5, :6, :7, :8)""",
        outcome_rows,
    )
    print(f"Inserted {len(outcome_rows)} market outcomes")

    # -----------------------------------------------------------------------
    # Commit
    # -----------------------------------------------------------------------
    conn.commit()
    cursor.close()
    conn.close()
    print("\nDone. All data committed.")


if __name__ == "__main__":
    main()
