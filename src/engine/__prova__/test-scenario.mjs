// Alchemio engine — MVP prova.
//
// Three end-to-end scenarios that exercise the core engine surface:
//   1. Scalar V2V   — Customer.name → toUpperCase → fullName
//   2. Multi-arg V2V — firstName + lastName → concat → fullName
//   3. Queue alignment — multiple CC-separated groups through a V2V chain
//
// Runs with: node src/engine/__prova__/test-scenario.mjs
// Exits 0 if all scenarios pass, 1 if any fail.

import { createEngine, MARKERS } from '../index.js'
import { V2V_CATALOG } from '../functions/v2v.js'
import { NodeArgWrapper } from '../iterator/NodeArgWrapper.js'
import { V2VWrapper } from '../wrappers/V2VWrapper.js'
import { ValueStorage } from '../storage/ValueStorage.js'

const RESET = '\x1b[0m'
const GREEN = '\x1b[32m'
const RED = '\x1b[31m'
const DIM = '\x1b[90m'
const BOLD = '\x1b[1m'

let passed = 0
let failed = 0

function check(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (ok) {
    passed++
    console.log(`  ${GREEN}✓${RESET} ${label}`)
  } else {
    failed++
    console.log(`  ${RED}✗${RESET} ${label}`)
    console.log(`      expected: ${DIM}${JSON.stringify(expected)}${RESET}`)
    console.log(`      got:      ${RED}${JSON.stringify(actual)}${RESET}`)
  }
}

function banner(title) {
  console.log(`\n${BOLD}── ${title} ${'─'.repeat(60 - title.length)}${RESET}`)
}

// ───────────────────────────────────────────────────────────────────
// Scenario 1 — scalar V2V: Customer.name → toUpperCase → fullName
// ───────────────────────────────────────────────────────────────────
banner('Scenario 1: scalar V2V (toUpperCase)')

{
  const { storage, run } = createEngine({ functions: V2V_CATALOG })

  // Simulate parser events for:
  //   <PayloadRequest><Customer><name>John Doe</name></Customer></PayloadRequest>
  storage.addValue('PayloadRequest.Customer.name', 'John Doe')
  storage.addContext('PayloadRequest.Customer')
  storage.addContext('PayloadRequest')
  storage.end()

  console.log(DIM + '  storage dump:\n' + storage.dump() + RESET)

  const targetSpec = {
    kind: 'container',
    name: 'Result',
    children: [
      {
        kind: 'leaf',
        name: 'fullName',
        transform: { fn: 'toUpperCase', args: ['PayloadRequest.Customer.name'] },
      },
    ],
  }

  const result = run(targetSpec)
  check('Result.fullName === "JOHN DOE"', result, { fullName: 'JOHN DOE' })
}

// ───────────────────────────────────────────────────────────────────
// Scenario 2 — multi-arg V2V: concat(firstName, lastName)
// ───────────────────────────────────────────────────────────────────
banner('Scenario 2: multi-arg V2V (concat)')

{
  const { storage, run } = createEngine({ functions: V2V_CATALOG })

  storage.addValue('Customer.firstName', 'John')
  storage.addValue('Customer.lastName', 'Doe')
  storage.addContext('Customer')
  storage.end()

  const targetSpec = {
    kind: 'container',
    name: 'Result',
    children: [
      {
        kind: 'leaf',
        name: 'fullName',
        transform: {
          fn: 'concat',
          args: ['Customer.firstName', 'Customer.lastName'],
        },
      },
      {
        kind: 'leaf',
        name: 'upperFirst',
        transform: { fn: 'toUpperCase', args: ['Customer.firstName'] },
      },
    ],
  }

  const result = run(targetSpec)
  check('concat produces "John Doe"', result.fullName, 'John Doe')
  check('toUpperCase produces "JOHN"', result.upperFirst, 'JOHN')
  check('full shape', result, { fullName: 'John Doe', upperFirst: 'JOHN' })
}

// ───────────────────────────────────────────────────────────────────
// Scenario 3 — queue alignment through V2VWrapper directly.
// Simulates a multi-context input: three orders, each with an amount,
// piped through add(amount, 10). Validates that CC markers survive
// the V2V transform untouched (lockstep invariant).
// ───────────────────────────────────────────────────────────────────
banner('Scenario 3: V2V lockstep preserves CC boundaries')

{
  const storage = new ValueStorage()

  // Three "orders" with amounts 100, 200, 300 each in its own context
  storage.addValue('Orders.Order.amount', 100)
  storage.addContext('Orders.Order')
  storage.addValue('Orders.Order.amount', 200)
  storage.addContext('Orders.Order')
  storage.addValue('Orders.Order.amount', 300)
  storage.addContext('Orders.Order')
  storage.end()

  // Aligned constant queue [10, CC, 10, CC, 10, CC, END]
  const constQueue = storage._queueFor('__const_10__')
  constQueue.addValue(10)
  constQueue.addContextChange()
  constQueue.addValue(10)
  constQueue.addContextChange()
  constQueue.addValue(10)
  constQueue.addContextChange()
  constQueue.addEnd()

  console.log(DIM + '  storage dump:\n' + storage.dump() + RESET)

  const amountIter = new NodeArgWrapper(storage.getQueue('Orders.Order.amount'))
  const constIter  = new NodeArgWrapper(storage.getQueue('__const_10__'))

  const wrapper = new V2VWrapper(V2V_CATALOG.add, [amountIter, constIter], 'amountPlusTen')
  const output = wrapper.run()

  console.log(DIM + '  output queue: ' + output.describe() + RESET)

  // Drain the output queue to verify structure
  const items = []
  let ccCount = 0
  for (const item of output.items) {
    if (item === MARKERS.CC) { items.push('CC'); ccCount++ }
    else if (item === MARKERS.END) items.push('END')
    else items.push(item)
  }

  check('output has 3 values + 3 CCs + END', items, [110, 'CC', 210, 'CC', 310, 'CC', 'END'])
  check('CC count preserved', ccCount, 3)
}

// ───────────────────────────────────────────────────────────────────
// Scenario 4 — error surface: intentional queue misalignment
// ───────────────────────────────────────────────────────────────────
banner('Scenario 4: misalignment is reported, not silenced')

{
  // amount receives CC when Order closes; tax doesn't (it's in a
  // different subtree and was never under the closed Order). The lockstep
  // V2V sees (CC vs END) on the second step and must raise.
  const storage = new ValueStorage()
  storage.addValue('Orders.Order.amount', 100)
  storage.addContext('Orders.Order')               // amount: [100, CC]
  storage.addValue('Other.tax', 5)                  // tax: [5]
  storage.end()                                      // amount: [100, CC, END] / tax: [5, END]

  console.log(DIM + '  storage dump:\n' + storage.dump() + RESET)

  const iterAmount = new NodeArgWrapper(storage.getQueue('Orders.Order.amount'))
  const iterTax    = new NodeArgWrapper(storage.getQueue('Other.tax'))
  const wrapper = new V2VWrapper(V2V_CATALOG.add, [iterAmount, iterTax], 'misaligned')

  let error = null
  try {
    wrapper.run()
  } catch (e) {
    error = e
  }

  check('misalignment throws', !!error, true)
  check('error message mentions alignment', error?.message?.includes('alignment'), true)
}

// ───────────────────────────────────────────────────────────────────
// Summary
// ───────────────────────────────────────────────────────────────────
console.log(`\n${BOLD}── Summary ${'─'.repeat(54)}${RESET}`)
console.log(`  ${GREEN}${passed} passed${RESET}${failed > 0 ? `   ${RED}${failed} failed${RESET}` : ''}`)
console.log()

process.exit(failed === 0 ? 0 : 1)
