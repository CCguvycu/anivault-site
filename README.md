# ⬡ AniVault

Stream **3,266+ anime** free — no ads, no signup.

**Live site:** https://ccguvycu.github.io/anivault-site/

## Features
- 3,266 anime database (sourced from AnimeDb / Jikan)
- 5 embed sources: AutoEmbed, VidBinge, VidLink, VidSrc, AniWatch
- Search + filter by genre, year, format, status
- Watchlist + history + episode progress (localStorage)
- Responsive dark UI
- Zero backend — pure GitHub Pages

## Pages
| Page | Description |
|------|-------------|
| `index.html` | Home — hero carousel, trending, seasonal, top rated |
| `browse.html` | Full 3,266-anime catalog with filters |
| `watch.html` | Embedded player with episode sidebar |
| `anime.html` | Detail page — episodes, characters, relations |
| `watchlist.html` | Your watchlist + history |

## Data sources
- **Anime IDs:** `https://ccguvycu.github.io/animedb-site/api/anime-ids.json` (auto-updated daily)
- **Metadata:** AniList GraphQL API (no key required)
- **Streaming:** Embed providers (AutoEmbed recommended)
