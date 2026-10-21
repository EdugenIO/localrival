export const MATCH_WINDOW = 50;
const MODE_NAMES={1:'All Pick',2:'Captains Mode',3:'Random Draft',4:'Single Draft',5:'All Random',6:'Intro',7:'Diretide',8:'Reverse Captains Mode',9:'Greeviling',10:'Tutorial',11:'Mid Only',12:'Least Played',13:'Limited Heroes',14:'Compendium Matchmaking',15:'Custom',16:'Captains Draft',17:'Balanced Draft',18:'Ability Draft',19:'Event',20:'All Random Deathmatch',21:'1v1 Mid',22:'All Draft',23:'Turbo',24:'Mutation',25:'Coaches Challenge'};
export function dotaMode(gameMode,lobbyType){
  if(gameMode===23)return 'Turbo';
  const name=MODE_NAMES[gameMode]||'Other mode';
  if(lobbyType===7)return 'Ranked · '+name;
  if(lobbyType===4)return 'Bots · '+name;
  if(lobbyType===1)return 'Practice · '+name;
  return 'Normal / other · '+name;
}
export function matchPerformance(matches){
  const completed=matches.filter(m=>typeof m.won==='boolean');
  const eligible=completed.filter(m=>!m.abandoned);
  const wins=eligible.filter(m=>m.won).length;
  const losses=eligible.length-wins;
  const modeCounts={};
  for(const m of completed){const type=m.gameMode===23?'Turbo':m.lobbyType===7?'Ranked':m.lobbyType===0?'Normal':'Other';modeCounts[type]=(modeCounts[type]||0)+1;}
  return {version:1,points:wins*3+losses,wins,losses,eligibleMatches:eligible.length,excludedMatches:completed.length-eligible.length,window:MATCH_WINDOW,provisional:eligible.length<10,modeCounts,rule:'3 points per win + 1 per completed loss. Matches you left receive 0 points. All modes count equally; latest 50 available matches.'};
}
