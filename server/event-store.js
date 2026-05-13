export function normalizeEventRows(eventId, event = {}) {
  const actions = []
  const tasks = []
  const infrastructure = []
  const runsheet = []
  const budget = []

  for (const [position, action] of (event.actions || []).entries()) {
    const actionId = action.id || `action-${position}`
    actions.push({
      id: actionId,
      event_id: eventId,
      title: action.title || '',
      category: action.category || '',
      owners: action.owners || [],
      deadline: action.deadline || null,
      notes: action.notes || '',
      position,
    })
    for (const [taskPosition, task] of (action.tasks || []).entries()) {
      tasks.push({
        id: task.id || `${actionId}-task-${taskPosition}`,
        event_id: eventId,
        action_id: actionId,
        title: task.title || '',
        owner_ids: task.ownerIds || [],
        due_date: task.due || null,
        status: task.status || 'todo',
        notes: task.notes || '',
        files: task.files || [],
        comments: task.comments || [],
        position: taskPosition,
      })
    }
  }

  for (const [position, label] of (event.infrastructure || []).entries()) {
    const action = (event.actions || []).find((entry) => entry.title === label && entry.category === 'Infrastruktur')
    infrastructure.push({
      event_id: eventId,
      label,
      owner_ids: action?.owners || [],
      position,
    })
  }

  for (const [position, item] of (event.runsheet || []).entries()) {
    runsheet.push({
      id: item.id || `run-${position}`,
      event_id: eventId,
      time: item.time || '',
      title: item.title || '',
      owner: item.owner || '',
      position,
    })
  }

  for (const [position, line] of (event.budget || []).entries()) {
    budget.push({
      id: line.id || `budget-${position}`,
      event_id: eventId,
      label: line.label || '',
      type: line.type === 'income' ? 'income' : 'expense',
      amount: Number(line.amount || 0),
      position,
    })
  }

  return { actions, tasks, infrastructure, runsheet, budget }
}

export async function syncNormalizedEvent(client, eventId, event = {}) {
  const rows = normalizeEventRows(eventId, event)
  await client.query('DELETE FROM event_tasks WHERE event_id = $1', [eventId])
  await client.query('DELETE FROM event_actions WHERE event_id = $1', [eventId])
  await client.query('DELETE FROM event_infrastructure WHERE event_id = $1', [eventId])
  await client.query('DELETE FROM event_runsheet WHERE event_id = $1', [eventId])
  await client.query('DELETE FROM event_budget WHERE event_id = $1', [eventId])

  for (const action of rows.actions) {
    await client.query(
      `INSERT INTO event_actions (id, event_id, title, category, owners, deadline, notes, position)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [action.id, action.event_id, action.title, action.category, JSON.stringify(action.owners), action.deadline, action.notes, action.position],
    )
  }

  for (const task of rows.tasks) {
    await client.query(
      `INSERT INTO event_tasks (id, event_id, action_id, title, owner_ids, due_date, status, notes, files, comments, position)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        task.id,
        task.event_id,
        task.action_id,
        task.title,
        JSON.stringify(task.owner_ids),
        task.due_date,
        task.status,
        task.notes,
        JSON.stringify(task.files),
        JSON.stringify(task.comments),
        task.position,
      ],
    )
  }

  for (const item of rows.infrastructure) {
    await client.query(
      `INSERT INTO event_infrastructure (event_id, label, owner_ids, position)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (event_id, label) DO UPDATE SET owner_ids = EXCLUDED.owner_ids, position = EXCLUDED.position`,
      [item.event_id, item.label, JSON.stringify(item.owner_ids), item.position],
    )
  }

  for (const item of rows.runsheet) {
    await client.query(
      `INSERT INTO event_runsheet (id, event_id, time, title, owner, position)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [item.id, item.event_id, item.time, item.title, item.owner, item.position],
    )
  }

  for (const line of rows.budget) {
    await client.query(
      `INSERT INTO event_budget (id, event_id, label, type, amount, position)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [line.id, line.event_id, line.label, line.type, line.amount, line.position],
    )
  }

  return rows
}
