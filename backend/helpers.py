import hashlib
from typing import Optional
import data

def hash_password(plain: str) -> str:
    return hashlib.sha256(plain.encode()).hexdigest()

# American odds to implied prob
def to_prob(american: float) -> float:
    if american > 0:
        return 100 / (american + 100)
    return -american / (-american + 100)


def to_american(prob: float) -> int:
    """Implied probability → American odds (rounded to nearest integer)."""
    if prob <= 0 or prob >= 1:
        return 0
    if prob >= 0.5:
        return round(-(prob * 100) / (1 - prob))
    return round((1 - prob) * 100 / prob)


# Calculates fiar probability for a market --> gets rid of book vig
def devig_prob(game_odds, market: str, label: str) -> Optional[float]:
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
        p_side = to_prob(float(side_rows.iloc[i]))
        p_opp  = to_prob(float(opp_rows.iloc[i]))
        total  = p_side + p_opp
        if total > 0:
            devigged_probs.append(p_side / total)

    if not devigged_probs:
        return None
    return sum(devigged_probs) / len(devigged_probs)


# Compute betting lines for a game --> given all opening line rows for a game, return dictionary of lines
def compute_lines(game_odds, book: str, home_score: int, away_score: int, total_score: int, home_win: int):
    if game_odds is None or (hasattr(game_odds, 'empty') and game_odds.empty):
        return None

    if book == "consensus":
        rows = game_odds
    else:
        rows = game_odds[game_odds["bookmaker"] == book]
        if rows.empty:
            return None

    def price(mkt, label):
        subset = rows[(rows["market_type"] == mkt) & (rows["outcome_label"] == label)]["price"].dropna()
        if subset.empty:
            return None
        # Check if consensus (if so use average)
        if book != "consensus" or len(subset) == 1:
            return int(subset.iloc[0])
        avg_prob = subset.apply(to_prob).mean()
        return to_american(avg_prob)

    def line_val(mkt, label):
        subset = rows[(rows["market_type"] == mkt) & (rows["outcome_label"] == label)]["line_value"].dropna()
        if subset.empty:
            return None
        # For consensus, average the line values across books
        val = subset.mean() if book == "consensus" else subset.iloc[0]
        # NaN guard
        return None if val != val else round(float(val), 1)

    ml_home = price("h2h", "HOME")
    ml_away = price("h2h", "AWAY")

    spread_line = line_val("spreads", "HOME")
    spread_covered, spread_margin = None, None
    if spread_line is not None:
        spread_margin = round((home_score - away_score) + spread_line, 1)
        spread_covered = spread_margin > 0

    total_line = line_val("totals", "OVER")
    went_over, total_margin = None, None
    if total_line is not None:
        total_margin = round(total_score - total_line, 1)
        went_over = total_margin > 0

    if book == "consensus":
        book_label = "Consensus"
    else:
        book_label = book

    return {
        "bookmaker": book_label,
        "ml_home": ml_home,
        "ml_away": ml_away,
        "ml_home_hit": bool(home_win),
        "spread_line": spread_line,
        "spread_home_covered": spread_covered,
        "spread_margin":spread_margin,
        "total_line": total_line,
        "total_went_over": went_over,
        "total_margin": total_margin,
    }


# Add computed game lines to game record in dictionary
def enrich(record: dict, book: str) -> dict:
    key = (record["home_team"], record["away_team"], record["_game_date_obj"])
    game_odds = data.odds_index.get(key)
    record["lines"] = compute_lines(
        game_odds, book,
        home_score=record["home_score"],
        away_score=record["away_score"],
        total_score=record["total_score"],
        home_win=record["home_win"],
    )
    # don't need to return this
    del record["_game_date_obj"]
    return record


# Convert a Strategies DB row to a clean API response dict
def strategy_row_to_dict(row) -> dict:
    return {
        "strategyID": int(row[0]),
        "userID": int(row[1]),
        "strategy_name": row[2],
        "description": row[3],
        "market_type": row[4],
        "side": row[5],
        "book": row[6] if row[6] else "consensus",
        "stake": float(row[7]),
        "team_filter": row[8],
        "team_side": row[9],
        "season_filter": row[10],
        "posEV_only": bool(row[11]),
        "fade_btbs": bool(row[12]),
        "date_from": str(row[13]) if row[13] else None,
        "date_to": str(row[14]) if row[14] else None,
        "created_at": str(row[15]) if row[15] else None,
    }
