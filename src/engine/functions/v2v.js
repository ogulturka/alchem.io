// V2V function catalog (MVP subset from SAP PO flib7).
// Every function here is a pure value→value transform.
// Full catalog lands in Faz 1 — this is just enough to prove the pipeline.

export function toUpperCase(s) {
  return String(s ?? '').toUpperCase()
}

export function toLowerCase(s) {
  return String(s ?? '').toLowerCase()
}

// SAP PO's concat takes (a, b, separator) — separator stored as a parameter,
// not an input arg. For the MVP we hardcode a space; parameter plumbing lands
// later along with Container.
export function concat(a, b, sep = ' ') {
  return `${a ?? ''}${sep}${b ?? ''}`
}

// Arithmetic uses BigDecimal-equivalent precision in SAP PO. For the prova
// we're using native number — acceptable for the test inputs, but a known
// gap to close in Faz 1 (JS has a BigInt but no built-in BigDecimal).
export function add(a, b) {
  return Number(a ?? 0) + Number(b ?? 0)
}

// Convenience catalog — future Alchopilot intents can look up by name.
export const V2V_CATALOG = {
  toUpperCase,
  toLowerCase,
  concat,
  add,
}
