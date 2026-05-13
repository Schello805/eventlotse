import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeEventRows } from './event-store.js'

test('normalisiert Event-JSON in Tabellenzeilen', () => {
  const rows = normalizeEventRows('event-1', {
    actions: [
      {
        id: 'action-pa',
        title: 'PA-Anlage',
        category: 'Infrastruktur',
        owners: ['user-a'],
        deadline: '2026-06-01',
        tasks: [
          { id: 'task-1', title: 'Strom prüfen', ownerIds: ['user-b'], due: '2026-05-25', status: 'todo', notes: 'n', files: [], comments: [] },
        ],
      },
    ],
    infrastructure: ['PA-Anlage'],
    runsheet: [{ id: 'run-1', time: '18:00', title: 'Soundcheck', owner: 'Technik' }],
    budget: [{ id: 'budget-1', label: 'Miete PA', type: 'expense', amount: 120 }],
  })

  assert.equal(rows.actions.length, 1)
  assert.equal(rows.tasks.length, 1)
  assert.deepEqual(rows.infrastructure[0].owner_ids, ['user-a'])
  assert.equal(rows.runsheet[0].title, 'Soundcheck')
  assert.equal(rows.budget[0].amount, 120)
})
