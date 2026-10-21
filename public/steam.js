(() => {
  const panel=document.createElement('section');panel.className='steam-panel';panel.setAttribute('aria-label','Connected Steam account');
  document.querySelector('.gamebar').before(panel);
  const top=document.getElementById('joinTop');top.textContent='◉ Connect Steam';top.onclick=()=>{panel.scrollIntoView({behavior:'smooth',block:'start'});panel.querySelector('a,button')?.focus()};
  const nav=document.createElement('button');nav.textContent='◉   Steam & live data';nav.onclick=top.onclick;document.querySelector('nav').append(nav);
  let account=null,busy=false,message='',error=false;
  const query=new URLSearchParams(location.search),status=query.get('steam');
  const statuses={linked:'Steam verified. Fetching your available game data…',expired:'This Steam connection expired. Please try again.',cancelled:'Steam connection cancelled. You can reconnect whenever you are ready.',already_linked:'This Steam account is already connected to another Local Rival user.',failed:'Steam could not verify this connection. Please try again.',failed_assertion:'The Steam response did not pass validation. Please reconnect.',failed_steam:'Steam confirmation failed. Please try again in a moment.',failed_storage:'Steam verification completed, but the account could not be saved. Please retry.'};
  if(status){message=statuses[status]||'';error=status!=='linked';history.replaceState(null,'',location.pathname)}
  function el(tag,text,className,parent=panel){const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(className)node.className=className;parent.append(node);return node}
  function button(text,action,parent=panel){const b=el('button',text,'outline',parent);b.onclick=action;b.disabled=busy;return b}
  function rankName(tier){if(!tier)return 'Not available';const names=['','Herald','Guardian','Crusader','Archon','Legend','Ancient','Divine','Immortal'];const division=Math.floor(tier/10),stars=tier%10;return names[division]?(names[division]+(division<8?' '+stars:'★')):'Not available'}
  function draw(){
    panel.replaceChildren();
    const head=el('div',undefined,'steam-head');const intro=el('div',undefined,'',head);el('div','PRIVATE PILOT · REAL ACCOUNTS','eyebrow',intro);el('h2',account?'Your Steam account is connected.':'Bring your game to your home ground.','',intro);
    el('p',account?'Steam ownership verified. Public stats are shown separately from the sample leaderboard.':'Connect an existing Steam account to fetch your available game data. Sign-in takes place on Steam.','',intro);
    if(!account){const a=el('a',undefined,'steam-signin',head);a.href='/api/steam/start';a.target='_top';const img=document.createElement('img');img.src='https://shared.fastly.steamstatic.com/community_assets/images/steamworks_docs/english/sits_large_border.png';img.alt='Sign in through Steam';img.width=180;img.height=35;a.append(img);el('p','This app remains private. No Steam password is stored by Local Rival.','steam-note');}
    else {
      const actions=el('div',undefined,'steam-actions',head);button(busy?'Refreshing…':'Refresh game data',sync,actions);button('Disconnect',disconnect,actions);
      const id=el('p','Steam ID '+account.steamId+' · Locally unranked','steam-note');
      const link=el('a','View on Steam ↗','',id);link.href='https://steamcommunity.com/profiles/'+account.steamId;link.target='_blank';link.rel='noopener noreferrer';
      const grid=el('div',undefined,'live-grid');
      const dota=el('article',undefined,'live-card',grid);el('div','DOTA 2 / OPENDOTA','eyebrow',dota);
      if(account.dota){const d=account.dota;el('h3',d.name||'Dota player','',dota);el('p','Public rank medal: '+rankName(d.rankTier),'',dota);el('p',d.winRate===null?'No match results available':d.winRate+'% wins across '+d.matches.length+' recent matches','',dota);el('small',d.notice,'',dota);el('small','Data fetched '+new Date(d.fetchedAt).toLocaleString(),'freshness',dota);
        if(d.matches.length){const wrap=el('div',undefined,'table-wrap',dota),table=el('table',undefined,'live-matches',wrap),thead=el('thead',undefined,'',table),hr=el('tr',undefined,'',thead);['RESULT','K / D / A','MODE','PLAYED'].forEach(v=>el('th',v,'',hr));const body=el('tbody',undefined,'',table);d.matches.slice(0,5).forEach(m=>{const row=el('tr',undefined,'',body);el('td',m.won?'WIN':'LOSS',m.won?'up':'down',row);el('td',m.kills+' / '+m.deaths+' / '+m.assists,'',row);el('td',m.ranked?'Ranked':'Other','',row);const td=el('td',undefined,'',row),a=el('a',m.startedAt?new Date(m.startedAt*1000).toLocaleDateString():'View match','',td);a.href='https://www.opendota.com/matches/'+m.id;a.target='_blank';a.rel='noopener noreferrer'})}
      }else el('p','Refresh to fetch recent completed matches and any public rank medal. Exact MMR is not inferred.','',dota);
      const cs=el('article',undefined,'live-card',grid);el('div','COUNTER-STRIKE / STEAM','eyebrow',cs);el('h3','Counter-Strike 2 / CS:GO','',cs);
      if(account.cs){const c=account.cs;el('p',c.status==='ok'?'Available cumulative stats':'Awaiting data connection','',cs);el('small',c.notice,'',cs);if(c.stats){const labels={total_kills:'Kills',total_deaths:'Deaths',total_matches_played:'Matches played',total_wins:'Wins',total_rounds_played:'Rounds',total_kills_headshot:'Headshot kills'};for(const [k,label]of Object.entries(labels))if(typeof c.stats[k]==='number')el('p',label+': '+c.stats[k].toLocaleString(),'',cs)}el('small','Checked '+new Date(c.fetchedAt).toLocaleString(),'freshness',cs)}else el('p','Steam linking is ready. Public Counter-Strike stats require the app owner to configure the Steam data connection.','',cs);
      el('p','Sandbox: real provider data, no effect on game rankings. Local ranking eligibility and postcode verification are not enabled yet.','steam-note');
    }
    if(message){const note=el('p',message,error?'steam-message error':'steam-message');note.setAttribute('role',error?'alert':'status')}
  }
  async function api(path,method='GET'){const r=await fetch(path,{method,credentials:'same-origin',headers:{Accept:'application/json'}});const type=r.headers.get('content-type')||'';if(!type.includes('application/json'))throw new Error('Sign in to Local Rival, then try connecting Steam again.');const data=await r.json();if(!r.ok)throw new Error(data.error||'The request could not be completed.');return data}
  async function sync(){if(busy)return;busy=true;message='Fetching available game data…';error=false;draw();try{const data=await api('/api/games/sync','POST');account=data.account;message=data.errors.length?data.errors.join(' '):'Refresh complete. Provider data may lag behind your latest match.';error=!!data.errors.length}catch(e){message=e.message;error=true}finally{busy=false;draw()}}
  async function disconnect(){if(busy)return;if(!window.confirm('Disconnect Steam and remove your stored game data from Local Rival?'))return;busy=true;draw();try{await api('/api/steam/account','DELETE');account=null;message='Steam disconnected. Stored game data has been removed.';error=false}catch(e){message=e.message;error=true}finally{busy=false;draw()}}
  draw();api('/api/steam/account').then(data=>{account=data.account;draw();if(status==='linked'&&account)sync()}).catch(e=>{message=e.message;error=true;draw()});
})();

