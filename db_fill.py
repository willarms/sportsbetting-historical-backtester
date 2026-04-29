import oracledb
from datetime import timedelta

# connection
_DB_USER     = "group10"
_DB_PASSWORD = "group10"
_DB_DSN      = "127.0.0.1:1521/xepdb1"

conn = oracledb.connect(user=_DB_USER, password=_DB_PASSWORD, dsn=_DB_DSN)
cur  = conn.cursor()

print("Connected to Oracle", conn.version)

# Back to back flag
print("\n--- Calculating back-to-back flags ---")

cur.execute("""
    SELECT g.gameID, g.game_date,
    t1.team_name AS home_team,
    t2.team_name AS away_team
    FROM Games g
    JOIN Teams t1 ON g.home_teamID = t1.teamID
    JOIN Teams t2 ON g.away_teamID = t2.teamID
    ORDER BY g.game_date
""")
games = cur.fetchall() 

# (team, date) pairs
played_on = set()
for game_id, game_date, home_team, away_team in games:
    played_on.add((home_team, game_date))
    played_on.add((away_team, game_date))

# For each game decide btb flags then batch update
btb_updates = []
for game_id, game_date, home_team, away_team in games:
    prev = game_date - timedelta(days=1)
    home_btb = 1 if (home_team, prev) in played_on else 0
    away_btb = 1 if (away_team, prev) in played_on else 0
    btb_updates.append((home_btb, away_btb, game_id))

cur.executemany(
    "UPDATE Games SET home_btb = :1, away_btb = :2 WHERE gameID = :3",
    btb_updates
)
conn.commit()
print(f"Updated {len(btb_updates)} games with btb flags.")


# is_winner and is_push
print("\n--- Calculating is_winner / is_push ---")

# Pull every outcome joined to its game result
cur.execute("""
    SELECT mo.outcomeID,
    mk.market_type,
    mo.outcome_label,
    mo.line_value,
    g.home_score,
    g.away_score,
    g.total_score,
    g.home_win
    FROM MarketOutcomes mo
    JOIN Markets mk ON mo.marketID = mk.marketID
    JOIN Games g ON mk.gameID = g.gameID
""")
outcomes = cur.fetchall()

outcome_updates = []

for outcome_id, market_type, outcome_label, line_value, home_score, away_score, total_score, home_win in outcomes:
    is_winner = None
    is_push   = None
    
    if home_score is None or away_score is None or total_score is None:
        # Game result not available — leave NULL
        outcome_updates.append((None, None, outcome_id))
        continue

    home_margin = home_score - away_score   # positive = home won

    # moneyline
    if market_type == "h2h":
        if outcome_label == "HOME":
            is_winner = 1 if home_win == 1 else 0
        elif outcome_label == "AWAY":
            is_winner = 1 if home_win == 0 else 0
        is_push = 0  # moneylines can't push

    # spreads
    elif market_type == "spreads":
        if line_value is None:
            outcome_updates.append((None, None, outcome_id))
            continue
        if outcome_label == "HOME":
            # Home covers if (home_margin + home_spread) > 0
            spread_margin = home_margin + float(line_value)
        else:  # AWAY
            spread_margin = (-home_margin) + float(line_value)

        if spread_margin > 0:
            is_winner, is_push = 1, 0
        elif spread_margin == 0:
            is_winner, is_push = 0, 1
        else:
            is_winner, is_push = 0, 0

    # totals
    elif market_type == "totals":
        if line_value is None:
            outcome_updates.append((None, None, outcome_id))
            continue
        total_margin = float(total_score) - float(line_value)

        if outcome_label == "OVER":
            if total_margin > 0:
                is_winner, is_push = 1, 0
            elif total_margin == 0:
                is_winner, is_push = 0, 1
            else:
                is_winner, is_push = 0, 0
        else:  # UNDER
            if total_margin < 0:
                is_winner, is_push = 1, 0
            elif total_margin == 0:
                is_winner, is_push = 0, 1
            else:
                is_winner, is_push = 0, 0

    outcome_updates.append((is_winner, is_push, outcome_id))

cur.executemany(
    "UPDATE MarketOutcomes SET is_winner = :1, is_push = :2 WHERE outcomeID = :3",
    outcome_updates
)
conn.commit()
print(f"Updated {len(outcome_updates)} market outcomes.")

cur.close()
conn.close()
print("\nDone. All complete.")
