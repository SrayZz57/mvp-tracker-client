// Calculs purs de la connexion quotidienne. Les jours sont des jours UTC
// ('YYYY-MM-DD'), comme la clé `ref` du registre serveur (voir shop_claim_daily
// dans sql/shop.sql) : seule l'AFFICHAGE se base sur l'horloge du PC, c'est le
// serveur qui décide si un crédit est accordé.

const DAY_MS = 24 * 3600 * 1000;

export const utcDayKey = (ms) => new Date(ms).toISOString().slice(0, 10);

// Les n derniers jours, du plus ancien à aujourd'hui.
export const lastDays = (nowMs, n = 7) => Array.from({ length: n }, (_, i) => utcDayKey(nowMs - (n - 1 - i) * DAY_MS));

// Jours consécutifs réclamés. Si aujourd'hui n'est pas encore réclamé, la série
// court jusqu'à hier (elle n'est cassée qu'à la fin de la journée).
export function dailyStreak(claimed, nowMs) {
  let day = claimed.has(utcDayKey(nowMs)) ? nowMs : nowMs - DAY_MS;
  let streak = 0;
  while (claimed.has(utcDayKey(day))) {
    streak += 1;
    day -= DAY_MS;
  }
  return streak;
}

// Millisecondes avant le prochain 00:00 UTC (nouvelle récompense).
export const msUntilNextDay = (nowMs) => (Math.floor(nowMs / DAY_MS) + 1) * DAY_MS - nowMs;
