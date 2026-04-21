import { CC, END, SUPPRESS } from '../markers.js'
import { NodeArgWrapper } from '../iterator/NodeArgWrapper.js'
import { V2VWrapper } from '../wrappers/V2VWrapper.js'

// Target tree walker. Given a target spec and a populated ValueStorage,
// produces a plain JS object (or array-of-objects) by reading the appropriate
// iterators. XML/JSON serialization is a *separate* concern — this layer
// just produces the data shape.
//
// Target spec shape:
//   {
//     kind: 'container',
//     name: 'Result',
//     children: [ {...}, {...} ]
//   }
//   {
//     kind: 'leaf',
//     name: 'fullName',
//     source: 'Customer.name',            // direct mapping (no transform)
//     // OR:
//     transform: { fn: 'toUpperCase', args: ['Customer.name'] }
//   }
//
// For the MVP we support only flat (non-repeating) targets. Array-aware
// walking lands in Faz 2 together with CC-driven node repetition.

export class MappingProgram {
  constructor(storage, functions) {
    this.storage = storage
    this.functions = functions
  }

  run(spec) {
    return this._renderNode(spec)
  }

  _renderNode(node) {
    if (node.kind === 'container') {
      const obj = {}
      for (const child of node.children) {
        const rendered = this._renderNode(child)
        if (rendered !== SUPPRESS) obj[child.name] = rendered
      }
      return obj
    }

    if (node.kind === 'leaf') {
      const value = this._resolveLeaf(node)
      return value
    }

    throw new Error(`MappingProgram: unknown node kind: ${node.kind}`)
  }

  _resolveLeaf(node) {
    // Direct mapping — no transform
    if (node.source && !node.transform) {
      const iter = new NodeArgWrapper(this.storage.getQueue(node.source))
      return this._drainToScalar(iter)
    }

    // Transform mapping — wrap the arg iterators with a V2VWrapper
    if (node.transform) {
      const { fn, args } = node.transform
      const impl = this.functions[fn]
      if (!impl) throw new Error(`MappingProgram: unknown function "${fn}"`)

      const argIters = args.map((path) => new NodeArgWrapper(this.storage.getQueue(path)))
      const wrapper = new V2VWrapper(impl, argIters, `__${node.name}__`)
      const outputQueue = wrapper.run()
      const outIter = new NodeArgWrapper(outputQueue)
      return this._drainToScalar(outIter)
    }

    throw new Error(`MappingProgram: leaf "${node.name}" has no source or transform`)
  }

  // MVP helper: collapse a queue into a single scalar (the first value).
  // Faz 2 replaces this with proper CC-aware iteration for repeating targets.
  _drainToScalar(iter) {
    while (!iter.isEnd()) {
      if (iter.hasValue()) {
        const v = iter.consumeValue()
        return v
      }
      iter.advance() // skip CC markers for scalar-mode
    }
    return null
  }
}
