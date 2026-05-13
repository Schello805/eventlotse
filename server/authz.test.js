import test from 'node:test'
import assert from 'node:assert/strict'
import { canReadEventWithQuery, canWriteEventWithQuery, eventRoleWithQuery } from './authz.js'

const admin = { id: 'admin-id', role: 'Admin' }
const helper = { id: 'helper-id', role: 'Helfer' }

function queryReturning(rowCount) {
  const calls = []
  const queryFn = async (text, params) => {
    calls.push({ text, params })
    return { rowCount }
  }
  queryFn.calls = calls
  return queryFn
}

test('Admin darf Events ohne Membership lesen und bearbeiten', async () => {
  const queryFn = queryReturning(0)

  assert.equal(await canReadEventWithQuery(queryFn, admin, 'event-id'), true)
  assert.equal(await canWriteEventWithQuery(queryFn, admin, 'event-id'), true)
  assert.equal(queryFn.calls.length, 0)
})

test('Helfer darf nur lesen, wenn Event-Membership existiert', async () => {
  assert.equal(await canReadEventWithQuery(queryReturning(1), helper, 'event-id'), true)
  assert.equal(await canReadEventWithQuery(queryReturning(0), helper, 'event-id'), false)
})

test('Helfer darf nur schreiben, wenn die Event-Rolle passt', async () => {
  const queryFn = queryReturning(1)

  assert.equal(await canWriteEventWithQuery(queryFn, helper, 'event-id'), true)
  assert.match(queryFn.calls[0].text, /role IN \('Admin', 'Helfer'\)/)
  assert.deepEqual(queryFn.calls[0].params, ['event-id', 'helper-id'])
})

test('Entfernte Teammitglieder verlieren Schreibrechte', async () => {
  assert.equal(await canWriteEventWithQuery(queryReturning(0), helper, 'event-id'), false)
})

test('Event-Rolle unterscheidet globale Admins von Event-Admins', async () => {
  const queryFn = async () => ({ rows: [{ role: 'Admin' }], rowCount: 1 })

  assert.equal(await eventRoleWithQuery(queryReturning(0), admin, 'event-id'), 'Admin')
  assert.equal(await eventRoleWithQuery(queryFn, helper, 'event-id'), 'Admin')
})
