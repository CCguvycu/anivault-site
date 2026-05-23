// AniVault v2 — Core Engine

const DB_URL  = 'https://ccguvycu.github.io/animedb-site/api/anime-ids.json';
const ANILIST = 'https://graphql.anilist.co';

async function gql(query, vars = {}, retry = 0) {
  const r = await fetch(ANILIST, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables: vars }),
  });
  if (r.status === 429 && retry < 4) { await sleep(1400 * (retry + 1)); return gql(query, vars, retry + 1); }
  const j = await r.json();
  if (j.errors) throw new Error(j.errors[0].message);
  return j.data;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

const MF = `id title{romaji english native} coverImage{extraLarge large color}
  bannerImage episodes status averageScore popularity genres season seasonYear
  format description(asHtml:false)`;

const Q = {
  trending:  `{Page(page:1,perPage:20){media(type:ANIME,sort:TRENDING_DESC,status:RELEASING){${MF}}}}`,
  popular:   `{Page(page:1,perPage:20){media(type:ANIME,sort:POPULARITY_DESC){${MF}}}}`,
  topRated:  `{Page(page:1,perPage:20){media(type:ANIME,sort:SCORE_DESC,averageScore_greater:75){${MF}}}}`,
  newEps:    `{Page(page:1,perPage:20){media(type:ANIME,sort:UPDATED_AT_DESC,status:RELEASING){${MF}}}}`,
  seasonal:  `query($s:MediaSeason,$y:Int){Page(page:1,perPage:20){media(type:ANIME,season:$s,seasonYear:$y,sort:POPULARITY_DESC,status_not:NOT_YET_RELEASED){${MF}}}}`,
  byIds:     `query($ids:[Int],$page:Int){Page(page:$page,perPage:50){pageInfo{hasNextPage}media(type:ANIME,id_in:$ids,sort:POPULARITY_DESC){${MF}}}}`,
  search:    `query($s:String,$p:Int,$genres:[String],$year:Int,$fmt:MediaFormat,$status:MediaStatus,$sort:[MediaSort]){Page(page:$p,perPage:28){pageInfo{hasNextPage currentPage total}media(type:ANIME,search:$s,genre_in:$genres,seasonYear:$year,format:$fmt,status:$status,sort:$sort){${MF}}}}`,
  browse:    `query($p:Int,$genres:[String],$year:Int,$fmt:MediaFormat,$status:MediaStatus,$sort:[MediaSort]){Page(page:$p,perPage:28){pageInfo{hasNextPage currentPage total}media(type:ANIME,genre_in:$genres,seasonYear:$year,format:$fmt,status:$status,sort:$sort){${MF}}}}`,
  detail:    `query($id:Int){Media(id:$id,type:ANIME){${MF} trailer{id site} studios(isMain:true){nodes{name}} nextAiringEpisode{episode airingAt} characters(perPage:14,sort:ROLE){nodes{id name{full}image{large}}} relations{edges{relationType node{id title{romaji}coverImage{large}type format}}} recommendations(perPage:10){nodes{mediaRecommendation{id title{romaji}coverImage{large}}}}}}`,
  suggest:   `query($s:String){Page(page:1,perPage:6){media(type:ANIME,search:$s,sort:SEARCH_MATCH){id title{romaji english}coverImage{medium}}}}`,
};

function currentSeason() {
  const m = new Date().getMonth() + 1;
  if (m<=3) return 'WINTER'; if (m<=6) return 'SPRING';
  if (m<=9) return 'SUMMER'; return 'FALL';
}

const SOURCES = [
  { name: 'AutoEmbed', color: '#8b5cf6', url: (id, ep) => `https://autoembed.cc/anime/anilist/${id}-${ep}` },
  { name: 'VidBinge',  color: '#3b82f6', url: (id, ep) => `https://vidbinge.dev/embed/anime/${id}/${ep}` },
  { name: 'VidLink',   color: '#06b6d4', url: (id, ep) => `https://vidlink.pro/anime/${id}/${ep}` },
  { name: 'VidSrc',    color: '#f59e0b', url: (id, ep) => `https://vidsrc.dev/embed/anime?anilist=${id}&episode=${ep}` },
  { name: 'AniWatch',  color: '#ec4899', url: (id, ep) => `https://aniwatch.to/watch/${id}-${ep}` },
];

const S = {
  _g: k  => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
  _s: (k,v) => localStorage.setItem(k, JSON.stringify(v)),
  history()    { return this._g('av_hist') || []; },
  pushHistory(a, ep) {
    let h = this.history().filter(x => x.id !== a.id);
    h.unshift({ id: a.id, ep, title: a.title.english || a.title.romaji, img: a.coverImage?.large, color: a.coverImage?.color, ts: Date.now() });
    this._s('av_hist', h.slice(0, 60));
  },
  watchlist()  { return this._g('av_wl') || []; },
  inWl(id)     { return this.watchlist().some(x => x.id === id); },
  addToWl(a)   { if (this.inWl(a.id)) return; const wl = this.watchlist(); wl.unshift({ id: a.id, title: a.title.english||a.title.romaji, img: a.coverImage?.large, ts: Date.now() }); this._s('av_wl', wl); },
  removeFromWl(id) { this._s('av_wl', this.watchlist().filter(x => x.id !== id)); },
  toggleWl(a)  { this.inWl(a.id) ? this.removeFromWl(a.id) : this.addToWl(a); return this.inWl(a.id); },
  progress(id) { return this._g(`av_p${id}`) || { eps: [], last: null }; },
  saveProgress(id, ep) { const p = this.progress(id); p.last = ep; if (!p.eps.includes(ep)) p.eps.push(ep); this._s(`av_p${id}`, p); },
  watched(id, ep) { return this.progress(id).eps.includes(ep); },
  src()        { return this._g('av_src') || 0; },
  setSrc(i)    { this._s('av_src', i); },
};

const P = {
  get: n => new URLSearchParams(location.search).get(n),
  go(page, params) {
    const u = new URL(page, location.origin);
    Object.entries(params).forEach(([k,v]) => u.searchParams.set(k, v));
    location.href = u.toString();
  },
};

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];

function toast(msg, type = 'info') {
  let tray = document.getElementById('toastTray');
  if (!tray) { tray = document.createElement('div'); tray.id = 'toastTray'; document.body.append(tray); }
  const t = document.createElement('div');
  t.className = `toast toast-${type}`;
  const icons = { info: '◈', success: '✓', error: '✗', warn: '⚠' };
  t.innerHTML = `<span class="toast-icon">${icons[type]||'◈'}</span><span>${msg}</span>`;
  tray.append(t);
  requestAnimationFrame(() => t.classList.add('show'));
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 2800);
}

function skeletons(n, container) {
  for (let i = 0; i < n; i++) container.append(Object.assign(document.createElement('div'), { className: 'card skeleton' }));
}

function buildCard(a) {
  const title = a.title.english || a.title.romaji;
  const score = a.averageScore ? (a.averageScore / 10).toFixed(1) : null;
  const prog  = S.progress(a.id);
  const pct   = (a.episodes && prog.last) ? Math.round((prog.last / a.episodes) * 100) : 0;
  const color = a.coverImage.color || '#7c3aed';
  const safeA = JSON.stringify({ id: a.id, title, img: a.coverImage?.large, coverImage: a.coverImage, title_obj: a.title }).replace(/"/g, '&quot;');

  const card = document.createElement('div');
  card.className = 'card';
  card.style.setProperty('--accent', color);
  card.innerHTML = `
    <div class="card-media">
      <img class="card-img" src="${a.coverImage.large}" alt="${title.replace(/"/g,'')}" loading="lazy">
      ${score ? `<div class="card-score">★ ${score}</div>` : ''}
      ${a.status === 'RELEASING' ? '<div class="card-airing">AIRING</div>' : ''}
      ${prog.last ? `<div class="card-resume-badge">EP ${prog.last}</div>` : ''}
      <div class="card-hover">
        <div class="card-hover-inner">
          <button class="card-play-btn" onclick="event.stopPropagation();P.go('watch.html',{id:${a.id},ep:${prog.last||1}})">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="white"><path d="M8 5v14l11-7z"/></svg>
            ${prog.last ? `Resume EP ${prog.last}` : 'Watch Now'}
          </button>
          <button class="card-wl-btn ${S.inWl(a.id)?'in-wl':''}" onclick="event.stopPropagation();cardWlToggle(this,'${a.id}','${title.replace(/'/g,'')}')" data-a="${safeA}">
            ${S.inWl(a.id) ? '♥ Saved' : '+ Watchlist'}
          </button>
          <div class="card-hover-meta">
            <span>${a.format ? a.format.replace('_',' ') : ''}</span>
            <span>${a.episodes ? a.episodes + ' ep' : a.status === 'RELEASING' ? 'Ongoing' : ''}</span>
            ${a.seasonYear ? `<span>${a.seasonYear}</span>` : ''}
          </div>
        </div>
      </div>
      <div class="card-bottom-grad">
        <div class="card-title-text">${title}</div>
        ${pct > 0 ? `<div class="card-prog-bar"><div class="card-prog-fill" style="width:${pct}%"></div></div>` : ''}
      </div>
    </div>
    <div class="card-tags">${(a.genres||[]).slice(0,2).map(g=>`<span>${g}</span>`).join('')}</div>`;
  card.addEventListener('click', () => P.go('anime.html', { id: a.id }));
  return card;
}

function cardWlToggle(btn, id, title) {
  const a = JSON.parse(btn.dataset.a.replace(/&quot;/g, '"'));
  const animeObj = { id: parseInt(id), title: a.title_obj || { romaji: title, english: title }, coverImage: a.coverImage };
  const now = S.toggleWl(animeObj);
  btn.textContent = now ? '♥ Saved' : '+ Watchlist';
  btn.classList.toggle('in-wl', now);
  toast(now ? 'Added to watchlist' : 'Removed from watchlist', now ? 'success' : 'info');
}

function buildRow(title, items, container, href) {
  if (!items?.length) return;
  const id = 'r' + Math.random().toString(36).slice(2);
  const sec = document.createElement('section');
  sec.className = 'row-section';
  sec.innerHTML = `
    <div class="row-head">
      <h2 class="row-title">${title}</h2>
      <div class="row-nav">
        <button class="row-arrow" onclick="scrollRow('${id}',-1)">‹</button>
        <button class="row-arrow" onclick="scrollRow('${id}',1)">›</button>
        ${href ? `<a href="${href}" class="see-all">See all</a>` : ''}
      </div>
    </div>
    <div class="scroll-row" id="${id}"></div>`;
  const row = sec.querySelector(`#${id}`);
  items.forEach(a => row.append(buildCard(a)));
  container.append(sec);
}

function scrollRow(id, dir) {
  const el = document.getElementById(id);
  if (el) el.scrollBy({ left: dir * Math.round(el.clientWidth * 0.75), behavior: 'smooth' });
}

document.addEventListener('DOMContentLoaded', () => {
  const path = location.pathname.split('/').pop() || 'index.html';
  $$('.nav-link').forEach(a => a.classList.toggle('active', a.getAttribute('href') === path));

  const inp  = document.getElementById('globalSearch');
  const drop = document.getElementById('searchDrop');
  if (!inp) return;
  let t;
  inp.addEventListener('input', () => {
    clearTimeout(t);
    const v = inp.value.trim();
    if (!v || !drop) { drop && drop.classList.remove('open'); return; }
    t = setTimeout(async () => {
      try {
        const d = await gql(Q.suggest, { s: v });
        drop.innerHTML = '';
        d.Page.media.forEach(m => {
          const el = document.createElement('div');
          el.className = 'suggest-item';
          el.innerHTML = `<img src="${m.coverImage.medium}" alt=""><span>${m.title.english||m.title.romaji}</span>`;
          el.onclick = () => P.go('anime.html', { id: m.id });
          drop.append(el);
        });
        drop.classList.toggle('open', d.Page.media.length > 0);
      } catch(e) {}
    }, 320);
  });
  inp.addEventListener('keydown', e => {
    if (e.key === 'Enter' && inp.value.trim()) P.go('browse.html', { q: inp.value.trim() });
    if (e.key === 'Escape' && drop) drop.classList.remove('open');
  });
  document.addEventListener('click', e => { if (drop && !e.target.closest('.nav-search-wrap')) drop.classList.remove('open'); });
});
