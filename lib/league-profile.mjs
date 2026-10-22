export const LEAGUE_REGIONS=['oce','na','euw','eune','kr','jp','br','lan','las','tr','ru','sg','ph','tw','vn','th','me'];
export function leagueIdentity(riotId,region){
 if(typeof riotId!=='string'||!LEAGUE_REGIONS.includes(region))throw Error('Enter a Riot ID and select a supported region.');
 const parts=riotId.trim().split('#');
 if(parts.length!==2||parts[0].length<3||parts[0].length>32||!/^[\p{L}\p{N}]{2,8}$/u.test(parts[1])||/[\x00-\x1f/\\?#]/.test(parts[0]))throw Error('Use your full Riot ID: Name#Tag.');
 const [name,tag]=parts;return {riotId:name+'#'+tag,region,url:`https://op.gg/lol/summoners/${region}/${encodeURIComponent(name)}-${encodeURIComponent(tag)}`};
}
export function parseLeagueProfile(html,identity,now=Date.now()){
 const nodes=[];
 for(const m of html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)){
  try{const value=JSON.parse(m[1]);nodes.push(...(Array.isArray(value)?value:value['@graph']||[value]))}catch{/* Ignore unrelated malformed metadata. */}
 }
 const person=nodes.find(n=>n['@type']==='Person'&&typeof n.name==='string');
 if(!person||person.name.toLocaleLowerCase()!==identity.riotId.toLocaleLowerCase())throw Error('Profile not found or OP.GG could not provide this profile. Check your tag and region.');
 const page=nodes.find(n=>n['@type']==='ProfilePage');
 const list=nodes.find(n=>n['@type']==='ItemList'&&String(n['@id']).endsWith('#recent-games'));
 const matches=(list?.itemListElement||[]).slice(0,20).flatMap(entry=>{
  const item=entry.item,props=Object.fromEntries((item?.additionalProperty||[]).map(p=>[p.name,p.value]));
  if(!['WIN','LOSE','REMAKE'].includes(props.result)||!['kills','deaths','assists'].every(k=>Number.isInteger(props[k])&&props[k]>=0&&props[k]<1000))return [];
  if(/custom/i.test(String(props.queueType)))return [];
  return [{champion:String(props.champion||'Unknown').slice(0,60),mode:String(props.queueType||'Unknown').slice(0,60),result:props.result,kills:props.kills,deaths:props.deaths,assists:props.assists,playedAt:Number.isFinite(Date.parse(item.startTime))?item.startTime:null}];
 });
 return {...identity,riotId:person.name,matches,source:'OP.GG',fetchedAt:now,sourceUpdatedAt:Number.isFinite(Date.parse(page?.dateModified))?page.dateModified:null,ownershipVerified:false};
}
const cache=new Map();let nextRequest=0;
export async function fetchLeagueProfile(identity,fetcher=fetch){
 const cached=cache.get(identity.url);if(cached&&cached.until>Date.now())return cached.data;
 if(Date.now()<nextRequest)throw Error('Please wait a few seconds before searching again.');
 nextRequest=Date.now()+3000;
 const response=await fetcher(identity.url,{redirect:'error',signal:AbortSignal.timeout(12000),headers:{Accept:'text/html'}});
 if(!response.ok)throw Error(response.status===429?'OP.GG is busy. Please try later.':'OP.GG could not load this profile. Check your Riot ID and region.');
 if(!response.headers.get('content-type')?.includes('text/html'))throw Error('OP.GG returned an unsupported response.');
 const reader=response.body.getReader();const chunks=[];let size=0;
 try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>2500000)throw Error('OP.GG response was too large.');chunks.push(value)}}finally{await reader.cancel()}
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length}
 const data=parseLeagueProfile(new TextDecoder().decode(bytes),identity);
 if(cache.size>=200)cache.delete(cache.keys().next().value);
 cache.set(identity.url,{until:Date.now()+15*60000,data});return data;
}
