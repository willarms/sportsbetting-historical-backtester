// Maps internal bookmaker IDs (from the CSV/API) to display names.
// williamhill_us was acquired by Caesars but the dataset still uses the old key.
export const BOOK_LABELS = {
  draftkings:    "DraftKings",
  fanduel:       "FanDuel",
  betmgm:        "BetMGM",
  williamhill_us:"Caesars",
  lowvig:        "LowVig",
  consensus:     "Consensus (avg)",
};

export function bookLabel(id) {
  return BOOK_LABELS[id] ?? id;
}
