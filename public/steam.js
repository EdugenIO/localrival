(() => {
  const panel=document.createElement('details');panel.className='steam-panel';panel.setAttribute('aria-label','Connected Steam account');
  document.querySelector('.gamebar').before(panel);
  const summary=document.createElement('summary');summary.className='stats-summary';panel.append(summary);
  const body=document.createElement('div');body.className='stats-content';panel.append(body);
  const top=document.getElementById('joinTop');top.textContent='◉ Connect Steam';top.onclick=()=>{panel.open=true;panel.scrollIntoView({behavior:'smooth',block:'start'});panel.querySelector('a,button')?.focus()};
  document.getElementById('profileNav').onclick=top.onclick;
  const nav=document.createElement('button');nav.textContent='◉   Steam & live data';nav.onclick=top.onclick;document.querySelector('nav').append(nav);
  let account=null,busy=false,message='',error=false,matchFilter='all',refreshControl=null,browserControl=null,browserRetryAt=0,heroNames={};
  const query=new URLSearchParams(location.search),status=query.get('steam');
  const statuses={linked:'Steam verified. Fetching your available game data…',expired:'This Steam connection expired. Please try again.',cancelled:'Steam connection cancelled. You can reconnect whenever you are ready.',already_linked:'This Steam account is already connected to another Local Rival user.',failed:'Steam could not verify this connection. Please try again.',failed_assertion:'The Steam response did not pass validation. Please reconnect.',failed_steam:'Steam confirmation failed. Please try again in a moment.',failed_storage:'Steam verification completed, but the account could not be saved. Please retry.'};
  if(status){panel.open=true;message=statuses[status]||'';error=status!=='linked';history.replaceState(null,'',location.pathname)}
  function el(tag,text,className,parent=body){const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(className)node.className=className;parent.append(node);return node}
  function button(text,action,parent=body){const b=el('button',text,'outline',parent);b.onclick=action;b.disabled=busy;return b}
  function updateRefreshControl(){if(refreshControl){const seconds=Math.max(0,Math.ceil(((account?.refreshAfter||0)-Date.now())/1000));refreshControl.disabled=busy||seconds>0;refreshControl.textContent=busy?'Refreshing…':seconds?'Refresh in '+Math.floor(seconds/60)+'m '+seconds%60+'s':'Refresh game data'}if(browserControl){const seconds=Math.max(0,Math.ceil((Math.max(browserRetryAt,account?.dota?.browserRefreshAfter||0)-Date.now())/1000));browserControl.disabled=busy||seconds>0;browserControl.textContent=busy?'Syncing…':seconds?'Profile sync in '+seconds+'s':'Sync OpenDota profile'}}
  const heroName=id=>heroNames[id]||'Hero '+(id||'unknown');
  const duration=seconds=>typeof seconds==='number'?Math.floor(Math.round(seconds)/60)+':'+String(Math.round(seconds)%60).padStart(2,'0'):'—';
  function draw(){
    body.replaceChildren();
    summary.replaceChildren();
    const identity=el('span',undefined,'stats-identity',summary);el('span','MY PLAYER STATS','eyebrow',identity);el('strong',account?.dota?.name||(account?'Steam connected':'Connect your Steam account'),'',identity);
    const preview=el('span',undefined,'stats-preview',summary);const performance=account?.dota?.performance;if(performance?.eligibleMatches)el('span',performance.points+' points · '+performance.eligibleMatches+' recent matches','',preview);el('span','Stats & account','stats-prompt',preview);el('span','⌄','stats-chevron',summary);
    top.textContent=account?'◉ My stats ⌄':'◉ Connect Steam';
    const head=el('div',undefined,'steam-head');const intro=el('div',undefined,'',head);el('div','PRIVATE PILOT · REAL ACCOUNTS','eyebrow',intro);el('h2',account?'Your Steam account is connected.':'Bring your game to your home ground.','',intro);
    el('p',account?'Steam account verified. Join your local ladder to share your match score.':'Sign in with your Steam account to collect matches across Turbo, normal and other available modes.','',intro);
    if(!account){const a=el('a',undefined,'steam-signin',head);a.href='/api/steam/start';a.target='_top';const img=document.createElement('img');img.src='https://shared.fastly.steamstatic.com/community_assets/images/steamworks_docs/english/sits_large_border.png';img.alt='Sign in through Steam';img.width=180;img.height=35;a.append(img);el('p','Sign in with Steam to save your account. This device stays signed in for up to 30 days. Local Rival never sees your Steam password.','steam-note');}
    else {
      const actions=el('div',undefined,'steam-actions',head);refreshControl=button(busy?'Refreshing…':'Refresh game data',sync,actions);button('Sign out',signOut,actions);button('Disconnect & delete data',disconnect,actions);
      const id=el('p','Steam ID '+account.steamId+' · Match performance pilot','steam-note');
      const link=el('a','View on Steam ↗','',id);link.href='https://steamcommunity.com/profiles/'+account.steamId;link.target='_blank';link.rel='noopener noreferrer';
      const grid=el('div',undefined,'live-grid');
      const dota=el('article',undefined,'live-card',grid);el('div','DOTA 2 / OPENDOTA','eyebrow',dota);
      browserControl=button('Sync OpenDota profile',syncBrowser,dota);el('small','Sync now, or leave it to the nightly refresh at 2:00 am Perth time.','freshness',dota);
      const profileLink=el('a','Open your OpenDota profile ↗','profile-link',dota);profileLink.href='https://www.opendota.com/players/'+(BigInt(account.steamId)-76561197960265728n).toString();profileLink.target='_blank';profileLink.rel='noopener noreferrer';
      if(account.dota){const d=account.dota,p=d.performance;el('h3',d.name||'Dota player','',dota);
        if(d.lifetime){const l=d.lifetime;el('p','All recorded modes: '+l.matches+' matches · '+l.wins+' wins · '+l.losses+' losses'+(l.winRate!==null?' · '+l.winRate+'% wins':''),'recorded-total',dota)}
        el('div',p&&p.eligibleMatches?p.points+' local points':'No match score yet','performance-score',dota);
        if(p){el('p',p.basePoints+' result points + '+p.performancePoints+' KDA bonus points','',dota);el('p',p.wins+' wins · '+p.losses+' completed losses · '+p.eligibleMatches+' scored matches','',dota);el('small',p.rule,'',dota);if(p.provisional&&p.eligibleMatches)el('small','Early sample — fewer than 10 matches.','',dota);if(p.excludedMatches)el('small',p.excludedMatches+' matches left: recorded, worth 0 points.','',dota);const counts=Object.entries(p.modeCounts).map(([mode,count])=>mode+': '+count).join(' · ');if(counts)el('p',counts,'mode-breakdown',dota)}else el('small','Refresh to calculate local points with the new all-modes scoring.','',dota);
        el('p',d.winRate===null?'No match results available':d.winRate+'% wins across '+d.matches.length+' recent recorded matches','',dota);el('small',d.notice,'',dota);if(d.fetchedAt)el('small','Data fetched '+new Date(d.fetchedAt).toLocaleString(),'freshness',dota);if(d.syncIssue&&d.fetchedAt)el('small','Showing saved data. '+d.syncIssue.message,'',dota);
        if(d.syncMethod==='browser')el('small','Public OpenDota snapshot synced through your browser. This browser import is unverified; sync details are private to your account.','freshness',dota);
        if(d.averages&&d.matches.length){el('h4','Averages · latest '+d.matches.length+' matches','',dota);const metrics=el('div',undefined,'dota-metrics',dota);const avg=key=>d.averages[key]?.value;for(const [title,value]of [['K / D / A',['kills','deaths','assists'].map(k=>avg(k)?.toFixed(1)??'—').join(' / ')],['Duration',duration(avg('duration'))],['Gold / min',avg('goldPerMinute')?.toFixed(0)],['XP / min',avg('xpPerMinute')?.toFixed(0)],['Last hits',avg('lastHits')?.toFixed(0)],['Hero damage',avg('heroDamage')?.toFixed(0)],['Healing',avg('healing')?.toFixed(0)],['Tower damage',avg('towerDamage')?.toFixed(0)]]){if(value===undefined)continue;const metric=el('div',undefined,'',metrics);el('small',title,'',metric);el('b',value,'',metric)}el('small','Extra replay stats are averaged only where the provider supplies them.','freshness',dota)}
        if(d.heroes?.length){el('h4','Most played heroes · latest '+d.matches.length,'',dota);const heroes=el('div',undefined,'hero-summary',dota);for(const h of d.heroes.slice(0,5))el('p',heroName(h.id)+' · '+h.matches+' matches · '+Math.round(h.wins/h.matches*100)+'% wins','',heroes)}
        if(d.matches.length){const label=el('label','MATCH HISTORY FILTER','',dota);label.htmlFor='matchModeFilter';const select=el('select',undefined,'match-mode-select',dota);select.id='matchModeFilter';[['all','All modes'],['turbo','Turbo'],['normal','Normal'],['ranked','Ranked'],['other','Other modes']].forEach(([value,name])=>{const option=el('option',name,'',select);option.value=value});select.value=matchFilter;select.onchange=()=>{matchFilter=select.value;draw()};
          const category=m=>m.gameMode===23?'turbo':m.lobbyType===7?'ranked':m.lobbyType===0?'normal':'other';
          const visible=d.matches.filter(m=>matchFilter==='all'||category(m)===matchFilter);
          el('small','Showing '+visible.length+' of '+d.matches.length+' collected matches. Points above include every mode.','freshness',dota);
          const wrap=el('div',undefined,'table-wrap match-history',dota),table=el('table',undefined,'live-matches',wrap),thead=el('thead',undefined,'',table),hr=el('tr',undefined,'',thead);['HERO','RESULT','K / D / A','MODE','TIME','POINTS','PLAYED'].forEach(v=>el('th',v,'',hr));const body=el('tbody',undefined,'',table);visible.forEach(m=>{const row=el('tr',undefined,'',body);el('td',heroName(m.heroId),'',row);el('td',m.abandoned?'LEFT':m.won?'WIN':'LOSS',m.won&&!m.abandoned?'up':'down',row);el('td',m.kills+' / '+m.deaths+' / '+m.assists,'',row);el('td',m.mode||'Refresh for mode','',row);el('td',duration(m.duration),'',row);el('td',m.scoring?m.scoring.total+' ('+m.scoring.base+' + '+m.scoring.bonus+' KDA)':'—','',row);const td=el('td',undefined,'',row),a=el('a',m.startedAt?new Date(m.startedAt*1000).toLocaleDateString():'View match','',td);a.href='https://www.opendota.com/matches/'+m.id;a.target='_blank';a.rel='noopener noreferrer'});
          if(!visible.length){const row=el('tr',undefined,'',body);const td=el('td','No matches of this type in the current window.','',row);td.colSpan=7}
        }
      }else {el('h3','Every match can count.','',dota);el('p','Collect the latest 50 available matches: Turbo, normal, ranked and other recorded modes.','',dota);el('small','3 base points for a win or 1 for a completed loss, plus up to 3 KDA bonus points. No MMR or rank medal needed.','',dota)}
      el('p','Local points combine results and KDA performance; they do not adjust for role or opponent strength. Equal points per match across all modes. The community ladder uses opted-in players with self-declared postcodes.','steam-note');
    }
    if(message){const note=el('p',message,error?'steam-message error':'steam-message');note.setAttribute('role',error?'alert':'status')}
    updateRefreshControl();
  }
  async function api(path,method='GET'){const r=await fetch(path,{method,credentials:'same-origin',headers:{Accept:'application/json'}});const type=r.headers.get('content-type')||'';if(!type.includes('application/json'))throw new Error('Sign in to Local Rival, then try connecting Steam again.');const data=await r.json();if(!r.ok){if(data.account)account=data.account;throw new Error(data.error||'The request could not be completed.')}return data}
  async function sync(){if(busy)return;busy=true;message='Fetching available game data…';error=false;draw();try{const data=await api('/api/games/sync','POST');account=data.account;message=data.errors.length?data.errors.join(' '):'Refresh complete. Provider data may lag behind your latest match.';error=!!data.errors.length}catch(e){message=e.message;error=true}finally{busy=false;draw();window.dispatchEvent(new Event("localrival-sync"))}}
  async function syncBrowser(){
    if(busy||!account)return;busy=true;message='Loading your public OpenDota profile…';error=false;draw();
    try{
      const id=(BigInt(account.steamId)-76561197960265728n).toString();
      async function read(path){const r=await fetch('https://api.opendota.com/api/players/'+id+path,{credentials:'omit',redirect:'error',headers:{Accept:'application/json'},signal:AbortSignal.timeout(20000)});if(r.status===429){browserRetryAt=Date.now()+600000;throw new Error('OpenDota is also limiting this browser. Please wait for the profile-sync countdown.')}if(!r.ok)throw new Error('OpenDota could not load this profile (HTTP '+r.status+').');return r.json()}
      const {dotaMatchesPath}=await import('/opendota-request.mjs');
      const [profile,matches,totals]=await Promise.all([read('').catch(()=>null),read(dotaMatchesPath()),read('/wl?significant=0').catch(()=>null)]);
      const r=await fetch('/api/dota/browser-sync',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({steamId:account.steamId,accountId:id,profile,matches,totals})});const data=await r.json();if(!r.ok){if(data.account)account=data.account;throw new Error(data.error||'Could not save your profile.')}account=data.account;message='OpenDota profile synced: '+account.dota.matches.length+' matches available. Turbo and normal matches are included.';
    }catch(e){message=e.message;error=true}finally{busy=false;draw();window.dispatchEvent(new Event("localrival-sync"))}
  }
  async function signOut(){if(busy)return;await api('/api/session/logout','POST');if(window.localRivalPages){localStorage.removeItem('localrival-pages-session');location.href='./';}else location.href='/signout-with-chatgpt?return_to=%2Fleaderboard';}
  async function disconnect(){if(busy)return;if(!window.confirm('Disconnect Steam and remove your stored game data from Local Rival?'))return;busy=true;draw();try{await api('/api/steam/account','DELETE');account=null;message='Steam disconnected. Stored game data has been removed.';error=false}catch(e){message=e.message;error=true}finally{busy=false;draw();window.dispatchEvent(new Event("localrival-sync"))}}
  setInterval(updateRefreshControl,1000);
  draw();Promise.all([api('/api/steam/account'),fetch('/dota-hero-names.json').then(r=>r.json()).catch(()=>({}))]).then(([data,names])=>{account=data.account;heroNames=names;draw();if(status==='linked'&&account)sync()}).catch(e=>{message=e.message;error=true;draw()});
})();


