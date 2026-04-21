import { CC, END } from '../markers.js'
import { ResultQueue } from '../storage/ResultQueue.js'

// V2V (Value-to-Value): the simplest execution model.
//
// Takes N input iterators (one per argument) and a pure function. Produces
// an output ResultQueue by stepping the inputs in lockstep:
//
//   - All inputs have a value   → call fn(args...), write result
//   - All inputs have CC        → write CC to output
//   - Any input hits END        → write END, stop
//   - Mixed (alignment error)   → throw
//
// The "lockstep" rule is what makes V2V preserve queue structure: the output
// queue has exactly the same markers as the inputs, just with transformed
// values. This is what SAP calls CACHING_TYPE_V2V.
//
// When the inputs are misaligned (one has CC while another has a value),
// that's a symptom of a mapping error upstream — we surface it rather than
// silently producing garbage.

export class V2VWrapper {
  constructor(fn, argIterators, outputPath = '__v2v_output__') {
    this.fn = fn
    this.args = argIterators
    this.output = new ResultQueue(outputPath)
  }

  run() {
    while (true) {
      const states = this.args.map((it) => this._state(it))

      if (states.every((s) => s === 'value')) {
        const values = this.args.map((it) => it.consumeValue())
        const result = this.fn(...values)
        this.output.addValue(result)
        continue
      }

      if (states.every((s) => s === 'cc')) {
        this.output.addContextChange()
        for (const it of this.args) it.advance()
        continue
      }

      if (states.every((s) => s === 'end')) {
        this.output.addEnd()
        return this.output
      }

      // Mixed state — queue misalignment
      const detail = this.args.map((it, i) => `arg${i}=${states[i]}`).join(', ')
      throw new Error(`V2VWrapper: queue alignment error (${detail})`)
    }
  }

  _state(it) {
    const t = it.peek()
    if (t === CC) return 'cc'
    if (t === END) return 'end'
    return 'value'
  }
}
