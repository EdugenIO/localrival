(() => {
  const card=document.getElementById('onboarding'),action=document.getElementById('onboardingAction'),title=document.getElementById('onboardingTitle'),copy=document.getElementById('onboardingCopy');
  let account={loading:true,connected:false,busy:false,name:null,error:null},ladder={loading:true,membership:null,gamerName:null,error:'',postcodes:{}},view='',saving=false,completed=false;
  const get=id=>document.getElementById(id);
  function focusCard(){card.hidden=false;card.scrollIntoView({behavior:'smooth',block:'center'});action.querySelector('input,a,button')?.focus({preventScroll:true})}
  function update(){
    const ready=!account.loading&&!ladder.loading;
    card.hidden=ready&&!!ladder.membership&&account.connected&&!completed;
    get('connectStep').classList.toggle('done',account.connected);get('locationStep').classList.toggle('done',!!ladder.membership);get('ladderStep').classList.toggle('done',!!ladder.membership);
    const next=completed?'complete':!ready?'loading':account.error?'error':!account.connected?'connect':ladder.error?'error':ladder.membership?'member':'location';
    if(next!==view){view=next;
      if(view==='loading'){title.textContent='Your local rivalry starts here.';copy.textContent='Connect Steam, choose your home ground and join your local ladder.';action.innerHTML='<p role="status">Checking your connection…</p>'}
      if(view==='error'){title.textContent='Let’s get you connected.';copy.textContent=account.error||ladder.error;action.innerHTML='<button class="onboarding-primary" id="retryOnboarding">Try again</button>';get('retryOnboarding').onclick=()=>location.reload()}
      if(view==='connect'){title.textContent='Ready to represent your postcode?';copy.textContent='Connect your Steam account to get started. Next, choose your postcode and suburb to find your home ground.';action.innerHTML='<a class="onboarding-primary" href="/api/steam/start">Connect Steam →</a><small class="onboarding-note">Takes a minute · Sign in securely on Steam · Local Rival never sees your password</small>'}
      if(view==='location'){
        title.textContent='Steam connected. Where’s your home ground?';copy.textContent='Choose your Australian postcode and suburb. We’ll place you on the right postcode, city and state ladders.';
        action.innerHTML='<form id="onboardingForm"><div class="onboarding-fields"><div><label for="homePostcode">HOME POSTCODE</label><input id="homePostcode" inputmode="numeric" pattern="[0-9]{4}" maxlength="4" autocomplete="postal-code" placeholder="e.g. 6000" aria-describedby="homePostcodeHelp" required></div><div><label for="homeLocality">SUBURB / TOWN</label><select id="homeLocality" required disabled aria-describedby="homePostcodeHelp"><option value="">Enter your postcode first</option></select></div></div><p id="homePostcodeHelp">Enter your 4-digit postcode to see its suburbs and towns.</p><p id="onboardingProfile" role="status"></p><button type="button" class="outline" id="onboardingRefresh">Refresh game data</button><label class="onboarding-consent"><input type="checkbox" id="homeConsent" required><span>Show my gamer name, state and match score on the public ladder. I understand postcode ladder participation reveals my general area.</span></label><label class="onboarding-consent"><input type="checkbox" id="homeShowSuburb"><span>Also show my suburb on my public profile (optional).</span></label><p class="onboarding-note">Your postcode and suburb place you in the right ladders. Public profiles show your state unless you share your suburb. Appearing in a postcode ladder still reveals that postcode. Your Steam gamer name may identify you; use a handle rather than your real name.</p><p id="onboardingError" role="alert"></p><button class="onboarding-primary" id="finishOnboarding" type="submit" disabled>Join my local ladder →</button><small class="onboarding-note">Your location is self-declared. You can edit it or leave the ladder later.</small></form>';
        get('homePostcode').oninput=lookup;get('homeLocality').onchange=validate;get('homeConsent').onchange=validate;get('onboardingRefresh').onclick=()=>window.dispatchEvent(new Event('localrival-refresh'));get('onboardingForm').onsubmit=save;
      }
      if(view==='complete'){title.textContent='You’re on your home ground.';copy.textContent='Your location is saved. Your verified match score appears on the ladder when matches are available.';action.innerHTML='<button class="onboarding-primary" id="viewMyLadder">View my local ladder →</button>';get('viewMyLadder').onclick=()=>{completed=false;update();document.querySelector('.gamebar').scrollIntoView({behavior:'smooth'})}}
    }
    if(view==='location')validate();
  }
  function lookup(){
    const postcode=get('homePostcode').value.trim(),matches=ladder.postcodes[postcode]||[],select=get('homeLocality');select.replaceChildren();
    const placeholder=document.createElement('option');placeholder.value='';placeholder.textContent=matches.length?'Choose your suburb / town':'Enter a recognised postcode';select.append(placeholder);
    for(const place of matches){const option=document.createElement('option');option.value=place[0];option.textContent=place[0]+' · '+place[1];select.append(option)}
    select.disabled=!matches.length||saving;get('homePostcodeHelp').textContent=matches.length?'Choose your suburb or town to find the right local ladder.':postcode.length===4?'We couldn’t find that Australian postcode. Check it and try again.':'Enter your 4-digit postcode to see its suburbs and towns.';validate();
  }
  function validate(){
    const name=ladder.gamerName,wait=Math.max(0,Math.ceil(((account.refreshAfter||0)-Date.now())/1000));
    get('onboardingProfile').textContent=name?'Joining as '+name:account.busy?'Fetching your verified gamer name from game data…':account.syncMessage||'We need your verified gamer name before joining. Refresh your game data to continue.';
    get('onboardingRefresh').hidden=!!name;get('onboardingRefresh').disabled=account.busy||saving||wait>0;get('onboardingRefresh').textContent=account.busy?'Fetching game data…':wait?'Refresh available in '+Math.floor(wait/60)+'m '+wait%60+'s':'Refresh game data';
    get('finishOnboarding').disabled=saving||!name||!get('homeLocality').value||!get('homeConsent').checked;get('finishOnboarding').textContent=saving?'Joining your ladder…':'Join my local ladder →';
  }
  async function save(event){
    event.preventDefault();if(saving||get('finishOnboarding').disabled)return;saving=true;get('onboardingError').textContent='';validate();
    const postcode=get('homePostcode').value.trim(),locality=get('homeLocality').value;get('homePostcode').disabled=true;get('homeLocality').disabled=true;get('homeConsent').disabled=true;get('homeShowSuburb').disabled=true;
    try{const response=await fetch('/api/leaderboard',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({postcode,locality,showSuburb:get('homeShowSuburb').checked})});const data=await response.json();if(!response.ok)throw Error(data.error||'Could not join your ladder. Please retry.');completed=true;window.dispatchEvent(new CustomEvent('localrival-home',{detail:{postcode,locality}}));update();}
    catch(error){get('onboardingError').textContent=error.message}
    finally{saving=false;if(view==='location'){get('homePostcode').disabled=false;get('homeLocality').disabled=!(ladder.postcodes[get('homePostcode').value.trim()]||[]).length;get('homeConsent').disabled=false;get('homeShowSuburb').disabled=false;validate()}}
  }
  window.addEventListener('localrival-account',event=>{account=event.detail;if(!account.connected)completed=false;update()});
  window.addEventListener('localrival-ladder',event=>{ladder=event.detail;update()});
  window.addEventListener('localrival-onboard',()=>{if(!account.loading&&!account.connected)location.href='/api/steam/start';else focusCard()});
  setInterval(()=>{if(view==='location'&&!ladder.gamerName)validate()},1000);
  update();
})();
