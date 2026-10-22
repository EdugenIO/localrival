import {currentUser,database,getLink,json,publicLink} from '../../../../lib/server';
import {prepareLadder} from '../../../../lib/ladder-store';
import {prepareLeague} from '../../league/profile/route';
import {prepareConsent} from '../../../../lib/policy-consent';
export const dynamic='force-dynamic';
export async function GET(){
 const user=await currentUser();if(!user)return json({error:'Sign in required'},401);
 const db=database();await prepareLadder(db);await prepareLeague();await prepareConsent(db);
 const ladder=await db.prepare('SELECT m.alias,m.postcode,p.locality,v.show_suburb FROM ladder_members m LEFT JOIN ladder_places p ON p.user_id=m.user_id LEFT JOIN ladder_privacy v ON v.user_id=m.user_id WHERE m.user_id=?').bind(user.userId).first();
 const league=await db.prepare('SELECT snapshot FROM league_profiles WHERE user_id=?').bind(user.userId).first<{snapshot:string}>();
 const acceptance=await db.prepare('SELECT purpose,policy_version,accepted_at FROM policy_acceptances WHERE user_id=?').bind(user.userId).all();
 const link=await getLink(user.userId);
 const response=json({exportedAt:new Date().toISOString(),steam:publicLink(link),savedDotaSnapshots:{server:link?.dota_data?JSON.parse(link.dota_data):null,browser:link?.browser_data?JSON.parse(link.browser_data):null,publicLadder:link?.leaderboard_data?JSON.parse(link.leaderboard_data):null},ladder,league:league?JSON.parse(league.snapshot):null,policyAcceptances:acceptance.results});
 response.headers.set('Content-Disposition','attachment; filename="local-rival-data.json"');return response;
}
