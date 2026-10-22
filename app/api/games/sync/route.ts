import {env} from 'cloudflare:workers';
import {currentUser, database, getLink, json, publicLink, sameOrigin} from '../../../../lib/server';
import {fetchDota, providerIssue} from '../../../../lib/game-data.mjs';
import {ladderSummary} from '../../../../lib/ladder-data.mjs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  if (!sameOrigin(request)) return json({error: 'Invalid request origin'}, 403);
  const user = await currentUser();
  if (!user) return json({error: 'Sign in required'}, 401);
  const link = await getLink(user.userId);
  if (!link) return json({error: 'Connect Steam first.'}, 409);
  const now = Date.now();
  const gate = await database().prepare('UPDATE steam_links SET refresh_after=? WHERE user_id=? AND steam_id=? AND refresh_after<=? RETURNING dota_data')
    .bind(now + 60000, user.userId, link.steam_id, now).first<{dota_data: string | null}>();
  if (!gate) return json({error: 'Please wait one minute between refreshes.', account: publicLink(link)}, 429);

  const errors: string[] = [];
  const providerStatus: Record<string, unknown> = {};
  let refreshAfter = now + 60000;
  let saved = gate.dota_data ? JSON.parse(gate.dota_data) : null;
  let summary: string | null = null;
  let successful = false;
  try {
    const secrets = env as Cloudflare.Env & {OPENDOTA_API_KEY?: string};
    const data = await fetchDota(link.steam_id, undefined, {apiKey: secrets.OPENDOTA_API_KEY});
    if (!data.matches.length && saved?.matches?.length) {
      errors.push('OpenDota returned no matches. Your saved match history has been retained.');
      providerStatus.dota = {status: 'empty_response'};
    } else {
      saved = {...data, name:data.name||saved?.name||null, syncMethod: 'server', leaderboardEligible: true, syncIssue: null, fetchedAt: Date.now()};
      summary = JSON.stringify(ladderSummary(saved));
      successful = true;
      providerStatus.dota = {status: 'ok'};
    }
  } catch (error) {
    const issue = providerIssue(error, 'dota');
    if (issue.retryAfterSeconds) refreshAfter = Math.max(refreshAfter, Date.now() + issue.retryAfterSeconds * 1000);
    providerStatus.dota = issue;
    errors.push(issue.message);
    saved = saved ? {...saved, notice:saved.status==='error'?issue.message:saved.notice, syncIssue: issue} : {source: issue.source, status: 'error', matches: [], notice: issue.message, syncIssue: issue};
  }
  // Compare the snapshot read at the gate; a newer provider write always wins.
  const update = successful
    ? "UPDATE steam_links SET dota_data=?,leaderboard_data=?,browser_data=NULL,synced_at=?,refresh_after=? WHERE user_id=? AND steam_id=? AND COALESCE(dota_data,'')=? RETURNING steam_id"
    : "UPDATE steam_links SET dota_data=?,synced_at=?,refresh_after=? WHERE user_id=? AND steam_id=? AND COALESCE(dota_data,'')=? RETURNING steam_id";
  const values = successful ? [JSON.stringify(saved), summary, Date.now(), refreshAfter] : [JSON.stringify(saved), Date.now(), refreshAfter];
  const updated = await database().prepare(update).bind(...values, user.userId, link.steam_id, gate.dota_data || '').first();
  return json({account: publicLink(await getLink(user.userId)), errors, providerStatus, superseded: !updated});
}
