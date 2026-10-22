import {currentUser,database,json,sameOrigin} from '../../../../lib/server';
import {leagueIdentity,fetchLeagueProfile} from '../../../../lib/league-profile.mjs';
export const dynamic='force-dynamic';
export async function prepareLeague(){await database().prepare('CREATE TABLE IF NOT EXISTS league_profiles (user_id TEXT PRIMARY KEY,snapshot TEXT NOT NULL)').run()}
export async function GET(){const user=await currentUser();if(!user)return json({profile:null,signedIn:false});await prepareLeague();const row=await database().prepare('SELECT snapshot FROM league_profiles WHERE user_id=?').bind(user.userId).first<{snapshot:string}>();return json({profile:row?JSON.parse(row.snapshot):null,signedIn:true})}
export async function POST(request:Request){
 if(!sameOrigin(request))return json({error:'Invalid request origin'},403);
 let body:Record<string,unknown>;try{const value=await request.json();if(!value||typeof value!=='object'||Array.isArray(value))return json({error:'Invalid request'},400);body=value as Record<string,unknown>}catch{return json({error:'Invalid request'},400)}
 if(!body||!['preview','save'].includes(String(body.action)))return json({error:'Invalid action'},400);
 const user=body.action==='save'?await currentUser():null;
 if(body.action==='save'&&!user)return json({error:'Sign in with Steam to save a tracked profile to your Local Rival account.'},401);
 let identity;try{identity=leagueIdentity(body.riotId,body.region)}catch(error){return json({error:(error as Error).message},400)}
 let profile;try{profile=await fetchLeagueProfile(identity)}catch{return json({error:'OP.GG could not provide this profile. Check the full Name#Tag and region, or try again later.'},502)}
 if(user){await prepareLeague();await database().prepare('INSERT INTO league_profiles (user_id,snapshot) VALUES (?,?) ON CONFLICT(user_id) DO UPDATE SET snapshot=excluded.snapshot').bind(user.userId,JSON.stringify(profile)).run()}
 return json({profile});
}
export async function DELETE(request:Request){if(!sameOrigin(request))return json({error:'Invalid request origin'},403);const user=await currentUser();if(!user)return json({error:'Sign in required'},401);await prepareLeague();await database().prepare('DELETE FROM league_profiles WHERE user_id=?').bind(user.userId).run();return json({profile:null})}
