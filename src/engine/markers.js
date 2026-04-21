// Queue markers — unique symbols that cannot collide with user values.
// Every queue is an interleaved sequence of values and these markers.
//
//   CC:       context boundary (closed parent element in the source)
//   END:      end-of-stream  (parser finished for this path)
//   SUPPRESS: "do not emit"  (written by IfWithoutElse etc. on false branch)
//   XSI_NIL:  emit xsi:nil   (written by XsiNilConstant)

export const CC = Symbol('cc')
export const END = Symbol('end')
export const SUPPRESS = Symbol('suppress')
export const XSI_NIL = Symbol('xsi:nil')

// Convenience predicate — anything not one of these markers is a "value"
export function isMarker(x) {
  return x === CC || x === END || x === SUPPRESS || x === XSI_NIL
}
