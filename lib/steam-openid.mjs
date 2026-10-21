export const STEAM_ENDPOINT = 'https://steamcommunity.com/openid/login';
export const OPENID_NS = 'http://specs.openid.net/auth/2.0';
export const SITE_ORIGIN = 'https://local-rival-brett.stony-fir-8901.chatgpt.site';
export const STATE_COOKIE = '__Host-lr-steam-state';

export async function hashState(state) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(state));
  return [...new Uint8Array(bytes)].map(x => x.toString(16).padStart(2, '0')).join('');
}
export function createState() {
  return [...crypto.getRandomValues(new Uint8Array(32))].map(x=>x.toString(16).padStart(2,'0')).join('');
}
export function steamLoginUrl(returnTo) {
  const url = new URL(STEAM_ENDPOINT);
  for (const [key, value] of Object.entries({ns:OPENID_NS,mode:'checkid_setup',return_to:returnTo,realm:SITE_ORIGIN+'/',identity:OPENID_NS+'/identifier_select',claimed_id:OPENID_NS+'/identifier_select'})) url.searchParams.set('openid.'+key,value);
  return url.toString();
}
export function validateAssertion(params, expectedReturnTo, now = Date.now()) {
  for (const key of new Set(params.keys())) if (params.getAll(key).length !== 1) throw new Error('Duplicate callback parameter');
  const get = key=>params.get('openid.'+key);
  if (get('ns')!==OPENID_NS || get('mode')!=='id_res' || get('op_endpoint')!==STEAM_ENDPOINT || get('return_to')!==expectedReturnTo) throw new Error('Unexpected Steam response');
  const identity = get('claimed_id');
  if (!identity || identity!==get('identity') || !/^https:\/\/steamcommunity\.com\/openid\/id\/7656119\d{10}$/.test(identity)) throw new Error('Invalid Steam identity');
  const steamId = identity.split('/').pop();
  steamAccountId(steamId);
  const signed = new Set((get('signed')||'').split(','));
  for (const field of ['op_endpoint','claimed_id','identity','return_to','response_nonce','assoc_handle']) if (!signed.has(field)) throw new Error('Missing signed field');
  const nonce = get('response_nonce') || '';
  if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ.+$/.test(nonce)) throw new Error('Invalid nonce');
  const timestamp = Date.parse(nonce.slice(0,20));
  if (!Number.isFinite(timestamp) || now-timestamp>600000 || timestamp-now>60000 || !get('sig') || !get('assoc_handle')) throw new Error('Expired or incomplete assertion');
  return steamId;
}
export function steamAccountId(steamId) {
  if (!/^\d{17}$/.test(steamId)) throw new Error('Invalid Steam ID');
  const id=BigInt(steamId)-76561197960265728n;
  if(id<=0n || id>4294967295n) throw new Error('Invalid individual Steam ID');
  return id.toString();
}
export async function verifyWithSteam(params, fetcher=fetch) {
  const body=new URLSearchParams();
  for(const [key,value] of params) if(key.startsWith('openid.')) body.set(key,value);
  body.set('openid.mode','check_authentication');
  const response=await fetcher(STEAM_ENDPOINT,{method:'POST',body,redirect:'error',signal:AbortSignal.timeout(12000)});
  if(!response.ok) throw new Error('Steam verification unavailable');
  const result=await response.text();
  if(result.length>4096 || !/^is_valid:true\r?$/m.test(result)) throw new Error('Steam did not verify this login');
}
