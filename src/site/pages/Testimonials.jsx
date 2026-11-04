// /testimonials — anyone can share their experience; it appears straight away.
// Limits (in worker/index.js): 3 per person per day, no links, and a hidden field that catches bots.
// The admin can hide or delete any entry from /admin.
import { useEffect, useState } from 'react'
import { PageHero, CtaBand, Star } from '../components/Bits'

const fmt = (iso) => {
  try {
    return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
  } catch {
    return ''
  }
}

function Stars({ n, onPick }) {
  return (
    <span className={`pf-stars${onPick ? ' ts-pick' : ''}`} role={onPick ? 'radiogroup' : undefined} aria-label={onPick ? 'Your rating' : `${n} out of 5`}>
      {[1, 2, 3, 4, 5].map((i) =>
        onPick ? (
          <button key={i} type="button" role="radio" aria-checked={n === i} aria-label={`${i} star${i > 1 ? 's' : ''}`} onClick={() => onPick(i)}>
            <Star on={i <= n} />
          </button>
        ) : (
          <Star key={i} on={i <= n} />
        ),
      )}
    </span>
  )
}

export default function Testimonials() {
  const [list, setList] = useState(null)
  const [form, setForm] = useState({ name: '', role: '', company: '', rating: 5, text: '', website: '' })
  const [state, setState] = useState({ busy: false, msg: '', ok: false })

  const load = () =>
    fetch('/api/testimonials')
      .then((r) => (r.ok ? r.json() : { testimonials: [] }))
      .then((d) => setList(d.testimonials || []))
      .catch(() => setList([]))
  useEffect(() => {
    load()
  }, [])

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  async function submit(e) {
    e.preventDefault()
    setState({ busy: true, msg: '', ok: false })
    try {
      const r = await fetch('/api/testimonials', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(form) })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d.error || 'Could not send. Please try again.')
      setForm({ name: '', role: '', company: '', rating: 5, text: '', website: '' })
      setState({ busy: false, msg: 'Thank you! Your testimonial is now on the page.', ok: true })
      load()
    } catch (err) {
      setState({ busy: false, msg: err.message, ok: false })
    }
  }

  const n = list?.length || 0
  const avg = n ? Math.round((list.reduce((s, t) => s + t.rating, 0) / n) * 10) / 10 : 0

  return (
    <>
      <PageHero crumb="Testimonials" title="What people say" lead="Worked with us, or tried one of our demos? Share your experience below. It appears on this page straight away." />

      <section className="nx-section ts-sec">
        <div className="nx-wrap ts-layout">
          <div className="ts-list">
            {list === null ? (
              <p className="ts-note">Loading testimonials…</p>
            ) : n === 0 ? (
              <p className="ts-note">No testimonials yet. Be the first to share yours.</p>
            ) : (
              <>
                <p className="rv-sum"><Stars n={Math.round(avg)} /> {avg.toFixed(1)} average from {n} testimonial{n === 1 ? '' : 's'}</p>
                <div className="rv-grid">
                  {list.map((t) => (
                    <figure className="rv-card" key={t.id}>
                      <Stars n={t.rating} />
                      <blockquote>{t.text}</blockquote>
                      <figcaption>
                        <strong>{t.name}</strong>
                        <span>{[t.role, t.company].filter(Boolean).join(', ')}</span>
                        <em>{fmt(t.created_at)}</em>
                      </figcaption>
                    </figure>
                  ))}
                </div>
              </>
            )}
          </div>

          <form className="ts-form" onSubmit={submit}>
            <h2>Share your experience</h2>
            <label>
              <span>Your name *</span>
              <input value={form.name} onChange={set('name')} required minLength={2} maxLength={60} autoComplete="name" />
            </label>
            <div className="ts-row">
              <label>
                <span>Role</span>
                <input value={form.role} onChange={set('role')} maxLength={60} placeholder="e.g. Owner" />
              </label>
              <label>
                <span>Business</span>
                <input value={form.company} onChange={set('company')} maxLength={80} autoComplete="organization" />
              </label>
            </div>
            <div className="ts-rate">
              <span>Rating</span>
              <Stars n={form.rating} onPick={(r) => setForm((f) => ({ ...f, rating: r }))} />
            </div>
            <label>
              <span>Your testimonial *</span>
              <textarea value={form.text} onChange={set('text')} required minLength={10} maxLength={1000} rows={5} />
              <small>{form.text.length}/1000</small>
            </label>
            {/* hidden from people; bots fill it in and get ignored */}
            <label className="ts-hp" aria-hidden="true">
              <span>Website</span>
              <input tabIndex={-1} autoComplete="off" value={form.website} onChange={set('website')} />
            </label>
            <button className="nx-btn nx-btn-primary" type="submit" disabled={state.busy}>
              <span>{state.busy ? 'Sending…' : 'Post testimonial'}</span>
            </button>
            {state.msg && <p className={state.ok ? 'ts-ok' : 'ts-err'} role="status">{state.msg}</p>}
            <p className="ts-fine">Your name, role, business, rating and words are shown publicly. Please don’t include phone numbers or links.</p>
          </form>
        </div>
      </section>
      <CtaBand />
    </>
  )
}
