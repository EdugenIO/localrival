import {json} from '../../../../lib/server';
export const dynamic='force-dynamic';
// Pages now redirects to Render. Never issue JavaScript-readable session tokens.
export async function POST() {return json({error:'This sign-in method has retired. Sign in directly on Local Rival.'},410)}
