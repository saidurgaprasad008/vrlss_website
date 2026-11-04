import { useEffect, useState } from 'react'
import { PageHero, CtaBand } from '../components/Bits'
import { Link } from '../router'
import { brand, waLink } from '../brand'
import { posts, sortedPosts, postPath, postByPath, fmtPostDate } from '../blog/posts'

// ---------- Tiny Markdown renderer (headings, lists, paragraphs, **bold**, *italic*, [links](/path)) ----------
function inline(text, key = 'i') {
  const out = []
  const re = /(\*\*([^*]+)\*\*|\*([^*]+)\*|\[([^\]]+)\]\(([^)]+)\))/g
  let last = 0
  let m
  let n = 0
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index))
    const k = `${key}-${n++}`
    if (m[2]) out.push(<strong key={k}>{m[2]}</strong>)
    else if (m[3]) out.push(<em key={k}>{m[3]}</em>)
    else if (/^\/(?!\/)/.test(m[5])) out.push(<Link key={k} to={m[5]}>{m[4]}</Link>)
    else if (/^https?:\/\//i.test(m[5])) out.push(<a key={k} href={m[5]} target="_blank" rel="noopener noreferrer nofollow">{m[4]}</a>)
    else out.push(m[4]) // anything else (javascript:, data: ...) is shown as plain text
    last = re.lastIndex
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}

function renderBlock(lines, i) {
  if (!lines.length) return null
  const first = lines[0]
  if (first.startsWith('### ') || first.startsWith('## ')) {
    const h = first.startsWith('### ') ? <h3 key={`${i}h`}>{inline(first.slice(4), i)}</h3> : <h2 key={`${i}h`}>{inline(first.slice(3), i)}</h2>
    return [h, renderBlock(lines.slice(1), `${i}r`)]
  }
  if (lines.every((l) => l.startsWith('- '))) return <ul key={i}>{lines.map((l, j) => <li key={j}>{inline(l.slice(2), `${i}-${j}`)}</li>)}</ul>
  if (lines.every((l) => /^\d+\.\s/.test(l))) return <ol key={i}>{lines.map((l, j) => <li key={j}>{inline(l.replace(/^\d+\.\s/, ''), `${i}-${j}`)}</li>)}</ol>
  const li = lines.findIndex((l) => l.startsWith('- ') || /^\d+\.\s/.test(l))
  if (li > 0) return [<p key={`${i}p`}>{inline(lines.slice(0, li).join(' '), `${i}p`)}</p>, renderBlock(lines.slice(li), `${i}l`)]
  return <p key={i}>{inline(lines.join(' '), i)}</p>
}

export function Markdown({ source }) {
  return source.trim().split(/\n\s*\n/).map((b, i) => renderBlock(b.split('\n').map((l) => l.trim()).filter(Boolean), i))
}

// ---------- posts written from /admin (stored in the database) ----------
const fmtIso = (iso) => fmtPostDate(String(iso || '').slice(0, 10))
const readMins = (body = '') => Math.max(1, Math.round(body.split(/\s+/).length / 200))
const safeCover = (u) => (/^https:\/\//i.test(u || '') ? u : '')

function useDbPosts() {
  const [list, setList] = useState([])
  useEffect(() => {
    let live = true
    fetch('/api/posts')
      .then((r) => (r.ok ? r.json() : { posts: [] }))
      .then((d) => live && setList(d.posts || []))
      .catch(() => {})
    return () => { live = false }
  }, [])
  return list
}

// ---------- /blog ----------
export function Blog() {
  const db = useDbPosts()
  const statics = new Set(posts.map((p) => p.slug))
  const fromDb = db.filter((p) => !statics.has(p.slug))
  return (
    <>
      <PageHero crumb="Blog" title="Blog" lead="Plain-English guides on websites, Google and growing a small business online." />
      <section className="nx-section bl-wrap">
        <div className="nx-wrap bl-grid">
          {fromDb.map((p) => (
            <Link key={p.slug} to={`/blog/${p.slug}`} className="bl-card">
              {safeCover(p.cover) && <img src={safeCover(p.cover)} alt="" loading="lazy" width="1200" height="630" />}
              <div className="bl-card-body">
                <span className="bl-meta">{fmtIso(p.publish_at || p.created_at)}</span>
                <h2>{p.title}</h2>
                <p>{p.description}</p>
                <span className="bl-more">Read article →</span>
              </div>
            </Link>
          ))}
          {sortedPosts().map((p) => (
            <Link key={p.slug} to={postPath(p)} className="bl-card">
              {p.cover && <img src={`/blog/${p.slug}.jpg`} alt="" loading="lazy" width="1200" height="630" />}
              <div className="bl-card-body">
                <span className="bl-meta">{fmtPostDate(p.date)} · {p.readMins} min read</span>
                <h2>{p.title}</h2>
                <p>{p.description}</p>
                <span className="bl-more">Read article →</span>
              </div>
            </Link>
          ))}
        </div>
      </section>
      <CtaBand />
    </>
  )
}

// ---------- /blog/:slug ----------
export function BlogPost({ path }) {
  const p = postByPath[path]
  if (!p) return null
  const others = sortedPosts().filter((x) => x.slug !== p.slug).slice(0, 2)
  return (
    <>
      <section className="bl-hero">
        <div className="nx-wrap bl-narrow">
          <nav className="bl-crumbs" aria-label="Breadcrumb">
            <Link to="/">Home</Link> / <Link to="/blog">Blog</Link>
          </nav>
          <h1>{p.title}</h1>
          <p className="bl-meta">
            By {brand.founder} · {fmtPostDate(p.date)} · {p.readMins} min read
          </p>
        </div>
      </section>
      <article className="nx-section bl-article">
        <div className="nx-wrap bl-narrow">
          {p.cover && <img className="bl-cover" src={`/blog/${p.slug}.jpg`} alt="" width="1200" height="630" />}
          <div className="bl-prose">
            <Markdown source={p.body} />
          </div>
          <aside className="bl-cta">
            <div>
              <strong>Free homepage demo for your business</strong>
              <span>See your new website before you pay. Plans from ₹4,999.</span>
            </div>
            <div className="bl-cta-btns">
              <Link to="/start" className="nx-btn nx-btn-primary">Get an estimate</Link>
              <a href={waLink(`Hi Sai, I read "${p.title}" and I'd like a free demo.`)} className="nx-btn nx-btn-ghost" target="_blank" rel="noopener noreferrer">WhatsApp</a>
            </div>
          </aside>
          {others.length > 0 && (
            <section className="bl-next">
              <h2>Keep reading</h2>
              {others.map((o) => (
                <Link key={o.slug} to={postPath(o)} className="bl-next-item">
                  <span>{o.title}</span><span aria-hidden="true">→</span>
                </Link>
              ))}
            </section>
          )}
        </div>
      </article>
    </>
  )
}

// ---------- /blog/:slug for posts from the database ----------
export function DbPost({ slug }) {
  const [p, setP] = useState(undefined) // undefined = loading, null = not found
  useEffect(() => {
    let live = true
    fetch(`/api/posts/${encodeURIComponent(slug)}`)
      .then((r) => (r.ok ? r.json() : { post: null }))
      .then((d) => live && setP(d.post || null))
      .catch(() => live && setP(null))
    return () => { live = false }
  }, [slug])
  useEffect(() => {
    if (!p) return
    document.title = `${p.title} | ${brand.name}`
    document.querySelector('meta[name="description"]')?.setAttribute('content', p.description || p.title)
  }, [p])

  if (p === undefined)
    return <section className="bl-hero"><div className="nx-wrap bl-narrow"><p className="bl-meta">Loading…</p></div></section>
  if (p === null)
    return (
      <section className="bl-hero">
        <div className="nx-wrap bl-narrow">
          <h1>Article not found</h1>
          <p className="bl-meta">It may have been moved or removed. <Link to="/blog">See all articles</Link>.</p>
        </div>
      </section>
    )
  return (
    <>
      <section className="bl-hero">
        <div className="nx-wrap bl-narrow">
          <nav className="bl-crumbs" aria-label="Breadcrumb">
            <Link to="/">Home</Link> / <Link to="/blog">Blog</Link>
          </nav>
          <h1>{p.title}</h1>
          <p className="bl-meta">By {brand.founder} · {fmtIso(p.publish_at || p.created_at)} · {readMins(p.body)} min read</p>
        </div>
      </section>
      <article className="nx-section bl-article">
        <div className="nx-wrap bl-narrow">
          {safeCover(p.cover) && <img className="bl-cover" src={safeCover(p.cover)} alt="" width="1200" height="630" />}
          <div className="bl-prose">
            <Markdown source={p.body} />
          </div>
          <aside className="bl-cta">
            <div>
              <strong>Free homepage demo for your business</strong>
              <span>See your new website before you pay. Plans from ₹4,999.</span>
            </div>
            <div className="bl-cta-btns">
              <Link to="/start" className="nx-btn nx-btn-primary">Get an estimate</Link>
              <a href={waLink(`Hi Sai, I read "${p.title}" and I'd like a free demo.`)} className="nx-btn nx-btn-ghost" target="_blank" rel="noopener noreferrer">WhatsApp</a>
            </div>
          </aside>
        </div>
      </article>
    </>
  )
}
