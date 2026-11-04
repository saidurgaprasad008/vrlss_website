// worker/index.js — the small server behind vrlss.in: blog posts and testimonials.
// Everything that isn't /api/* is the normal website (served from ./dist).
//
// Secrets (set once, never put them in code or GitHub):
//   npx wrangler secret put ADMIN_PASSWORD   -> the password for vrlss.in/admin
//   npx wrangler secret put SESSION_SECRET   -> any long random text (signs the admin login cookie)

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
async function listPosts(env, all) {
  const q = all
    ? 'SELECT id, slug, title, description, cover, published, created_at, updated_at FROM posts ORDER BY created_at DESC LIMIT 200'
    : 'SELECT slug, title, description, cover, created_at FROM posts WHERE published = 1 ORDER BY created_at DESC LIMIT 100'
  const { results } = await env.DB.prepare(q).all()
  return json({ posts: results })
}

async function getPost(env, slug, all) {
  const row = await env.DB.prepare(`SELECT * FROM posts WHERE slug = ?1 ${all ? '' : 'AND published = 1'}`).bind(slug).first()
  return row ? json({ post: row }) : bad('Not found', 404)
}

function readPost(b) {
  const title = str(b.title, 140)
  if (title.length < 3) return [null, 'Please add a title.']
  const body = str(b.body, 50000)
  if (body.length < 20) return [null, 'The post is too short.']
  return [{ title, slug: slugify(b.slug || title), description: str(b.description, 300), body, cover: safeUrl(b.cover), published: b.published === false ? 0 : 1 }]
}

async function savePost(req, env, id) {
  const [p, err] = readPost(await req.json().catch(() => ({})))
  if (err) return bad(err)
  try {
    if (id) {
      await env.DB.prepare('UPDATE posts SET slug=?1, title=?2, description=?3, body=?4, cover=?5, published=?6, updated_at=?7 WHERE id=?8')
        .bind(p.slug, p.title, p.description, p.body, p.cover, p.published, now(), id).run()
    } else {
      await env.DB.prepare('INSERT INTO posts (slug, title, description, body, cover, published, created_at, updated_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?7)')
        .bind(p.slug, p.title, p.description, p.body, p.cover, p.published, now()).run()
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
  if (p.startsWith('/api/posts/') && m === 'GET') return getPost(env, decodeURIComponent(p.slice(11)), false)
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

export default {
  async fetch(req, env) {
    const url = new URL(req.url)
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
