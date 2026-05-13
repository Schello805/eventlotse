import test from 'node:test'
import assert from 'node:assert/strict'
import { dueTasksForEvent } from './reminders.js'

test('Erinnerungen berücksichtigen konfigurierbaren Vorlauf', () => {
  const event = {
    actions: [
      {
        title: 'Aufbau',
        tasks: [
          { title: 'heute', due: '2026-05-13', status: 'todo' },
          { title: 'in drei Tagen', due: '2026-05-16', status: 'todo' },
          { title: 'zu spät im Fenster', due: '2026-05-17', status: 'todo' },
          { title: 'erledigt', due: '2026-05-14', status: 'done' },
        ],
      },
    ],
  }

  assert.deepEqual(dueTasksForEvent(event, '2026-05-13', 3).map((task) => task.title), ['heute', 'in drei Tagen'])
})
