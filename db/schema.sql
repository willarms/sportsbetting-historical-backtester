-- Drop tables in reverse dependency order (safe re-run)
DROP TABLE Bets CASCADE CONSTRAINTS PURGE;
DROP TABLE StrategyRuns CASCADE CONSTRAINTS PURGE;
DROP TABLE Strategies CASCADE CONSTRAINTS PURGE;
DROP TABLE MarketOutcomes CASCADE CONSTRAINTS PURGE;
DROP TABLE Markets CASCADE CONSTRAINTS PURGE;
DROP TABLE Games CASCADE CONSTRAINTS PURGE;
DROP TABLE Teams CASCADE CONSTRAINTS PURGE;
DROP TABLE Book CASCADE CONSTRAINTS PURGE;
DROP TABLE Sports CASCADE CONSTRAINTS PURGE;
DROP TABLE Users CASCADE CONSTRAINTS PURGE;

CREATE TABLE Users (
    userID      NUMBER PRIMARY KEY,
    email       VARCHAR2(255) NOT NULL UNIQUE,
    username    VARCHAR2(100) NOT NULL UNIQUE,
    password    VARCHAR2(255) NOT NULL
);

CREATE TABLE Sports (
    sportID     NUMBER PRIMARY KEY,
    sport_name  VARCHAR2(100) NOT NULL
);

CREATE TABLE Teams (
    teamID      NUMBER PRIMARY KEY,
    team_name   VARCHAR2(100) NOT NULL,
    sportID     NUMBER NOT NULL,
    CONSTRAINT fk_teams_sport FOREIGN KEY (sportID) REFERENCES Sports(sportID)
);

CREATE TABLE Book (
    bookID      NUMBER PRIMARY KEY,
    book_name   VARCHAR2(100) NOT NULL
);

CREATE TABLE Games (
    gameID        NUMBER PRIMARY KEY,
    game_date     DATE NOT NULL,
    sportID       NUMBER NOT NULL,
    home_teamID   NUMBER NOT NULL,
    away_teamID   NUMBER NOT NULL,
    home_score    NUMBER,
    away_score    NUMBER,
    total_score   NUMBER,
    home_spread   NUMBER(5,1),
    home_win      NUMBER(1),
    home_btb      NUMBER(1),
    away_btb      NUMBER(1),
    CONSTRAINT fk_games_sport     FOREIGN KEY (sportID)     REFERENCES Sports(sportID),
    CONSTRAINT fk_games_home_team FOREIGN KEY (home_teamID) REFERENCES Teams(teamID),
    CONSTRAINT fk_games_away_team FOREIGN KEY (away_teamID) REFERENCES Teams(teamID)
);

CREATE TABLE Markets (
    marketID     NUMBER PRIMARY KEY,
    gameID       NUMBER NOT NULL,
    bookID       NUMBER NOT NULL,
    market_type  VARCHAR2(50) NOT NULL,
    CONSTRAINT fk_markets_game FOREIGN KEY (gameID) REFERENCES Games(gameID),
    CONSTRAINT fk_markets_book FOREIGN KEY (bookID) REFERENCES Book(bookID)
);

CREATE TABLE MarketOutcomes (
    outcomeID     NUMBER PRIMARY KEY,
    marketID      NUMBER NOT NULL,
    bookID        NUMBER NOT NULL,
    outcome_label VARCHAR2(10) NOT NULL,
    line_value    NUMBER(5,1),
    price         NUMBER(6,2),
    is_winner     NUMBER(1),
    is_push       NUMBER(1),
    CONSTRAINT fk_outcomes_market FOREIGN KEY (marketID) REFERENCES Markets(marketID),
    CONSTRAINT fk_outcomes_book   FOREIGN KEY (bookID)   REFERENCES Book(bookID),
    CONSTRAINT chk_outcome_label  CHECK (outcome_label IN ('HOME', 'AWAY', 'OVER', 'UNDER'))
);

CREATE TABLE Strategies (
    strategyID    NUMBER PRIMARY KEY,
    userID        NUMBER NOT NULL,
    strategy_name VARCHAR2(200) NOT NULL,
    description   VARCHAR2(1000),
    created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_strategies_user FOREIGN KEY (userID) REFERENCES Users(userID)
);

CREATE TABLE StrategyRuns (
    runID        NUMBER PRIMARY KEY,
    strategyID   NUMBER NOT NULL,
    start_date   DATE NOT NULL,
    end_date     DATE NOT NULL,
    created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_runs_strategy FOREIGN KEY (strategyID) REFERENCES Strategies(strategyID)
);

CREATE TABLE Bets (
    betID       NUMBER PRIMARY KEY,
    runID       NUMBER NOT NULL,
    outcomeID   NUMBER NOT NULL,
    stake       NUMBER(10,2) NOT NULL,
    result      VARCHAR2(20),
    profit      NUMBER(10,2),
    CONSTRAINT fk_bets_run     FOREIGN KEY (runID)     REFERENCES StrategyRuns(runID),
    CONSTRAINT fk_bets_outcome FOREIGN KEY (outcomeID) REFERENCES MarketOutcomes(outcomeID)
);

COMMIT;
