// NFL team colors (primary, secondary, accent), keyed by Sleeper-style abbreviation.
const COLORS: Record<string, string[]> = {
  ARI: ["#97233F", "#FFB612", "#FFFFFF"],
  ATL: ["#A71930", "#000000", "#A5ACAF"],
  BAL: ["#241773", "#9E7C0C", "#FFFFFF"],
  BUF: ["#00338D", "#C60C30", "#FFFFFF"],
  CAR: ["#0085CA", "#101820", "#BFC0BF"],
  CHI: ["#0B162A", "#C83803", "#FFFFFF"],
  CIN: ["#FB4F14", "#000000", "#FFFFFF"],
  CLE: ["#311D00", "#FF3C00", "#FFFFFF"],
  DAL: ["#003594", "#869397", "#FFFFFF"],
  DEN: ["#FB4F14", "#002244", "#FFFFFF"],
  DET: ["#0076B6", "#B0B7BC", "#FFFFFF"],
  GB: ["#203731", "#FFB612", "#FFFFFF"],
  HOU: ["#03202F", "#A71930", "#FFFFFF"],
  IND: ["#002C5F", "#A2AAAD", "#FFFFFF"],
  JAX: ["#006778", "#D7A22A", "#101820"],
  KC: ["#E31837", "#FFB81C", "#FFFFFF"],
  LV: ["#000000", "#A5ACAF", "#FFFFFF"],
  LAC: ["#0080C6", "#FFC20E", "#FFFFFF"],
  LAR: ["#003594", "#FFA300", "#FFFFFF"],
  MIA: ["#008E97", "#FC4C02", "#FFFFFF"],
  MIN: ["#4F2683", "#FFC62F", "#FFFFFF"],
  NE: ["#002244", "#C60C30", "#B0B7BC"],
  NO: ["#D3BC8D", "#101820", "#FFFFFF"],
  NYG: ["#0B2265", "#A71930", "#FFFFFF"],
  NYJ: ["#125740", "#FFFFFF", "#000000"],
  PHI: ["#004C54", "#A5ACAF", "#FFFFFF"],
  PIT: ["#FFB612", "#101820", "#FFFFFF"],
  SF: ["#AA0000", "#B3995D", "#FFFFFF"],
  SEA: ["#002244", "#69BE28", "#A5ACAF"],
  TB: ["#D50A0A", "#FF7900", "#34302B"],
  TEN: ["#0C2340", "#4B92DB", "#C8102E"],
  WAS: ["#5A1414", "#FFB612", "#FFFFFF"],
};

const ALIASES: Record<string, string> = { WSH: "WAS", JAC: "JAX", LA: "LAR", OAK: "LV", SD: "LAC" };

// Festive fallback for players without a known team.
const DEFAULT = ["#3b82f6", "#22c55e", "#fbbf24", "#ef4444", "#a855f7"];

export function teamColors(team?: string): string[] {
  if (!team) return DEFAULT;
  const t = team.toUpperCase();
  return COLORS[ALIASES[t] ?? t] ?? DEFAULT;
}
