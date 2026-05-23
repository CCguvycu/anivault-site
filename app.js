// ═══════════════════════════════════════════
//  AniVault — Core Engine
// ═══════════════════════════════════════════

const DB_URL  = 'https://ccguvycu.github.io/animedb-site/api/anime-ids.json';
const ANILIST = 'https://graphql.anilist.co';

// ── GraphQL client ──────────────────────────────────────────
async function gql(query, vars = {}, retry = 0) {
  const r = await fetch(ANILIST, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables: vars }),
  });
  if (r.status === 429 && retry < 4) {
    await sleep(1500 * (retry + 1));
    return gql(query, vars, retry + 1);
  }
  const j = await r.json();
  if (j.errors) throw new Error(j.errors[0].message);
  return j.data;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── Shared media fields ─────────────────────────────────────
const MF = `id title{romaji english native} coverImage{extraLarge large color}
  bannerImage episodes status averageScore popularity genres season seasonYear
  format description(asHtml:false)`;

// ── Query library ───────────────────────────────────────────
const Q = {
  trending:    `{Page(page:1,perPage:20){media(type:ANIME,sort:TRENDING_DESC,status:RELEASING){${MF}}}}`,
  popular:     `{Page(page:1,perPage:20){media(type:ANIME,sort:POPULARITY_DESC){${MF}}}}`,
  topRated:    `{Page(page:1,perPage:20){media(type:ANIME,sort:SCORE_DESC,averageScore_greater:75){${MF}}}}`,
  seasonal:    `query($s:MediaSeason,$y:Int){Page(page:1,perPage:20){media(type:ANIME,season:$s,seasonYear:$y,sort:POPULARITY_DESC,status_not:NOT_YET_RELEASED){${MF}}}}`,
  byIds:       `query($ids:[Int],$page:Int){Page(page:$page,perPage:50){pageInfo{hasNextPage currentPage}media(type:ANIME,id_in:$ids,sort:POPULARITY_DESC){${MF}}}}`,
  search:      `query($s:String,$p:Int,$genres:[String],$year:Int,$fmt:MediaFormat,$status:MediaStatus){
    Page(page:$p,perPage:24){
      pageInfo{hasNextPage currentPage total}
      media(type:ANIME,search:$s,genre_in:$genres,seasonYear:$year,format:$fmt,status:$status,sort:SEARCH_MATCH){${MF}}
    }
  }`,
  browse:      `query($p:Int,$genres:[String],$year:Int,$fmt:MediaFormat,$status:MediaStatus,$sort:[MediaSort]){
    Page(page:$p,perPage:24){
      pageInfo{hasNextPage currentPage total}
      media(type:ANIME,genre_in:$genres,seasonYear:$year,format:$fmt,status:$status,sort:$sort){${MF}}
    }
  }`,
  detail:      `query($id:Int){Media(id:$id,type:ANIME){
    ${MF}
    trailer{id site thumbnail}
    studios(isMain:true){nodes{name}}
    nextAiringEpisode{episode airingAt}
    characters(perPage:12,sort:ROLE){nodes{id name{full}image{large}}}
    relations{edges{relationType node{id title{romaji}coverImage{large}type format}}}
    recommendations(perPage:8){nodes{mediaRecommendation{id title{romaji}coverImage{large}}}}
  }}`,
};

// ── Season helper ───────────────────────────────────────────
function currentSeason() {
  const m = new Date().getMonth() + 1;
  if (m <= 3) return 'WINTER';
  if (m <= 6) return 'SPRING';
  if (m <= 9) return 'SUMMER';
  return 'FALL';
}

// ── Embed sources ───────────────────────────────────────────
const SOURCES = [
  { name: 'AutoEmbed', color: '#a855f7', url: (id, ep) => `https://autoembed.cc/anime/anilist/${id}-${ep}` },
  { name: 'VidBinge',  color: '#3b82f6', url: (id, ep) => `https://vidbinge.dev/embed/anime/${id}/${ep}` },
  { name: 'VidLink',   color: '#10b981', url: (id, ep) => `https://vidlink.pro/anime/${id}/${ep}` },
  { name: 'VidSrc',    color: '#f59e0b', url: (id, ep) => `https://vidsrc.dev/embed/anime?anilist=${id}&episode=${ep}` },
  { name: 'AniWatch',  color: '#ec4899', url: (id, ep) => `https://aniwatch.to/watch/${id}-${ep}` },
];

// ── LocalStorage store ──────────────────────────────────────
const S = {
  _g: k  => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
  _s: (k,v) => localStorage.setItem(k, JSON.stringify(v)),

  history()       { return this._g('av_hist') || []; },
  pushHistory(a, ep) {
    let h = this.history().filter(x => x.id !== a.id);
    h.unshift({ id: a.id, ep, title: a.title.english || a.title.romaji, img: a.coverImage?.large, ts: Date.now() });
    this._s('av_hist', h.slice(0, 50));
  },

  watchlist()     { return this._g('av_wl') || []; },
  inWl(id)        { return this.watchlist().some(x => x.id === id); },
  toggleWl(a) {
    const wl = this.watchlist().filter(x => x.id !== a.id);
    if (!this.inWl(a.id)) wl.unshift({ id: a.id, title: a.title.english || a.title.romaji, img: a.coverImage?.large, ts: Date.now() });
    this._s('av_wl', wl);
    return !this.inWl(a.id);
  },
  addToWl(a) {
    if (this.inWl(a.id)) return;
    const wl = this.watchlist();
    wl.unshift({ id: a.id, title: a.title.english || a.title.romaji, img: a.coverImage?.large, ts: Date.now() });
    this._s('av_wl', wl);
  },
  removeFromWl(id) { this._s('av_wl', this.watchlist().filter(x => x.id !== id)); },

  progress(id)    { return this._g(`av_p${id}`) || { eps: [], last: null }; },
  saveProgress(id, ep) {
    const p = this.progress(id);
    p.last = ep;
    if (!p.eps.includes(ep)) p.eps.push(ep);
    this._s(`av_p${id}`, p);
  },
  watched(id, ep) { return this.progress(id).eps.includes(ep); },

  src()           { return this._g('av_src') || 0; },
  setSrc(i)       { this._s('av_src', i); },
};

// ── URL params ──────────────────────────────────────────────
const P = {
  get: n => new URLSearchParams(location.search).get(n),
  go(page, params) {
    const u = new URL(page, location.origin);
    Object.entries(params).forEach(([k, v]) => u.searchParams.set(k, v));
    location.href = u.toString();
  },
};

// ── DOM helpers ─────────────────────────────────────────────
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
function el(tag, attrs = {}, ...children) {
  const e = document.createElement(tag);
  Object.entries(attrs).forEach(([k, v]) => {
    if (k === 'class') e.className = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v);
  });
  children.forEach(c => e.append(typeof c === 'string' ? c : c));
  return e;
}

// ── Card builder ────────────────────────────────────────────
function buildCard(a, opts = {}) {
  const title = a.title.english || a.title.romaji;
  const score = a.averageScore ? (a.averageScore / 10).toFixed(1) : '—';
  const ep    = a.episodes ? `${a.episodes} ep` : (a.status === 'RELEASING' ? 'Ongoing' : '—');
  const prog  = S.progress(a.id);
  const lastEp = prog.last;

  const card = el('div', { class: 'card', onclick: () => P.go('anime.html', { id: a.id }) });
  card.innerHTML = `
    <div class="card-img-wrap">
      <img class="card-img" src="${a.coverImage.large}" alt="${title}" loading="lazy">
      ${lastEp ? `<div class="card-prog">EP ${lastEp}</div>` : ''}
      <div class="card-overlay">
        <button class="card-play" onclick="event.stopPropagation();P.go('watch.html',{id:${a.id},ep:${lastEp || 1}})">▶ Play</button>
        <button class="card-wl ${S.inWl(a.id) ? 'active' : ''}" onclick="event.stopPropagation();toggleWlBtn(this,${JSON.stringify(a).replace(/"/g,"'")})" title="Watchlist">♥</button>
      </div>
    </div>
    <div class="card-info">
      <div class="card-title" title="${title}">${title}</div>
      <div class="card-meta">
        <span class="badge score">★ ${score}</span>
        <span class="badge ep">${ep}</span>
        ${a.format ? `<span class="badge fmt">${a.format.replace('_',' ')}</span>` : ''}
      </div>
    </div>`;
  return card;
}

function toggleWlBtn(btn, a) {
  S.inWl(a.id) ? S.removeFromWl(a.id) : S.addToWl(a);
  btn.classList.toggle('active', S.inWl(a.id));
}

// ── Row builder ─────────────────────────────────────────────
function buildRow(title, items, container) {
  if (!items?.length) return;
  const wrap = el('section', { class: 'row-section' });
  wrap.innerHTML = `<h2 class="row-title">${title}</h2>`;
  const row = el('div', { class: 'card-row' });
  items.forEach(a => row.append(buildCard(a)));
  wrap.append(row);
  container.append(wrap);
}

// ── Skeleton loader ─────────────────────────────────────────
function skeletons(n, container) {
  for (let i = 0; i < n; i++) {
    container.append(el('div', { class: 'card skeleton' }));
  }
}
function clearSkeletons(container) {
  $$('.skeleton', container).forEach(s => s.remove());
}

// ── Navbar active link ──────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  const path = location.pathname.split('/').pop() || 'index.html';
  $$('nav a').forEach(a => a.classList.toggle('active', a.getAttribute('href') === path));
});
