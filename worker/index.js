// worker/index.js — the small server behind vrlss.in: blog posts and testimonials.
// Everything that isn't /api/* is the normal website (served from ./dist).
//
// Secrets (set once, never put them in code or GitHub):
//   npx wrangler secret put ADMIN_PASSWORD   -> the password for vrlss.in/admin
//   npx wrangler secret put SESSION_SECRET   -> any long random text (signs the admin login cookie)

import { posts as staticPosts } from '../src/site/blog/posts.js'

const STATIC_SLUGS = new Set(staticPosts.map((p) => p.slug))
const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
const json = (data, status = 200, extra = {}) => new Response(JSON.stringify(data), { status, headers: { ...JSON_HEADERS, ...extra } })
const bad = (msg, status = 400) => json({ error: msg }, status)
const now = () => new Date().toISOString()
const enc = new TextEncoder()

const str = (v, max) => String(v ?? '').replace(/\u0000/g, '').trim().slice(0, max)
const safeUrl = (u) => {
  const s = str(u, 500)
  if (!s) return ''
  try {
    const x = new URL(s)
    return x.protocol === 'https:' ? x.href : ''
  } catch {
    return ''
  }
}
const slugify = (t) =>
  str(t, 120)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || `post-${Date.now()}`

async function sha256(text) {
  const d = await crypto.subtle.digest('SHA-256', enc.encode(text))
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('')
}
const ipHash = (req, env) => sha256(`${req.headers.get('cf-connecting-ip') || 'x'}|${env.SESSION_SECRET || ''}`)

async function hmac(secret, text) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(text))
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('')
}
function sameText(a, b) {
  // constant-time comparison
  const x = enc.encode(a)
  const y = enc.encode(b)
  let diff = x.length ^ y.length
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] || 0) ^ (y[i] || 0)
  return diff === 0
}

// ---------- admin session (signed cookie, 7 days) ----------
const COOKIE = 'vrlss_admin'
async function makeSession(env) {
  const exp = Date.now() + 7 * 24 * 3600 * 1000
  return `${exp}.${await hmac(env.SESSION_SECRET, `admin.${exp}`)}`
}
async function isAdmin(req, env) {
  if (!env.SESSION_SECRET || !env.ADMIN_PASSWORD) return false
  const m = (req.headers.get('cookie') || '').match(new RegExp(`${COOKIE}=([0-9]+)\\.([0-9a-f]{64})`))
  if (!m || Number(m[1]) < Date.now()) return false
  return sameText(m[2], await hmac(env.SESSION_SECRET, `admin.${m[1]}`))
}
// Changes from the browser must come from vrlss.in itself (blocks other sites posting on your behalf).
function sameOrigin(req) {
  const origin = req.headers.get('origin')
  return !origin || origin === new URL(req.url).origin
}
const cookie = (value, maxAge) => `${COOKIE}=${value}; Path=/api; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`

// ---------- handlers ----------
// A post is public when it is published AND its publish time has come (posts can be scheduled ahead).
const LIVE = "published = 1 AND publish_at <= ?1"

async function listPosts(env, all) {
  const { results } = all
    ? await env.DB.prepare('SELECT id, slug, title, description, cover, published, publish_at, created_at, updated_at FROM posts ORDER BY publish_at DESC LIMIT 500').all()
    : await env.DB.prepare(`SELECT slug, title, description, cover, publish_at FROM posts WHERE ${LIVE} ORDER BY publish_at DESC LIMIT 500`).bind(now()).all()
  return json({ posts: results })
}

const livePost = (env, slug) => env.DB.prepare(`SELECT * FROM posts WHERE slug = ?2 AND ${LIVE}`).bind(now(), slug).first()

async function getPost(env, slug) {
  const row = await livePost(env, slug)
  return row ? json({ post: row }) : bad('Not found', 404)
}

function readPost(b) {
  const title = str(b.title, 140)
  if (title.length < 3) return [null, 'Please add a title.']
  const body = str(b.body, 50000)
  if (body.length < 20) return [null, 'The post is too short.']
  const t = Date.parse(b.publish_at || '')
  const publish_at = Number.isFinite(t) ? new Date(t).toISOString() : now()
  return [{ title, slug: slugify(b.slug || title), description: str(b.description, 300), body, cover: safeUrl(b.cover), published: b.published === false ? 0 : 1, publish_at }]
}

async function savePost(req, env, id) {
  const [p, err] = readPost(await req.json().catch(() => ({})))
  if (err) return bad(err)
  try {
    if (id) {
      await env.DB.prepare('UPDATE posts SET slug=?1, title=?2, description=?3, body=?4, cover=?5, published=?6, updated_at=?7, publish_at=?8 WHERE id=?9')
        .bind(p.slug, p.title, p.description, p.body, p.cover, p.published, now(), p.publish_at, id).run()
    } else {
      await env.DB.prepare('INSERT INTO posts (slug, title, description, body, cover, published, created_at, updated_at, publish_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?7,?8)')
        .bind(p.slug, p.title, p.description, p.body, p.cover, p.published, now(), p.publish_at).run()
    }
  } catch (e) {
    if (String(e).includes('UNIQUE')) return bad('Another post already uses this link (slug). Change the title or slug.')
    throw e
  }
  return json({ ok: true, slug: p.slug })
}

async function listTestimonials(env, all) {
  const q = all
    ? 'SELECT id, name, role, company, rating, text, published, created_at FROM testimonials ORDER BY created_at DESC LIMIT 500'
    : 'SELECT id, name, role, company, rating, text, created_at FROM testimonials WHERE published = 1 ORDER BY created_at DESC LIMIT 200'
  const { results } = await env.DB.prepare(q).all()
  return json({ testimonials: results })
}

async function addTestimonial(req, env) {
  const b = await req.json().catch(() => ({}))
  if (b.website) return json({ ok: true }) // honeypot: bots fill hidden fields
  const name = str(b.name, 60)
  const text = str(b.text, 1000)
  const rating = Math.min(5, Math.max(1, Math.round(Number(b.rating) || 5)))
  if (name.length < 2) return bad('Please enter your name.')
  if (text.length < 10) return bad('Please write a few words about your experience.')
  if ((text.match(/https?:\/\//g) || []).length > 1) return bad('Please remove the links from your testimonial.')
  const ip = await ipHash(req, env)
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString()
  const { n } = await env.DB.prepare('SELECT COUNT(*) AS n FROM testimonials WHERE ip_hash = ?1 AND created_at > ?2').bind(ip, since).first()
  if (n >= 3) return bad('Thank you! You have already shared a testimonial today.', 429)
  await env.DB.prepare('INSERT INTO testimonials (name, role, company, rating, text, published, ip_hash, created_at) VALUES (?1,?2,?3,?4,?5,1,?6,?7)')
    .bind(name, str(b.role, 60), str(b.company, 80), rating, text, ip, now()).run()
  return json({ ok: true })
}

async function login(req, env) {
  if (!env.ADMIN_PASSWORD || !env.SESSION_SECRET) return bad('Admin is not set up yet (secrets missing).', 503)
  const ip = await ipHash(req, env)
  const since = new Date(Date.now() - 15 * 60 * 1000).toISOString()
  const { n } = await env.DB.prepare('SELECT COUNT(*) AS n FROM login_attempts WHERE ip_hash = ?1 AND at > ?2').bind(ip, since).first()
  if (n >= 5) return bad('Too many attempts. Try again in 15 minutes.', 429)
  const { password } = await req.json().catch(() => ({}))
  if (!sameText(str(password, 200), env.ADMIN_PASSWORD)) {
    await env.DB.prepare('INSERT INTO login_attempts (ip_hash, at) VALUES (?1, ?2)').bind(ip, now()).run()
    return bad('Wrong password.', 401)
  }
  await env.DB.prepare('DELETE FROM login_attempts WHERE ip_hash = ?1 OR at < ?2').bind(ip, since).run()
  return json({ ok: true }, 200, { 'set-cookie': cookie(await makeSession(env), 7 * 24 * 3600) })
}

async function api(req, env) {
  const url = new URL(req.url)
  const p = url.pathname.replace(/\/+$/, '')
  const m = req.method
  if (m !== 'GET' && m !== 'HEAD' && !sameOrigin(req)) return bad('Not allowed', 403)

  // public
  if (p === '/api/posts' && m === 'GET') return listPosts(env, false)
  if (p.startsWith('/api/posts/') && m === 'GET') return getPost(env, decodeURIComponent(p.slice(11)))
  if (p === '/api/testimonials' && m === 'GET') return listTestimonials(env, false)
  if (p === '/api/testimonials' && m === 'POST') return addTestimonial(req, env)
  if (p === '/api/admin/login' && m === 'POST') return login(req, env)
  if (p === '/api/admin/logout' && m === 'POST') return json({ ok: true }, 200, { 'set-cookie': cookie('', 0) })

  // admin only
  if (!p.startsWith('/api/admin/')) return bad('Not found', 404)
  if (!(await isAdmin(req, env))) return bad('Please log in.', 401)
  if (p === '/api/admin/me') return json({ ok: true })
  if (p === '/api/admin/posts' && m === 'GET') return listPosts(env, true)
  if (p === '/api/admin/posts' && m === 'POST') return savePost(req, env, 0)
  const pm = p.match(/^\/api\/admin\/posts\/(\d+)$/)
  if (pm && m === 'GET') {
    const row = await env.DB.prepare('SELECT * FROM posts WHERE id = ?1').bind(pm[1]).first()
    return row ? json({ post: row }) : bad('Not found', 404)
  }
  if (pm && m === 'PUT') return savePost(req, env, Number(pm[1]))
  if (pm && m === 'DELETE') {
    await env.DB.prepare('DELETE FROM posts WHERE id = ?1').bind(pm[1]).run()
    return json({ ok: true })
  }
  if (p === '/api/admin/testimonials' && m === 'GET') return listTestimonials(env, true)
  const tm = p.match(/^\/api\/admin\/testimonials\/(\d+)$/)
  if (tm && m === 'PATCH') {
    const { published } = await req.json().catch(() => ({}))
    await env.DB.prepare('UPDATE testimonials SET published = ?1 WHERE id = ?2').bind(published ? 1 : 0, tm[1]).run()
    return json({ ok: true })
  }
  if (tm && m === 'DELETE') {
    await env.DB.prepare('DELETE FROM testimonials WHERE id = ?1').bind(tm[1]).run()
    return json({ ok: true })
  }
  return bad('Not found', 404)
}

// ---------- pages for posts from the database, readable by Google ----------
// The site is prerendered, but posts written in /admin (or scheduled) are not part of that build.
// For /blog/<slug> of a live database post, the worker takes the site's page and puts the post's
// title, description, link preview tags and the article itself into the HTML before sending it.
const escHtml = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
function inlineHtml(t) {
  return escHtml(t)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (all, label, href) => {
      const h = href.replace(/&amp;/g, '&')
      if (/^\/(?!\/)/.test(h)) return `<a href="${escHtml(h)}">${label}</a>`
      if (/^https?:\/\//i.test(h)) return `<a href="${escHtml(h)}" rel="noopener nofollow">${label}</a>`
      return label
    })
}
export function mdToHtml(src) {
  return String(src || '')
    .trim()
    .split(/\n\s*\n/)
    .map((block) => {
      const lines = block.split('\n').map((l) => l.trim()).filter(Boolean)
      const out = []
      let list = null
      const flush = () => {
        if (list) out.push(`<${list.tag}>${list.items.map((i) => `<li>${inlineHtml(i)}</li>`).join('')}</${list.tag}>`)
        list = null
      }
      let para = []
      const flushP = () => {
        if (para.length) out.push(`<p>${inlineHtml(para.join(' '))}</p>`)
        para = []
      }
      for (const l of lines) {
        if (l.startsWith('### ')) { flushP(); flush(); out.push(`<h3>${inlineHtml(l.slice(4))}</h3>`) }
        else if (l.startsWith('## ')) { flushP(); flush(); out.push(`<h2>${inlineHtml(l.slice(3))}</h2>`) }
        else if (l.startsWith('- ')) { flushP(); if (list?.tag !== 'ul') { flush(); list = { tag: 'ul', items: [] } } list.items.push(l.slice(2)) }
        else if (/^\d+\.\s/.test(l)) { flushP(); if (list?.tag !== 'ol') { flush(); list = { tag: 'ol', items: [] } } list.items.push(l.replace(/^\d+\.\s/, '')) }
        else { flush(); para.push(l) }
      }
      flushP()
      flush()
      return out.join('')
    })
    .join('\n')
}

class SetAttr {
  constructor(attr, value) { this.attr = attr; this.value = value }
  element(el) { el.setAttribute(this.attr, this.value) }
}
class SetText {
  constructor(text) { this.text = text }
  element(el) { el.setInnerContent(this.text) }
}
class SetHtml {
  constructor(html) { this.html = html }
  element(el) { el.setInnerContent(this.html, { html: true }) }
}
class Remove { element(el) { el.remove() } }

async function postPage(req, env, slug) {
  const res = await env.ASSETS.fetch(new Request(new URL('/', req.url), req))
  let post = null
  try {
    post = await livePost(env, slug)
  } catch {
    // database not ready: fall back to the normal page
  }
  if (!post) return res
  const url = `${new URL(req.url).origin}/blog/${post.slug}`
  const title = `${post.title} | VRLS Solutions`
  const desc = post.description || post.title
  const date = String(post.publish_at || post.created_at).slice(0, 10)
  const ld = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: post.title,
    description: desc,
    datePublished: post.publish_at || post.created_at,
    dateModified: post.updated_at || post.publish_at,
    mainEntityOfPage: url,
    author: { '@type': 'Person', name: 'Sai Durga Prasad Velagaleti', url: 'https://vrlss.in/about' },
    publisher: { '@type': 'Organization', name: 'VRLS Solutions', url: 'https://vrlss.in' },
    ...(post.cover ? { image: post.cover } : {}),
  }
  const article = `<main class="nx-wrap bl-narrow" style="padding:120px 16px 60px"><nav><a href="/">Home</a> / <a href="/blog">Blog</a></nav><h1>${escHtml(post.title)}</h1><p>By Sai Durga Prasad Velagaleti · ${date}</p><article class="bl-prose">${mdToHtml(post.body)}</article></main>`
  const out = new HTMLRewriter()
    .on('title', new SetText(title))
    .on('meta[name="description"]', new SetAttr('content', desc))
    .on('link[rel="canonical"]', new SetAttr('href', url))
    .on('meta[property="og:type"]', new SetAttr('content', 'article'))
    .on('meta[property="og:title"]', new SetAttr('content', title))
    .on('meta[property="og:description"]', new SetAttr('content', desc))
    .on('meta[property="og:url"]', new SetAttr('content', url))
    .on('meta[name="twitter:title"]', new SetAttr('content', title))
    .on('meta[name="twitter:description"]', new SetAttr('content', desc))
    .on('link[rel="alternate"][hreflang]', new Remove())
    .on('script[type="application/ld+json"]', new SetHtml(JSON.stringify(ld).replace(/</g, '\\u003c')))
    .on('#root', new SetHtml(article))
    .transform(res)
  const h = new Headers(out.headers)
  h.set('cache-control', 'public, max-age=300')
  return new Response(out.body, { status: 200, headers: h })
}

async function blogSitemap(req, env) {
  const origin = new URL(req.url).origin
  let rows = []
  try {
    rows = (await env.DB.prepare(`SELECT slug, publish_at, updated_at FROM posts WHERE ${LIVE} ORDER BY publish_at DESC LIMIT 5000`).bind(now()).all()).results
  } catch {
    // database not ready
  }
  const urls = rows
    .map((r) => {
      const mod = [r.publish_at, r.updated_at].filter(Boolean).sort().pop()
      return `<url><loc>${origin}/blog/${escHtml(r.slug)}</loc><lastmod>${String(mod).slice(0, 10)}</lastmod></url>`
    })
    .join('')
  return new Response(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`, {
    headers: { 'content-type': 'application/xml; charset=utf-8', 'cache-control': 'public, max-age=1800' },
  })
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url)
    if (url.pathname === '/blog-sitemap.xml') return blogSitemap(req, env)
    const bm = url.pathname.match(/^\/blog\/([a-z0-9-]{1,80})\/?$/)
    if (bm && (req.method === 'GET' || req.method === 'HEAD')) {
      // Articles that are part of the build (in src/site/blog/posts.js) are already prerendered files.
      if (STATIC_SLUGS.has(bm[1])) return env.ASSETS.fetch(req)
      return postPage(req, env, bm[1])
    }
    if (url.pathname.startsWith('/api/')) {
      try {
        return await api(req, env)
      } catch (e) {
        console.error(e)
        return bad('Something went wrong. Please try again.', 500)
      }
    }
    return env.ASSETS.fetch(req)
  },
}
