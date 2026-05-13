function arraysEqual(left = [], right = []) {
  if (left.length !== right.length) return false
  return left.every((value, index) => value === right[index])
}

function jsonEqual(left, right) {
  return JSON.stringify(left ?? null) === JSON.stringify(right ?? null)
}

function ownedBy(action = {}, userId = '') {
  return (action.owners || []).includes(userId)
}

function taskOwnedBy(task = {}, userId = '') {
  return (task.ownerIds || []).includes(userId)
}

function helperMayChangeAction(before = {}, after = {}, userId = '') {
  if (ownedBy(before, userId) || ownedBy(after, userId)) return true

  const beforeTasks = new Map((before.tasks || []).map((task) => [task.id, task]))
  const afterTasks = new Map((after.tasks || []).map((task) => [task.id, task]))

  for (const [taskId, nextTask] of afterTasks.entries()) {
    const currentTask = beforeTasks.get(taskId)
    if (!currentTask) return false
    if (!jsonEqual(currentTask, nextTask) && !taskOwnedBy(currentTask, userId) && !taskOwnedBy(nextTask, userId)) return false
  }

  for (const taskId of beforeTasks.keys()) {
    if (!afterTasks.has(taskId)) return false
  }

  return ['id', 'title', 'category', 'owners', 'deadline', 'notes'].every((key) => jsonEqual(before[key], after[key]))
}

export function canHelperUpdateEvent(current = {}, next = {}, userId = '') {
  const immutableKeys = ['id', 'name', 'motto', 'targetGroup', 'guests', 'date', 'location', 'mapUrl', 'contact', 'photoUrl', 'archived', 'members', 'budget', 'infrastructure', 'runsheet', 'actNotes', 'wiki']
  for (const key of immutableKeys) {
    if (!jsonEqual(current[key], next[key])) return false
  }

  const beforeActions = current.actions || []
  const afterActions = next.actions || []
  if (!arraysEqual(beforeActions.map((action) => action.id), afterActions.map((action) => action.id))) return false

  return afterActions.every((afterAction) => {
    const beforeAction = beforeActions.find((action) => action.id === afterAction.id)
    return beforeAction && helperMayChangeAction(beforeAction, afterAction, userId)
  })
}

export function userEditableActionIds(event = {}, userId = '', role = 'Helfer') {
  if (role === 'Admin') return (event.actions || []).map((action) => action.id)
  return (event.actions || [])
    .filter((action) => ownedBy(action, userId) || (action.tasks || []).some((task) => taskOwnedBy(task, userId)))
    .map((action) => action.id)
}
