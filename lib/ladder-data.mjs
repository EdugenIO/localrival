import {matchPerformance} from './match-performance.mjs';

// Only server/provider-confirmed snapshots may produce public scores.
export function ladderSummary(data) {
  if (data?.leaderboardEligible !== true || !['server', 'nightly'].includes(data.syncMethod)) return null;
  const matches = data.matches.slice(0, 50);
  const performance = matchPerformance(matches);
  return {name: data.name, ...performance, fetchedAt: data.fetchedAt,
    form: matches.slice(0, 5).map(m => m.abandoned ? 'A' : m.won ? 'W' : 'L').join('')};
}
