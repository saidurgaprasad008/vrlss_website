// /admin — Sai's page for writing blog posts and looking after testimonials.
// The password is a Cloudflare secret (ADMIN_PASSWORD); the login lasts 7 days on this device.
import { useEffect, useState } from 'react'
import { Link } from '../router'
import { Markdown } from './Blog'

const api = async (path, opts = {}) => {
  const r = await fetch(path, { ...opts, headers: { 'content-type': 'application/json', ...(opts.headers || {}) }, credentials: 'same-origin' })
  const d = await r.json().catch(() => ({}))
  if (!r.ok) {
    const e = new Error(d.error || `Error ${r.status}`)
    e.status = r.status
    throw e
  }
  return d
}
const fmt = (iso) => (iso ? new Date(iso).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '')
const EMPTY = { id: 0, title: '', slug: '', description: '', cover: '', body: '', published: true }

function Login({ onIn }) {
  const [pw, setPw] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  async function go(e) {
    e.preventDefault()
    setBusy(true)
    setErr('')
    try {
      await api('/api/admin/login', { method: 'POST', body: JSON.stringify({ password: pw }) })
      setPw('')
      onIn()
    } catch (e2) {
      setErr(e2.message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <form className="ts-form ad-login" onSubmit={go}>
      <h2>Admin login</h2>
      <label>
        <span>Password</span>
        <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="current-password" required />
      </label>
      <button className="nx-btn nx-btn-primary" disabled={busy}><span>{busy ? 'Checking…' : 'Log in'}</span></button>
      {err && <p className="ts-err">{err}</p>}
    </form>
  )
}

function PostEditor({ start, onDone }) {
  const [p, setP] = useState(start)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [preview, setPreview] = useState(false)
  const set = (k) => (e) => setP((x) => ({ ...x, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }))
  async function save(e) {
    e.preventDefault()
    setBusy(true)
    setErr('')
    try {
      await api(p.id ? `/api/admin/posts/${p.id}` : '/api/admin/posts', { method: p.id ? 'PUT' : 'POST', body: JSON.stringify(p) })
      onDone(true)
    } catch (e2) {
      setErr(e2.message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <form className="ts-form ad-editor" onSubmit={save}>
      <h2>{p.id ? 'Edit post' : 'New post'}</h2>
      <label><span>Title *</span><input value={p.title} onChange={set('title')} required maxLength={140} /></label>
      <label><span>Link (slug), leave empty to make one from the title</span><input value={p.slug} onChange={set('slug')} maxLength={80} placeholder="my-new-post" /></label>
      <label><span>Short description (shown on the blog list and Google)</span><input value={p.description} onChange={set('description')} maxLength={300} /></label>
      <label><span>Cover image link (https://…, optional, 1200×630 works best)</span><input value={p.cover} onChange={set('cover')} maxLength={500} inputMode="url" /></label>
      <div className="ad-tabs">
        <button type="button" className={!preview ? 'on' : ''} onClick={() => setPreview(false)}>Write</button>
        <button type="button" className={preview ? 'on' : ''} onClick={() => setPreview(true)}>Preview</button>
      </div>
      {preview ? (
        <div className="bl-prose ad-preview"><Markdown source={p.body || '*Nothing yet.*'} /></div>
      ) : (
        <label>
          <span>Post *  ·  ## Heading · - list · **bold** · [link](https://…) · blank line = new paragraph</span>
          <textarea value={p.body} onChange={set('body')} rows={16} required />
        </label>
      )}
      <label className="ad-check"><input type="checkbox" checked={!!p.published} onChange={set('published')} /> <span>Published (untick to keep as a draft)</span></label>
      <div className="ad-actions">
        <button className="nx-btn nx-btn-primary" disabled={busy}><span>{busy ? 'Saving…' : 'Save post'}</span></button>
        <button type="button" className="nx-btn nx-btn-outline" onClick={() => onDone(false)}><span>Cancel</span></button>
      </div>
      {err && <p className="ts-err">{err}</p>}
    </form>
  )
}

export default function Admin() {
  const [me, setMe] = useState(null) // null = checking, false = logged out
  const [tab, setTab] = useState('posts')
  const [posts, setPosts] = useState([])
  const [ts, setTs] = useState([])
  const [editing, setEditing] = useState(null)
  const [err, setErr] = useState('')

  const check = () => api('/api/admin/me').then(() => setMe(true)).catch(() => setMe(false))
  const load = async () => {
    try {
      const [a, b] = await Promise.all([api('/api/admin/posts'), api('/api/admin/testimonials')])
      setPosts(a.posts)
      setTs(b.testimonials)
      setErr('')
    } catch (e) {
      if (e.status === 401) setMe(false)
      else setErr(e.message)
    }
  }
  useEffect(() => { check() }, [])
  useEffect(() => { if (me) load() }, [me])

  async function act(fn) {
    try {
      await fn()
      load()
    } catch (e) {
      setErr(e.message)
    }
  }
  async function edit(id) {
    try {
      const { post } = await api(`/api/admin/posts/${id}`)
      setEditing({ ...post, published: !!post.published })
    } catch (e) {
      setErr(e.message)
    }
  }

  return (
    <section className="nx-section ad-sec">
      <div className="nx-wrap">
        <header className="ad-head">
          <h1 className="nx-h2">Admin</h1>
          {me && (
            <button className="nx-btn nx-btn-outline" onClick={() => api('/api/admin/logout', { method: 'POST' }).finally(() => setMe(false))}>
              <span>Log out</span>
            </button>
          )}
        </header>

        {me === null && <p className="ts-note">Checking…</p>}
        {me === false && <Login onIn={() => setMe(true)} />}

        {me && !editing && (
          <>
            <div className="ad-tabs">
              <button className={tab === 'posts' ? 'on' : ''} onClick={() => setTab('posts')}>Blog posts ({posts.length})</button>
              <button className={tab === 'ts' ? 'on' : ''} onClick={() => setTab('ts')}>Testimonials ({ts.length})</button>
            </div>
            {err && <p className="ts-err">{err}</p>}

            {tab === 'posts' && (
              <div className="ad-list">
                <button className="nx-btn nx-btn-primary" onClick={() => setEditing(EMPTY)}><span>+ New post</span></button>
                {posts.length === 0 && <p className="ts-note">No posts yet. The articles already on the blog live in the code (src/site/blog/posts.js).</p>}
                {posts.map((p) => (
                  <div className="ad-item" key={p.id}>
                    <div>
                      <strong>{p.title}</strong>
                      <span>{p.published ? 'Published' : 'Draft'} · {fmt(p.created_at)}</span>
                    </div>
                    <div className="ad-btns">
                      {!!p.published && <Link to={`/blog/${p.slug}`}>View</Link>}
                      <button onClick={() => edit(p.id)}>Edit</button>
                      <button className="ad-danger" onClick={() => window.confirm(`Delete "${p.title}"?`) && act(() => api(`/api/admin/posts/${p.id}`, { method: 'DELETE' }))}>Delete</button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {tab === 'ts' && (
              <div className="ad-list">
                {ts.length === 0 && <p className="ts-note">No testimonials yet.</p>}
                {ts.map((t) => (
                  <div className={`ad-item${t.published ? '' : ' is-off'}`} key={t.id}>
                    <div>
                      <strong>{t.name} · {'★'.repeat(t.rating)}</strong>
                      <span>{[t.role, t.company].filter(Boolean).join(', ')} · {fmt(t.created_at)}{t.published ? '' : ' · hidden'}</span>
                      <p>{t.text}</p>
                    </div>
                    <div className="ad-btns">
                      <button onClick={() => act(() => api(`/api/admin/testimonials/${t.id}`, { method: 'PATCH', body: JSON.stringify({ published: !t.published }) }))}>
                        {t.published ? 'Hide' : 'Show'}
                      </button>
                      <button className="ad-danger" onClick={() => window.confirm(`Delete the testimonial from ${t.name}?`) && act(() => api(`/api/admin/testimonials/${t.id}`, { method: 'DELETE' }))}>Delete</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {me && editing && <PostEditor start={editing} onDone={(saved) => { setEditing(null); if (saved) load() }} />}
      </div>
    </section>
  )
}
