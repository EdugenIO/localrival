(() => {
  const panel=document.createElement('section');panel.className='steam-panel';panel.setAttribute('aria-label','Connected Steam account');
  document.querySelector('.gamebar').before(panel);
  const top=document.getElementById('joinTop');top.textContent='◉ Connect Steam';top.onclick=()=>{panel.scrollIntoView({behavior:'smooth',block:'start'});panel.querySelector('a,button')?.focus()};
  const nav=document.createElement('button');nav.textContent='◉   Steam & live data';nav.onclick=top.onclick;document.querySelector('nav').append(nav);
  let account=null,busy=false,message='',error=false,matchFilter='all';
  const query=new URLSearchParams(location.search),status=query.get('steam');
  const statuses={linked:'Steam verified. Fetching your available game data…',expired:'This Steam connection expired. Please try again.',cancelled:'Steam connection cancelled. You can reconnect whenever you are ready.',already_linked:'This Steam account is already connected to another Local Rival user.',failed:'Steam could not verify this connection. Please try again.',failed_assertion:'The Steam response did not pass validation. Please reconnect.',failed_steam:'Steam confirmation failed. Please try again in a moment.',failed_storage:'Steam verification completed, but the account could not be saved. Please retry.'};
  if(status){message=statuses[status]||'';error=status!=='linked';history.replaceState(null,'',location.pathname)}
  function el(tag,text,className,parent=panel){const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(className)node.className=className;parent.append(node);return node}
  function button(text,action,parent=panel){const b=el('button',text,'outline',parent);b.onclick=action;b.disabled=busy;return b}
  function draw(){
    panel.replaceChildren();
    top.textContent=account?'◉ Steam connected':'◉ Connect Steam';
    const head=el('div',undefined,'steam-head');const intro=el('div',undefined,'',head);el('div','PRIVATE PILOT · REAL ACCOUNTS','eyebrow',intro);el('h2',account?'Your Steam account is connected.':'Bring your game to your home ground.','',intro);
    el('p',account?'Steam account verified. Your match performance is shown separately from the sample local leaderboard.':'Connect an existing Steam account to collect matches across Turbo, normal and other available modes.','',intro);
    if(!account){const a=el('a',undefined,'steam-signin',head);a.href='/api/steam/start';a.target='_top';const img=document.createElement('img');img.src='https://shared.fastly.steamstatic.com/community_assets/images/steamworks_docs/english/sits_large_border.png';img.alt='Sign in through Steam';img.width=180;img.height=35;a.append(img);el('p','This app remains private. No Steam password is stored by Local Rival.','steam-note');}
    else {
      const actions=el('div',undefined,'steam-actions',head);button(busy?'Refreshing…':'Refresh game data',sync,actions);button('Disconnect',disconnect,actions);
      const id=el('p','Steam ID '+account.steamId+' · Match performance pilot','steam-note');
      const link=el('a','View on Steam ↗','',id);link.href='https://steamcommunity.com/profiles/'+account.steamId;link.target='_blank';link.rel='noopener noreferrer';
      const grid=el('div',undefined,'live-grid');
      const dota=el('article',undefined,'live-card',grid);el('div','DOTA 2 / OPENDOTA','eyebrow',dota);
      if(account.dota){const d=account.dota,p=d.performance;el('h3',d.name||'Dota player','',dota);
        el('div',p&&p.eligibleMatches?p.points+' local points':'No match score yet','performance-score',dota);
        if(p){el('p',p.wins+' wins · '+p.losses+' completed losses · '+p.eligibleMatches+' scored matches','',dota);el('small',p.rule,'',dota);if(p.provisional&&p.eligibleMatches)el('small','Early sample — fewer than 10 matches.','',dota);if(p.excludedMatches)el('small',p.excludedMatches+' matches left: recorded, worth 0 points.','',dota);const counts=Object.entries(p.modeCounts).map(([mode,count])=>mode+': '+count).join(' · ');if(counts)el('p',counts,'mode-breakdown',dota)}else el('small','Refresh to calculate local points with the new all-modes scoring.','',dota);
        el('p',d.winRate===null?'No match results available':d.winRate+'% wins across '+d.matches.length+' recent recorded matches','',dota);el('small',d.notice,'',dota);if(d.fetchedAt)el('small','Data fetched '+new Date(d.fetchedAt).toLocaleString(),'freshness',dota);if(d.syncIssue&&d.fetchedAt)el('small','Showing saved data. '+d.syncIssue.message,'',dota);
        if(d.matches.length){const label=el('label','MATCH HISTORY FILTER','',dota);label.htmlFor='matchModeFilter';const select=el('select',undefined,'match-mode-select',dota);select.id='matchModeFilter';[['all','All modes'],['turbo','Turbo'],['normal','Normal'],['ranked','Ranked'],['other','Other modes']].forEach(([value,name])=>{const option=el('option',name,'',select);option.value=value});select.value=matchFilter;select.onchange=()=>{matchFilter=select.value;draw()};
          const category=m=>m.gameMode===23?'turbo':m.lobbyType===7?'ranked':m.lobbyType===0?'normal':'other';
          const visible=d.matches.filter(m=>matchFilter==='all'||category(m)===matchFilter);
          el('small','Showing '+visible.length+' of '+d.matches.length+' collected matches. Points above include every mode.','freshness',dota);
          const wrap=el('div',undefined,'table-wrap match-history',dota),table=el('table',undefined,'live-matches',wrap),thead=el('thead',undefined,'',table),hr=el('tr',undefined,'',thead);['RESULT','K / D / A','MODE','POINTS','PLAYED'].forEach(v=>el('th',v,'',hr));const body=el('tbody',undefined,'',table);visible.forEach(m=>{const row=el('tr',undefined,'',body);el('td',m.abandoned?'LEFT':m.won?'WIN':'LOSS',m.won&&!m.abandoned?'up':'down',row);el('td',m.kills+' / '+m.deaths+' / '+m.assists,'',row);el('td',m.mode||'Refresh for mode','',row);el('td',p?String(m.abandoned?0:m.won?3:1):'—','',row);const td=el('td',undefined,'',row),a=el('a',m.startedAt?new Date(m.startedAt*1000).toLocaleDateString():'View match','',td);a.href='https://www.opendota.com/matches/'+m.id;a.target='_blank';a.rel='noopener noreferrer'});
          if(!visible.length){const row=el('tr',undefined,'',body);const td=el('td','No matches of this type in the current window.','',row);td.colSpan=5}
        }
      }else {el('h3','Every match can count.','',dota);el('p','Collect the latest 50 available matches: Turbo, normal, ranked and other recorded modes.','',dota);el('small','3 local points for a win + 1 for a completed loss. No MMR or rank medal needed.','',dota)}
      const cs=el('article',undefined,'live-card',grid);el('div','COUNTER-STRIKE / STEAM','eyebrow',cs);el('h3','Counter-Strike 2 / CS:GO','',cs);
      if(account.cs){const c=account.cs;el('p',c.status==='ok'?'Available cumulative stats':c.status==='error'?'Stats unavailable':'Awaiting data connection','',cs);el('small',c.notice,'',cs);if(c.stats){const labels={total_kills:'Kills',total_deaths:'Deaths',total_matches_played:'Matches played',total_wins:'Wins',total_rounds_played:'Rounds',total_kills_headshot:'Headshot kills'};for(const [k,label]of Object.entries(labels))if(typeof c.stats[k]==='number')el('p',label+': '+c.stats[k].toLocaleString(),'',cs)}const checked=c.fetchedAt||c.syncIssue?.checkedAt;if(checked)el('small','Checked '+new Date(checked).toLocaleString(),'freshness',cs);if(c.syncIssue&&c.fetchedAt)el('small','Showing saved data. '+c.syncIssue.message,'',cs)}else el('p','Refresh to check Counter-Strike stats using the configured Steam connection.','',cs);
      el('p','Local points reflect recent results and participation, not competitive skill or opponent strength. Equal points per match across all modes. The local leaderboard below remains sample data.','steam-note');
    }
    if(message){const note=el('p',message,error?'steam-message error':'steam-message');note.setAttribute('role',error?'alert':'status')}
  }
  async function api(path,method='GET'){const r=await fetch(path,{method,credentials:'same-origin',headers:{Accept:'application/json'}});const type=r.headers.get('content-type')||'';if(!type.includes('application/json'))throw new Error('Sign in to Local Rival, then try connecting Steam again.');const data=await r.json();if(!r.ok)throw new Error(data.error||'The request could not be completed.');return data}
  async function sync(){if(busy)return;busy=true;message='Fetching available game data…';error=false;draw();try{const data=await api('/api/games/sync','POST');account=data.account;message=data.errors.length?data.errors.join(' '):'Refresh complete. Provider data may lag behind your latest match.';error=!!data.errors.length}catch(e){message=e.message;error=true}finally{busy=false;draw()}}
  async function disconnect(){if(busy)return;if(!window.confirm('Disconnect Steam and remove your stored game data from Local Rival?'))return;busy=true;draw();try{await api('/api/steam/account','DELETE');account=null;message='Steam disconnected. Stored game data has been removed.';error=false}catch(e){message=e.message;error=true}finally{busy=false;draw()}}
  draw();api('/api/steam/account').then(data=>{account=data.account;draw();if(status==='linked'&&account)sync()}).catch(e=>{message=e.message;error=true;draw()});
})();

