import test from 'node:test'
import assert from 'node:assert/strict'
import { canHelperUpdateEvent, userEditableActionIds } from './event-permissions.js'

const baseEvent = {
  id: 'event-1',
  name: 'Geburtstag',
  motto: '',
  targetGroup: '',
  guests: 10,
  date: '2026-06-01',
  location: 'Daheim',
  mapUrl: '',
  contact: '',
  photoUrl: '',
  archived: false,
  members: [],
  budget: [],
  infrastructure: [],
  runsheet: [],
  actNotes: '',
  wiki: [],
  actions: [
    {
      id: 'action-1',
      title: 'PA-Anlage',
      category: 'Infrastruktur',
      owners: ['helper-1'],
      deadline: '2026-06-01',
      notes: '',
      tasks: [{ id: 'task-1', title: 'Strom prüfen', ownerIds: ['helper-2'], due: '2026-05-25', status: 'todo', notes: '', files: [], comments: [] }],
    },
  ],
}

test('Hauptverantwortliche dürfen ihre Aktionsgruppe ändern', () => {
  const next = structuredClone(baseEvent)
  next.actions[0].tasks[0].status = 'doing'

  assert.equal(canHelperUpdateEvent(baseEvent, next, 'helper-1'), true)
})

test('Unteraufgaben-Verantwortliche dürfen ihre Unteraufgabe ändern', () => {
  const next = structuredClone(baseEvent)
  next.actions[0].tasks[0].notes = 'Kabeltrommel fehlt'

  assert.equal(canHelperUpdateEvent(baseEvent, next, 'helper-2'), true)
})

test('Helfer dürfen keine Event-Stammdaten ändern', () => {
  const next = structuredClone(baseEvent)
  next.location = 'Andere Location'

  assert.equal(canHelperUpdateEvent(baseEvent, next, 'helper-1'), false)
})

test('sichtbare editierbare Aktionen werden aus Haupt- und Unteraufgaben-Verantwortung ermittelt', () => {
  assert.deepEqual(userEditableActionIds(baseEvent, 'helper-2'), ['action-1'])
})
