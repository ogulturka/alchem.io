import { CC, END, isMarker } from '../markers.js'

// Adapts a ResultQueue to the IResIterator interface that function wrappers
// consume. Iterators are PULL-BASED and LAZY — they never buffer ahead of
// what's asked for. This mirrors SAP PO's ConcurrentBuffer semantics and is
// what makes stateful functions (Counter, If) work correctly.
//
// Contract:
//   peek()             → current token (value | CC | END)
//   hasValue()         → peek is a real value (not marker)
//   isContextChanged() → peek is CC
//   isEnd()            → peek is END
//   advance()          → move cursor one step forward
//
// SAP exposes getValue / gotoNextValue / gotoNextContext / isContextChanged /
// isLastOne — our reduced surface is functionally equivalent for V2V/Q2Q/C2C
// and lets us drop the "buffer one value ahead" dance.

export class NodeArgWrapper {
  constructor(queue) {
    this.queue = queue
    this.cursor = 0
  }

  peek() {
    return this.queue.peek(this.cursor)
  }

  hasValue() {
    const t = this.peek()
    return !isMarker(t)
  }

  isContextChanged() {
    return this.peek() === CC
  }

  isEnd() {
    return this.peek() === END
  }

  advance() {
    if (this.cursor < this.queue.length()) this.cursor += 1
  }

  // Convenience: read current value and advance.
  // Throws if caller forgot to check hasValue() first — that's a sign of
  // a bug in the consumer, not something we should paper over.
  consumeValue() {
    if (!this.hasValue()) {
      throw new Error(`NodeArgWrapper(${this.queue.path}): consumeValue() called on marker token`)
    }
    const v = this.peek()
    this.advance()
    return v
  }
}
