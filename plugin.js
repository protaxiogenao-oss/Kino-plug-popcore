/// <reference path="./kino.d.ts" />

const BASE = "https://porcore.com";
const MAX_SEARCH = 100;
const MAX_ROW = 60;
const MAX_BROWSE = 100;

function abs(url) {
  if (!url) return "";
  if (url.startsWith("http")) return url;
  if (url.startsWith("//")) return "https:" + url;
  if (url.startsWith("/")) return BASE + url;
  return BASE + "/" + url;
}

function parseDuration(text) {
  if (!text) return undefined;
  const m = String(text).trim().match(/(\d+):(\d+)/);
  if (!m) return undefined;
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
}

function parseViews(text) {
  if (!text) return undefined;
  const n = String(text).replace(/[,\.]/g, "").match(/(\d+)/);
  return n ? parseInt(n[1], 10) : undefined;
}

function itemFromThumb(html) {
  const hrefM = html.match(/href="(\/video\/(\d+)\/[^"]+)"/);
  if (!hrefM) return null;
  const id = hrefM[2];
  const path = hrefM[1];
  // Prefer the title from the <a title="..."> (video name), not Duration/History/etc.
  const titleM =
    html.match(/class="clip-link[^"]*"[^>]*title="([^"]+)"/) ||
    html.match(/<h5[^>]*title="([^"]+)"/) ||
    html.match(/title="([^"]+)"/);
  const title = titleM
    ? titleM[1].replace(/&amp;/g, "&").replace(/&#039;/g, "'").replace(/&quot;/g, '"').trim()
    : "Video " + id;

  // Miniatura original del sitio: 500×300 (16:9 horizontal). Evita el recorte vertical.
  const poster = BASE + "/media/thumbs/" + id + "/i101.jpg";
  const backdrop = poster;

  const durM = html.match(/title="Duration"[^>]*>[\s\S]*?(\d+:\d+)/);
  const runtimeMinutes = durM ? Math.max(1, Math.round(parseDuration(durM[1]) / 60)) : undefined;
  const likeM = html.match(/(\d+)%/);
  const rating = likeM ? Math.min(10, Math.round(parseInt(likeM[1], 10) / 10)) : undefined;

  return {
    id: "pc-" + id,
    ref: path,
    title,
    kind: "movie",
    poster,
    backdrop,
    runtimeMinutes,
    rating,
    adult: true,
    genres: ["anime"],
  };
}

function parseItems(html, limit) {
  const items = [];
  const re = /<div class="onevideothumb">([\s\S]*?)<\/div>\s*(?=<div class="onevideothumb"|<\/div>\s*<nav id="page_nav"|$)/g;
  let m;
  while ((m = re.exec(html)) !== null && items.length < limit) {
    const it = itemFromThumb(m[1]);
    if (it) items.push(it);
  }
  // fallback simpler split
  if (items.length === 0) {
    const parts = html.split('class="onevideothumb"');
    for (let i = 1; i < parts.length && items.length < limit; i++) {
      const it = itemFromThumb(parts[i]);
      if (it) items.push(it);
    }
  }
  return items;
}

function nextFromHtml(html, currentPath) {
  const m = html.match(/id="page_nav"[^>]*>[\s\S]*?href="([^"]+)"/);
  if (!m) return undefined;
  let href = m[1];
  if (href.includes("&ajax") || href.includes("?ajax") || href.includes("p=")) {
    // normalize to a cursor we can reuse
    const pM = href.match(/[?&]p=(\d+)/);
    if (pM) return pM[1];
  }
  return undefined;
}

async function fetchPage(path) {
  const url = path.startsWith("http") ? path : BASE + (path.startsWith("/") ? path : "/" + path);
  const r = await kino.fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Linux; Android 12) AppleWebKit/537.36 Chrome/120.0.0.0 Mobile Safari/537.36",
      Accept: "text/html,application/xhtml+xml",
      "Accept-Language": "en-US,en;q=0.9",
    },
    timeoutMs: 15000,
  });
  if (!r.ok) {
    if (r.status === 404) throw kino.error("not_found", "Página no encontrada");
    throw kino.error("unavailable", "No se pudo cargar porcore.com (" + r.status + ")");
  }
  return await r.text();
}

export async function search(query) {
  const q = (query && query.q) ? String(query.q).trim() : "";
  if (!q) return { items: [] };

  const page = query.cursor ? parseInt(query.cursor, 10) || 1 : 1;
  const encoded = encodeURIComponent(q).replace(/%20/g, "+");
  let path = "/show/" + encoded + "?ajax";
  if (page > 1) path += "&p=" + page;

  const html = await fetchPage(path);
  const items = parseItems(html, MAX_SEARCH);
  const nextPage = nextFromHtml(html, path);
  const next = nextPage && items.length >= 10 ? String(parseInt(nextPage, 10) || page + 1) : undefined;

  return next ? { items, next } : { items };
}

// Cada fila apunta a la URL real del sitio. Los vídeos con varios tags
// aparecen en más de una categoría (comportamiento normal de porcore).
const HOME_ROWS = [
  { id: "newest", title: "Más recientes", path: "/&ajax&p=1", genre: "anime" },
  { id: "top", title: "Mejor valorados", path: "/videos/top-rated/&ajax&p=1", genre: "anime" },
  { id: "viewed", title: "Más vistos", path: "/videos/most-viewed/&ajax&p=1", genre: "anime" },
  { id: "hentai", title: "Hentai", path: "/show/hentai?ajax&sort=toprated", genre: "anime" },
  { id: "3d", title: "3D", path: "/show/3d?ajax&sort=toprated", genre: "anime" },
  { id: "parodies", title: "Parodias", path: "/show/parodies?ajax&sort=toprated", genre: "anime" },
  { id: "aliens", title: "Aliens", path: "/show/aliens?ajax&sort=toprated", genre: "anime" },
  { id: "monsters", title: "Monstruos", path: "/show/monsters?ajax&sort=toprated", genre: "anime" },
  { id: "furry", title: "Furry", path: "/show/furry?ajax&sort=toprated", genre: "anime" },
  { id: "lesbians", title: "Lesbianas", path: "/show/lesbians?ajax&sort=toprated", genre: "anime" },
  { id: "shemales", title: "Shemales", path: "/show/shemales?ajax&sort=toprated", genre: "anime" },
  { id: "tentacles", title: "Tentáculos", path: "/show/tentacles?ajax&sort=toprated", genre: "anime" },
];

export async function home() {
  const rows = [];
  for (const row of HOME_ROWS) {
    try {
      const html = await fetchPage(row.path);
      const items = parseItems(html, MAX_ROW);
      if (items.length > 0) {
        rows.push({
          id: row.id,
          title: row.title,
          items,
          ref: row.id,
          genre: row.genre,
        });
      }
    } catch (e) {
      kino.log.warn("home row " + row.id + ": " + (e.message || e));
    }
  }
  return rows;
}

export async function browse(ref, cursor) {
  const row = HOME_ROWS.find((r) => r.id === ref);
  if (!row) throw kino.error("not_found", "Sección desconocida");

  const page = cursor ? parseInt(cursor, 10) || 1 : 1;
  let path = row.path;
  // Mantener sort= y demás params; solo ajustar el número de página
  if (/[?&]p=\d+/.test(path)) {
    path = path.replace(/([?&]p=)\d+/, "$1" + page);
  } else {
    path = path + (path.includes("?") ? "&" : "?") + "p=" + page;
  }

  const html = await fetchPage(path);
  const items = parseItems(html, MAX_BROWSE);
  const nextPage = nextFromHtml(html, path);
  const next = nextPage && items.length >= 10 ? String(parseInt(nextPage, 10) || page + 1) : undefined;

  return next ? { items, next } : { items };
}

export async function resolve(ref) {
  // ref is like /video/3086/slug/ or just the path
  let path = String(ref || "");
  if (!path.startsWith("/")) path = "/" + path;
  if (!path.includes("/video/")) throw kino.error("not_found", "Referencia inválida");

  const html = await fetchPage(path);

  // Prefer HLS master (best quality adaptive)
  let m3u8 = null;
  const m3u8M = html.match(/source\s+src="(https?:\/\/[^"]+\.m3u8[^"]*)"/i) ||
                html.match(/(https?:\/\/[^"'\s]+\.m3u8[^"'\s]*)/i);
  if (m3u8M) m3u8 = m3u8M[1];

  // Also collect progressive mp4 if present (sometimes better for older devices)
  const mp4s = [];
  const mp4Re = /https?:\/\/[^"'\s]+\.mp4(?!\.urlset)[^"'\s]*/gi;
  let mm;
  while ((mm = mp4Re.exec(html)) !== null) {
    const u = mm[0];
    if (u.includes(".m3u8") || u.includes(".urlset")) continue;
    if (!mp4s.includes(u)) mp4s.push(u);
  }

  if (!m3u8 && mp4s.length === 0) {
    // try script sources
    const srcM = html.match(/file\s*:\s*["'](https?:\/\/[^"']+)["']/i) ||
                 html.match(/src\s*:\s*["'](https?:\/\/[^"']+\.m3u8[^"']*)["']/i);
    if (srcM) m3u8 = srcM[1];
  }

  if (!m3u8 && mp4s.length === 0) {
    throw kino.error("unavailable", "No se encontró el vídeo en esta página");
  }

  const titleM = html.match(/<h1[^>]*>([^<]+)<\/h1>/i) || html.match(/og:title" content="([^"]+)"/i);
  const title = titleM ? titleM[1].trim() : undefined;

  // Prefer HLS (adaptive, works well on phone and TV)
  if (m3u8) {
    const stream = {
      url: m3u8,
      mime: "application/x-mpegURL",
      label: "HLS (mejor calidad)",
    };
    // add mp4 alternatives if any (lower priority)
    if (mp4s.length > 0) {
      stream.alternatives = mp4s.slice(0, 3).map((u, i) => ({
        url: u,
        mime: "video/mp4",
        label: "MP4 " + (i + 1),
      }));
    }
    return stream;
  }

  // fallback to first mp4
  return {
    url: mp4s[0],
    mime: "video/mp4",
    label: "MP4",
  };
}
