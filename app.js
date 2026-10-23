const $ = id => document.getElementById(id);
// Separate previews keep the publisher's catalog and the uploaded originals intact.
const thumbnailPreviews = {
  'media/s-39d456441c79e742cf33/01.jpg': 'preview-freaks-and-geeks.png',
  'media/s-aaaa897041063813edab/01.jpg': 'preview-cameraperson.png',
  'media/s-fcc440b0e7200aa9000b/01.jpg': 'preview-a-hidden-life.png'
};
export function safeUrl(value) {
  if (typeof value !== 'string' || !value.trim()) return '';
  try { const u = new URL(value, globalThis.location?.href || 'https://example.com/'); return ['https:', 'http:'].includes(u.protocol) ? u.href : ''; } catch { return ''; }
}
export function flatten(entries) {
  return entries.flatMap(entry => (entry.sightings || []).map(sighting => ({entry, sighting})))
    .filter(({sighting}) => sighting.media?.some(m => safeUrl(m.url)));
}
export function brassTag(sighting) { return ['tuba','non-tuba-brass'].includes(sighting.tag) ? sighting.tag : ''; }
export function filterSightings(items, filters) {
  const q = filters.search.toLowerCase().trim();
  return items.filter(({entry:e,sighting:s}) =>
    (!filters.tag || brassTag(s) === filters.tag) && (!q || [e.title,e.episodeTitle,e.description,s.caption,s.credit,s.sourceNote,...(s.instruments||[])].join(' ').toLowerCase().includes(q)));
}
function node(tag, text, className) { const n=document.createElement(tag); if(text!==undefined)n.textContent=text;if(className)n.className=className;return n; }
function tagLabel(s){return brassTag(s)==='non-tuba-brass'?'non-tuba-brass':brassTag(s);}
function filmLabel(url){try{return /(^|\.)imdb\.com$/.test(new URL(url).hostname)?'IMDb ↗':'Film info ↗';}catch{return 'Film info ↗';}}
function episode(e){return [e.season ? `Season ${e.season}`:'',e.episode ? `Episode ${e.episode}`:'',e.episodeTitle].filter(Boolean).join(' · ');}
async function start(){
  let catalog,items=[],visible=[],active=null,opener=null;
  try {const r=await fetch('data/catalog.json',{cache:'no-cache'});if(!r.ok)throw Error('Archive unavailable');catalog=await r.json();items=flatten(catalog.entries||[]);}catch{$('error').hidden=false;$('total').textContent='Archive temporarily unavailable';return;}
  const submissionUrl=safeUrl(catalog.submissionUrl);
  if(submissionUrl){document.querySelectorAll('[data-submit]').forEach(a=>{a.href=submissionUrl;a.target='_blank';a.rel='noopener noreferrer';a.hidden=false;});$('setup-note').hidden=true;}
  $('total').textContent=`${items.length} sighting${items.length===1?'':'s'}`;
  function currentFilters(){return {search:$('search').value,tag:document.querySelector('input[name=tag]:checked').value};}
  function render(){
    const f=currentFilters();visible=filterSightings(items,f);$('gallery').replaceChildren();$('empty').hidden=items.length!==0;$('no-results').hidden=items.length===0||visible.length!==0;$('clear').hidden=!Object.values(f).some(Boolean);
    $('result-count').textContent=items.length?`${visible.length} of ${items.length} sightings`:'';
    for(const item of visible){
      const {entry:e,sighting:s}=item;const button=node('button',undefined,'card');button.type='button';
      const frame=node('div',undefined,'card-image');const cover=s.media.find(m=>m.kind==='image'&&safeUrl(m.url))||s.media.find(m=>safeUrl(m.poster));
      if(cover){const img=node('img');img.src=safeUrl(cover.poster||cover.url);img.alt=cover.alt||s.caption||`Low brass spotted in ${e.title}`;img.loading='lazy';frame.append(img);
        const previewUrl=thumbnailPreviews[cover.poster||cover.url];
        if(previewUrl){const preview=node('img',undefined,'card-preview');preview.alt='';preview.setAttribute('aria-hidden','true');preview.loading='lazy';preview.addEventListener('error',()=>preview.remove(),{once:true});preview.src=previewUrl;frame.append(preview);}
      }else{frame.append(node('p','▶ Play clip'));}
      frame.append(node('span',`NO. ${String(items.indexOf(item)+1).padStart(3,'0')}`,'card-number'));
      if(s.media.length>1||s.media.some(m=>m.kind==='video'))frame.append(node('span',s.media.some(m=>m.kind==='video')?'▶ CLIP':`${s.media.length} IMAGES`,'card-badge'));
      button.append(frame,node('h3',e.title));button.addEventListener('click',()=>open(item,button));
      const article=node('article',undefined,'card-item'),meta=node('div',undefined,'card-meta');article.append(button);
      if(tagLabel(s))meta.append(node('span',tagLabel(s),'tag'));
      const filmUrl=safeUrl(e.filmUrl);if(filmUrl){const link=node('a',filmLabel(filmUrl),'film-link');link.href=filmUrl;link.target='_blank';link.rel='noopener noreferrer';link.setAttribute('aria-label',`${e.title} on ${filmLabel(filmUrl).replace(' ↗','')}`);meta.append(link);}
      article.append(meta);$('gallery').append(article);
    }
  }
  function open(item,source){
    active=item;if(source)opener=source;const {entry:e,sighting:s}=item;
    $('detail-title').textContent=e.title;
    $('detail-tag').textContent=tagLabel(s);$('detail-tag').hidden=!tagLabel(s);
    $('detail-caption').textContent=[e.description,s.caption].filter(Boolean).join('\n\n');$('detail-caption').hidden=!$('detail-caption').textContent;
    $('detail-episode').textContent=[episode(e),s.timestamp].filter(Boolean).join(' · ');$('detail-episode').hidden=!$('detail-episode').textContent;
    $('detail-credit').textContent=s.credit?`Spotted by ${s.credit}`:'';$('detail-credit').hidden=!s.credit;
    const filmUrl=safeUrl(e.filmUrl);$('detail-film').hidden=!filmUrl;$('detail-film').removeAttribute('href');if(filmUrl){$('detail-film').href=filmUrl;$('detail-film').textContent=filmLabel(filmUrl);}
    const sourceUrl=safeUrl(s.sourceUrl);$('detail-source-link').hidden=!sourceUrl;$('detail-source-link').removeAttribute('href');if(sourceUrl)$('detail-source-link').href=sourceUrl;
    $('detail-source').textContent=s.sourceNote||'';$('detail-source').hidden=!s.sourceNote;
    $('detail-random').disabled=items.length<2;
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
  $('detail-random').addEventListener('click',()=>{const pool=items.filter(item=>item!==active);if(pool.length)open(pool[Math.floor(Math.random()*pool.length)]);});
  $('filters').addEventListener('submit',e=>e.preventDefault());$('filters').addEventListener('input',render);$('clear').addEventListener('click',()=>{$('filters').reset();render();});
  render();const hash=new URLSearchParams(location.hash.slice(1)).get('sighting');if(hash){const item=items.find(x=>x.sighting.id===hash);if(item)open(item);}
}
if(typeof document!=='undefined')start();


