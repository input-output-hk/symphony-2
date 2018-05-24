export const PI = Math.PI
export const PI2 = PI * 2
export const HALF_PI = PI * 0.5
export const DEG2RAD = PI / 180.0
export const RAD2DEG = 180.0 / PI

// Be aware GLSL order
export const step = (edge, val) => val < edge ? 0 : 1
export const clamp = (val, min, max) => val < min ? min : val > max ? max : val
export const mix = (min, max, ratio) => min + (max - min) * ratio
export const cMix = (min, max, ratio) => min + (max - min) * clamp(ratio, 0, 1)
export const unMix = (min, max, val) => (val - min) / (max - min)
export const cUnMix = (min, max, val) => clamp((val - min) / (max - min), 0, 1)

/*
 * Linearly maps n from range [ a, b ] -> [ x, y ]
 */
export const map = (n, a, b, x, y) => x + (n - a) * (y - x) / (b - a)

/*
 * Linearly maps n from range [ a, b ] -> [ 0, 1 ]
 */
export const normalize = (n, a, b) => map(n, a, b, 0, 1)

export const smoothstep = (edge0, edge1, val) => {
  val = cUnMix(edge0, edge1, val)
  return val * val * (3 - val * 2)
}
export const fract = (val) => val - Math.floor(val)
export const hash = (val) => fract(Math.sin(val) * 43758.5453123)
export const hash2 = (val1, val2) => fract(Math.sin(val1 * 12.9898 + val2 * 4.1414) * 43758.5453)
export const sign = (val) => val ? val < 0 ? -1 : 1 : 0
export const isPowerOfTwo = (val) => (val & -val) === val
export const powerTwoCeilingBase = (val) => Math.ceil(Math.log(val) / Math.log(2))
export const powerTwoCeiling = (val) => {
  if (isPowerOfTwo(val)) return val
  return 1 << powerTwoCeilingBase(val)
}
export const latLngBearing = (lat1, lng1, lat2, lng2) => {
  // lat lng are in rad
  // http://www.movable-type.co.uk/scripts/latlong.html
  let y = Math.sin(lng2 - lng1) * Math.cos(lat2)
  let x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(lng2 - lng1)
  return Math.atan2(y, x)
}
export const distanceTo = (dX, dY) => Math.sqrt(dX * dX + dY * dY)
export const distanceSqrTo = (dX, dY) => dX * dX + dY * dY
export const distanceTo3 = (dX, dY, dZ) => Math.sqrt(dX * dX + dY * dY + dZ * dZ)
export const distanceSqrTo3 = (dX, dY, dZ) => dX * dX + dY * dY + dZ * dZ
export const latLngDistance = (lat1, lng1, lat2, lng2) => {
  // lat lng are in rad
  // http://www.movable-type.co.uk/scripts/latlong.html
  let tLat = Math.sin((lat2 - lat1) / 2)
  let tLng = Math.sin((lng2 - lng1) / 2)
  let a = tLat * tLat + Math.cos(lat1) * Math.cos(lat2) * tLng * tLng
  return 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}
export const cubicBezier = (p0, p1, p2, p3, t) => {
  let c = (p1 - p0) * 3
  let b = (p2 - p1) * 3 - c
  let a = p3 - p0 - c - b
  let t2 = t * t
  let t3 = t2 * t
  return a * t3 + b * t2 + c * t + p0
}
export const cubicBezierFn = (p0, p1, p2, p3) => {
  let c = (p1 - p0) * 3
  let b = (p2 - p1) * 3 - c
  let a = p3 - p0 - c - b
  return (t) => {
    let t2 = t * t
    let t3 = t2 * t
    return a * t3 + b * t2 + c * t + p0
  }
}

export const safeMod = (val, mod) => {
  let absVal = Math.abs(val)
  val = val < 0 ? Math.ceil(absVal / mod) * mod - absVal : val
  return Math.abs(val % mod)
}

export const loop = (val, min, max) => {
  return safeMod(val - min, max - min) + min
}
