import pandas as pd
import os

odds = pd.read_csv('game_odds.csv')
results = pd.read_csv('game_results.csv')

os.makedirs('csvfiles', exist_ok=True)

# sports.csv
sports = pd.DataFrame({'sportID': [1], 'sport_name': ['NBA']})
sports.to_csv('csvfiles/sports.csv', index=False, header=False)

# books.csv
books = sorted(odds['bookmaker'].unique())
book_map = {b: i for i, b in enumerate(books, 1)}
pd.DataFrame({
    'bookID':     list(book_map.values()),
    'book_name':  list(book_map.keys()),
    'book_desc':  '',
    'is_sharp':   0
}).to_csv('csvfiles/books.csv', index=False, header=False)

# teams.csv
all_teams = sorted(set(results['home_team']) | set(results['away_team']))
team_map = {t: i for i, t in enumerate(all_teams, 1)}
pd.DataFrame({'teamID': list(team_map.values()), 'team_name': list(team_map.keys()), 'sportID': 1}) \
  .to_csv('csvfiles/teams.csv', index=False, header=False)

# games.csv — join game_results to team IDs
results = results.copy()
results['gameID'] = range(1, len(results) + 1)
results['sportID'] = 1
results['home_teamID'] = results['home_team'].map(team_map)
results['away_teamID'] = results['away_team'].map(team_map)
results['home_btb'] = ''
results['away_btb'] = ''

game_lookup = {(r.game_date, r.home_team, r.away_team): r.gameID for r in results.itertuples()}

results[['gameID', 'game_date', 'sportID', 'home_teamID', 'away_teamID',
         'home_score', 'away_score', 'total_score', 'home_spread', 'home_win',
         'home_btb', 'away_btb']] \
  .to_csv('csvfiles/games.csv', index=False, header=False)

# map odds rows to gameID and bookID
odds = odds.copy()
odds['gameID'] = odds.apply(lambda r: game_lookup.get((r.game_date, r.home_team, r.away_team)), axis=1)
odds = odds.dropna(subset=['gameID'])
odds['gameID'] = odds['gameID'].astype(int)
odds['bookID'] = odds['bookmaker'].map(book_map)

# markets.csv — unique (event_id, bookID, market_type)
markets = odds[['event_id', 'gameID', 'bookID', 'market_type']] \
    .drop_duplicates(subset=['event_id', 'bookID', 'market_type']) \
    .reset_index(drop=True)
markets['marketID'] = range(1, len(markets) + 1)

market_map = {(r.event_id, r.bookID, r.market_type): r.marketID for r in markets.itertuples()}

markets[['marketID', 'gameID', 'bookID', 'market_type']] \
    .to_csv('csvfiles/markets.csv', index=False, header=False)

# marketoutcomes.csv
odds['marketID'] = odds.apply(lambda r: market_map.get((r.event_id, r.bookID, r.market_type)), axis=1)
odds = odds.dropna(subset=['marketID'])
odds['marketID'] = odds['marketID'].astype(int)
odds['outcomeID'] = range(1, len(odds) + 1)
odds['is_winner'] = ''
odds['is_push'] = ''

odds[['outcomeID', 'marketID', 'outcome_label',
      'line_value', 'price', 'is_winner', 'is_push']] \
    .to_csv('csvfiles/marketoutcomes.csv', index=False, header=False)

print("Done.")
print(f"  sports.csv        : {len(sports)} rows")
print(f"  books.csv         : {len(book_map)} rows")
print(f"  teams.csv         : {len(team_map)} rows")
print(f"  games.csv         : {len(results)} rows")
print(f"  markets.csv       : {len(markets)} rows")
print(f"  marketoutcomes.csv: {len(odds)} rows")
