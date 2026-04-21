import { ResultQueue } from './ResultQueue.js'

// Central queue depot — one ResultQueue per leaf field path.
//
// The parser calls addValue / addContext / addEnd as it walks the source
// document. CC propagation follows SAP PO semantics: when any element
// closes, every queue whose path sits underneath that element gets a CC.
// This is how V2V functions downstream learn "this group is over."
//
// Example for source XML:
//   <Orders>
//     <Order><amount>100</amount></Order>
//     <Order><amount>200</amount></Order>
//   </Orders>
//
// Queue at "Orders.Order.amount":  100 · CC · 200 · CC · END
//                                     ↑           ↑
//                                 close </Order>  close </Order>

export class ValueStorage {
  constructor() {
    this.queues = new Map() // path → ResultQueue
    this.ended = false
  }

  // Lazily create a queue for a given path
  _queueFor(path) {
    if (!this.queues.has(path)) {
      this.queues.set(path, new ResultQueue(path))
    }
    return this.queues.get(path)
  }

  // Parser callback: a leaf element had text content
  addValue(path, value) {
    if (this.ended) throw new Error('ValueStorage: addValue after end()')
    this._queueFor(path).addValue(value)
  }

  // Parser callback: a container element closed.
  // Emit CC to every queue whose path is BELOW this one.
  // ("Below" means strictly-prefixed with `closedPath + '.'`.)
  addContext(closedPath) {
    if (this.ended) throw new Error('ValueStorage: addContext after end()')
    const prefix = closedPath + '.'
    for (const [path, queue] of this.queues) {
      if (path.startsWith(prefix)) queue.addContextChange()
    }
  }

  // Parser callback: done
  end() {
    if (this.ended) return
    for (const q of this.queues.values()) q.addEnd()
    this.ended = true
  }

  // Consumer side — accessor for iterator wrappers
  getQueue(path) {
    return this._queueFor(path)
  }

  // Debug
  dump() {
    const lines = []
    for (const [path, q] of this.queues) {
      lines.push(`  ${path}: ${q.describe()}`)
    }
    return lines.join('\n')
  }
}
