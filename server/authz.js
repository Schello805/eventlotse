export async function canReadEventWithQuery(queryFn, user, eventId) {
  if (user.role === 'Admin') return true
  const result = await queryFn('SELECT 1 FROM event_members WHERE event_id = $1 AND user_id = $2', [eventId, user.id])
  return Boolean(result.rowCount)
}

export async function canWriteEventWithQuery(queryFn, user, eventId) {
  if (user.role === 'Admin') return true
  const result = await queryFn(
    `SELECT 1 FROM event_members
     WHERE event_id = $1 AND user_id = $2 AND role IN ('Admin', 'Helfer')`,
    [eventId, user.id],
  )
  return Boolean(result.rowCount)
}

export async function eventRoleWithQuery(queryFn, user, eventId) {
  if (user.role === 'Admin') return 'Admin'
  const result = await queryFn('SELECT role FROM event_members WHERE event_id = $1 AND user_id = $2', [eventId, user.id])
  return result.rows[0]?.role || null
}
