// Alchemio engine — public API.
//
// Usage (MVP):
//   import { createEngine, MARKERS } from './engine/index.js'
//   import { V2V_CATALOG } from './engine/functions/v2v.js'
//
//   const { storage, run } = createEngine({ functions: V2V_CATALOG })
//   storage.addValue('Customer.name', 'John Doe')
//   storage.end()
//   const out = run(targetSpec)    // → { Result: { fullName: 'JOHN DOE' } }
//
// This surface will grow (XML/JSON parser, XML serializer, array-aware
// tree walker, Q2Q/C2C wrappers) across Faz 0 → Faz 3. The API stays stable.

import { ValueStorage } from './storage/ValueStorage.js'
import { MappingProgram } from './tree/MappingProgram.js'
import * as markers from './markers.js'

export const MARKERS = markers

export function createEngine({ functions = {} } = {}) {
  const storage = new ValueStorage()
  const program = new MappingProgram(storage, functions)

  return {
    storage,
    run: (spec) => program.run(spec),
  }
}

export { ValueStorage, MappingProgram }
export { NodeArgWrapper } from './iterator/NodeArgWrapper.js'
export { V2VWrapper } from './wrappers/V2VWrapper.js'
