import { CC, END, isMarker } from '../markers.js'

// A simple FIFO queue that stores interleaved values and markers.
// Intentionally backed by a plain array for the MVP — will be swapped for
// a ring buffer once we care about memory pressure on large payloads.
//
// Shape: [value, value, CC, value, CC, END]

export class ResultQueue {
  constructor(path) {
    this.path = path
    this.items = []
    this.closed = false // true once END has been pushed
  }

  addValue(v) {
    if (this.closed) throw new Error(`ResultQueue(${this.path}): addValue after END`)
    this.items.push(v)
  }

  addContextChange() {
    if (this.closed) throw new Error(`ResultQueue(${this.path}): addContextChange after END`)
    // Collapse consecutive CCs — empty contexts are meaningless in SAP PO semantics
    if (this.items.length > 0 && this.items[this.items.length - 1] === CC) return
    this.items.push(CC)
  }

  addEnd() {
    if (this.closed) return
    this.items.push(END)
    this.closed = true
  }

  // Read-only inspection (used by NodeArgWrapper)
  peek(cursor) {
    return cursor < this.items.length ? this.items[cursor] : END
  }

  length() {
    return this.items.length
  }

  // Debug helper — pretty-print for test assertions
  describe() {
    return this.items.map((x) => {
      if (x === CC) return '⏎CC'
      if (x === END) return '⏹END'
      if (isMarker(x)) return '∙marker'
      return JSON.stringify(x)
    }).join(' · ')
  }
}
