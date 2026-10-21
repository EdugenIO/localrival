// OpenDota project selections replace its defaults; always include the basics.
export function dotaMatchesPath(limit=50){
  const fields=['hero_id','start_time','duration','game_mode','lobby_type','kills','deaths','assists','leaver_status','party_size','gold_per_min','xp_per_min','last_hits','hero_damage','hero_healing','tower_damage'];
  const params=new URLSearchParams({significant:'0',limit:String(limit)});
  for(const field of fields)params.append('project',field);
  return '/matches?'+params.toString();
}
