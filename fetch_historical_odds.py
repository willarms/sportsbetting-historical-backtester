"""
Standalone script: pull historical NBA odds from the-odds-api and write to CSV.

Usage:
    python fetch_historical_odds.py \
        --start-date 2024-10-22 \
        --end-date   2024-11-22 \
        --output     odds.csv \
        --markets    h2h,spreads,totals,player_points,player_rebounds,player_assists \
        --bookmaker  draftkings

Requires: httpx  (pip install httpx)
"""

import argparse
import csv
import sys
import time
from datetime import date, timedelta

import httpx

API_KEY = "7d385f169bc836ecbf0a610e5031a64d"
BASE_URL = "https://api.the-odds-api.com/v4/historical/sports/basketball_nba/odds"

PLAYER_MARKETS = {"player_points", "player_rebounds", "player_assists"}

CSV_HEADERS = [
    "game_date",
    "commence_time",
    "home_team",
    "away_team",
    "market_type",
    "player_name",
    "outcome_label",
    "line_value",
    "price",
    "bookmaker",
    "snapshot_time",
]


def _outcome_label(name: str, market_type: str, home_team: str) -> str:
    if market_type in ("h2h", "spreads"):
        return "HOME" if name == home_team else "AWAY"
    return name.upper()  # "Over" -> "OVER", "Under" -> "UNDER"


def _daterange(start: date, end: date):
    current = start
    while current <= end:
        yield current
        current += timedelta(days=1)


def fetch_day(day: date, markets: str, bookmaker: str) -> list[dict]:
    """Fetch a historical odds snapshot for a single calendar day."""
    snapshot_ts = f"{day.isoformat()}T12:00:00Z"
    commence_from = f"{day.isoformat()}T00:00:00Z"
    commence_to = f"{(day + timedelta(days=1)).isoformat()}T00:00:00Z"

    params = {
        "apiKey": API_KEY,
        "date": snapshot_ts,
        "markets": markets,
        "bookmakers": bookmaker,
        "oddsFormat": "american",
        "commenceTimeFrom": commence_from,
        "commenceTimeTo": commence_to,
    }

    resp = httpx.get(BASE_URL, params=params, timeout=20)
    resp.raise_for_status()
    return resp.json().get("data", [])


def events_to_rows(events: list[dict], bookmaker: str, snapshot_time: str) -> list[list]:
    rows = []
    for event in events:
        home = event["home_team"]
        away = event["away_team"]
        game_date = event["commence_time"][:10]
        commence_time = event["commence_time"]

        bookmakers = event.get("bookmakers", [])
        bk = next((b for b in bookmakers if b["key"] == bookmaker), None)
        if bk is None:
            bk = bookmakers[0] if bookmakers else None
        if bk is None:
            continue

        for market in bk.get("markets", []):
            mtype = market["key"]
            for outcome in market.get("outcomes", []):
                label = _outcome_label(outcome["name"], mtype, home)
                player_name = outcome.get("description", "") if mtype in PLAYER_MARKETS else ""
                line_value = outcome.get("point", "")
                price = outcome.get("price", "")

                rows.append([
                    game_date,
                    commence_time,
                    home,
                    away,
                    mtype,
                    player_name,
                    label,
                    line_value,
                    price,
                    bk["key"],
                    snapshot_time,
                ])
    return rows


def main():
    parser = argparse.ArgumentParser(description="Fetch historical NBA odds to CSV")
    parser.add_argument("--start-date", default="2024-10-22", help="YYYY-MM-DD")
    parser.add_argument("--end-date", default="2024-11-22", help="YYYY-MM-DD")
    parser.add_argument("--output", default="odds.csv", help="Output CSV path")
    parser.add_argument(
        "--markets",
        default="h2h,spreads,totals,player_points,player_rebounds,player_assists",
    )
    parser.add_argument("--bookmaker", default="draftkings")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print rows to stdout instead of writing CSV",
    )
    args = parser.parse_args()

    start = date.fromisoformat(args.start_date)
    end = date.fromisoformat(args.end_date)

    if args.dry_run:
        writer = csv.writer(sys.stdout)
        writer.writerow(CSV_HEADERS)
        out_file = None
    else:
        out_file = open(args.output, "w", newline="", encoding="utf-8")
        writer = csv.writer(out_file)
        writer.writerow(CSV_HEADERS)

    total_rows = 0
    total_days = (end - start).days + 1

    try:
        for i, day in enumerate(_daterange(start, end), 1):
            snapshot_ts = f"{day.isoformat()}T12:00:00Z"
            print(f"[{i}/{total_days}] Fetching {day} ...", file=sys.stderr)

            try:
                events = fetch_day(day, args.markets, args.bookmaker)
            except httpx.HTTPStatusError as exc:
                print(f"  HTTP {exc.response.status_code} — skipping {day}", file=sys.stderr)
                time.sleep(1)
                continue
            except httpx.RequestError as exc:
                print(f"  Request error ({exc}) — skipping {day}", file=sys.stderr)
                time.sleep(1)
                continue

            rows = events_to_rows(events, args.bookmaker, snapshot_ts)
            for row in rows:
                writer.writerow(row)
            total_rows += len(rows)
            print(
                f"  {len(events)} events, {len(rows)} outcome rows",
                file=sys.stderr,
            )

            if i < total_days:
                time.sleep(0.5)

    finally:
        if out_file:
            out_file.close()

    print(
        f"\nDone. {total_rows} rows written to "
        f"{'stdout' if args.dry_run else args.output}",
        file=sys.stderr,
    )


if __name__ == "__main__":
    main()
