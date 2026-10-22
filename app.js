const $ = id => document.getElementById(id);
export function safeUrl(value) {
  if (typeof value !== 'string' || !value.trim()) return '';
  try { const u = new URL(value, globalThis.location?.href || 'https://example.com/'); return ['https:', 'http:'].includes(u.protocol) ? u.href : ''; } catch { return ''; }
}
export function flatten(entries) {
  return entries.flatMap(entry => (entry.sightings || []).map(sighting => ({entry, sighting})))
    .filter(({sighting}) => sighting.media?.some(m => safeUrl(m.url)));
}
export function filterSightings(items, filters) {
  const q = filters.search.toLowerCase().trim();
  return items.filter(({entry:e,sighting:s}) =>
    (!q || [e.title,e.episodeTitle,e.description,s.caption,...(s.instruments||[])].join(' ').toLowerCase().includes(q)) &&
    (!filters.instrument || s.instruments?.includes(filters.instrument)) &&
    (!filters.type || e.type === filters.type) &&
    (!filters.genre || e.genres?.includes(filters.genre)) &&
    (!filters.decade || (Number(e.year) && String(Math.floor(Number(e.year)/10)*10) === filters.decade)));
}
function node(tag, text, className) { const n=document.createElement(tag); if(text!==undefined)n.textContent=text;if(className)n.className=className;return n; }
function mediaType(e){return ({movie:'MOVIE',tv:'TV EPISODE',other:'OTHER'})[e.type]||'OTHER';}
function episode(e){return [e.season ? `Season ${e.season}`:'',e.episode ? `Episode ${e.episode}`:'',e.episodeTitle].filter(Boolean).join(' · ');}
async function start(){
  let catalog,items=[],visible=[],active=null,opener=null;
  try {const r=await fetch('data/catalog.json',{cache:'no-cache'});if(!r.ok)throw Error('Archive unavailable');catalog=await r.json();items=flatten(catalog.entries||[]);}catch{$('error').hidden=false;$('total').textContent='Archive temporarily unavailable';return;}
  const submissionUrl=safeUrl(catalog.submissionUrl);
  if(submissionUrl){document.querySelectorAll('[data-submit]').forEach(a=>{a.href=submissionUrl;a.target='_blank';a.rel='noopener noreferrer';a.hidden=false;});$('setup-note').hidden=true;}
  for(const [id,values] of [['genre',[...new Set(items.flatMap(x=>x.entry.genres||[]))].sort()],['decade',[...new Set(items.map(x=>Number(x.entry.year)).filter(Boolean).map(y=>Math.floor(y/10)*10))].sort((a,b)=>b-a)]]){
    for(const value of values){const option=node('option',id==='decade'?`${value}s`:value);option.value=value;$(id).append(option);}
  }
  $('total').textContent=`${items.length} sighting${items.length===1?'':'s'} · ${new Set(items.map(x=>x.entry.id)).size} movies, episodes & other discoveries`;
  function currentFilters(){return Object.fromEntries(['search','instrument','type','genre','decade'].map(k=>[k,$(k).value]));}
  function render(){
    const f=currentFilters();visible=filterSightings(items,f);$('gallery').replaceChildren();$('empty').hidden=items.length!==0;$('no-results').hidden=items.length===0||visible.length!==0;$('clear').hidden=!Object.values(f).some(Boolean);$('random').disabled=visible.length===0;
    $('result-count').textContent=items.length?`${visible.length} of ${items.length} sightings`:'';
    for(const item of visible){
      const {entry:e,sighting:s}=item;const button=node('button',undefined,'card');button.type='button';
      const frame=node('div',undefined,'card-image');const cover=s.media.find(m=>m.kind==='image'&&safeUrl(m.url))||s.media.find(m=>safeUrl(m.poster));
      if(cover){const img=node('img');img.src=safeUrl(cover.poster||cover.url);img.alt=cover.alt||s.caption||`Low brass spotted in ${e.title}`;img.loading='lazy';frame.append(img);}else{frame.append(node('p','▶ Play clip'));}
      frame.append(node('span',`NO. ${String(items.indexOf(item)+1).padStart(3,'0')}`,'card-number'));
      if(s.media.length>1||s.media.some(m=>m.kind==='video'))frame.append(node('span',s.media.some(m=>m.kind==='video')?'▶ CLIP':`${s.media.length} IMAGES`,'card-badge'));
      button.append(frame,node('h3',e.title),node('div',[e.year,mediaType(e),episode(e)].filter(Boolean).join(' / '),'meta'));
      if(s.caption)button.append(node('p',s.caption));button.addEventListener('click',()=>open(item,button));$('gallery').append(button);
    }
  }
  function open(item,source){
    active=item;if(source)opener=source;const {entry:e,sighting:s}=item;$('detail-number').textContent=String(items.indexOf(item)+1).padStart(3,'0');$('detail-title').textContent=e.title;$('detail-meta').textContent=[e.year,mediaType(e),s.timestamp].filter(Boolean).join(' / ');$('detail-episode').textContent=episode(e);$('detail-caption').textContent=[e.description,s.caption].filter(Boolean).join('\n\n');$('detail-credit').textContent=s.credit?`Spotted by ${s.credit}`:'';
    $('detail-tags').replaceChildren(...[...(s.instruments||[]),...(e.genres||[])].map(t=>node('span',t)));
    $('detail-source').replaceChildren();if(s.sourceNote)$('detail-source').append(node('span',s.sourceNote+' '));if(safeUrl(s.sourceUrl)){const a=node('a','Source ↗');a.href=safeUrl(s.sourceUrl);a.target='_blank';a.rel='noopener noreferrer';$('detail-source').append(a);}
    $('detail-media').replaceChildren();
    for(const m of s.media){const url=safeUrl(m.url);if(!url)continue;const fig=node('figure');let el;
      if(m.kind==='video'){el=node('video');el.controls=true;el.preload='metadata';el.playsInline=true;if(safeUrl(m.poster))el.poster=safeUrl(m.poster);el.setAttribute('aria-label',m.alt||`Sighting in ${e.title}`);}else{el=node('img');el.alt=m.alt||s.caption||`Sighting in ${e.title}`;}
      el.src=url;fig.append(el);if(m.caption)fig.append(node('figcaption',m.caption));$('detail-media').append(fig);
    }
    const related=items.filter(x=>x.entry.id===e.id&&x.sighting.id!==s.id);$('related').replaceChildren();if(related.length){$('related').append(node('h3','More sightings from this title'));for(const x of related){const b=node('button',x.sighting.caption||x.sighting.timestamp||'Another sighting','text-button');b.addEventListener('click',()=>open(x));$('related').append(b);}}
    if(!$('detail').open)$('detail').showModal();$('detail').scrollTop=0;history.replaceState(null,'',`#sighting=${encodeURIComponent(s.id)}`);
  }
  function move(step){const pool=visible.includes(active)?visible:items;if(!pool.length)return;open(pool[(pool.indexOf(active)+step+pool.length)%pool.length]);}
  $('previous').addEventListener('click',()=>move(-1));$('next').addEventListener('click',()=>move(1));$('close').addEventListener('click',()=>$('detail').close());$('detail').addEventListener('close',()=>{$('detail').querySelectorAll('video').forEach(v=>v.pause());history.replaceState(null,'',location.pathname+location.search);opener?.focus();});
  $('random').addEventListener('click',()=>{if(visible.length)open(visible[Math.floor(Math.random()*visible.length)],$('random'));});
  $('filters').addEventListener('submit',e=>e.preventDefault());$('filters').addEventListener('input',render);$('clear').addEventListener('click',()=>{$('filters').reset();render();});
  render();const hash=new URLSearchParams(location.hash.slice(1)).get('sighting');if(hash){const item=items.find(x=>x.sighting.id===hash);if(item)open(item);}
}
if(typeof document!=='undefined')start();
