export function fmtOdds(price) {
  if (price == null) return "–";
  return price > 0 ? `+${price}` : `${price}`;
}

export function fmtLine(line) {
  if (line == null) return "–";
  return line > 0 ? `+${line}` : `${line}`;
}

export function fmtMargin(margin) {
  if (margin == null) return "";
  const abs = Math.abs(margin);
  return abs % 1 === 0 ? abs.toFixed(0) : abs.toFixed(1);
}

export function fmtPercent(ratio) {
  if (ratio == null) return "–";
  return (ratio * 100).toFixed(1) + "%";
}

export function fmtMoney(n) {
  if (n == null) return "–";
  const abs = Math.abs(n).toFixed(2);
  return n < 0 ? `-$${abs}` : `$${abs}`;
}
