// Decides how rich the homepage can be. Only ever called in the browser (after hydration).
//   full   desktop WebGL + post-processing · lite  phones: lighter scene
//   static prefers-reduced-motion: one still render · none  no WebGL: CSS fallback
// The home page now uses the normal hero (none) by default: lighter and faster on every device.
// The full 3D scroll scene is still here; open the site with ?cinema=full (or lite/static) to see it.
export function hasWebGL() {
  try {
    const c = document.createElement('canvas')
    return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl')))
  } catch {
    return false
  }
}

export function getCaps() {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const mobile = window.matchMedia('(max-width: 768px), (pointer: coarse)').matches
  let three = 'none'
  const forced = new URLSearchParams(window.location.search).get('cinema')
  if (['full', 'lite', 'static'].includes(forced)) three = !hasWebGL() ? 'none' : forced
  return { three, motion: !reduced && forced !== 'static', mobile }
}

export const isCinematic = (three) => three === 'full' || three === 'lite'
