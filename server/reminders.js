export function dueTasksForEvent(event, today, leadDays = 0) {
  const todayDate = new Date(`${today}T12:00:00Z`)
  const latestDate = new Date(todayDate)
  latestDate.setUTCDate(latestDate.getUTCDate() + Number(leadDays || 0))
  const latest = latestDate.toISOString().slice(0, 10)

  return (event.actions || [])
    .flatMap((action) => (action.tasks || []).map((task) => ({ ...task, actionTitle: action.title })))
    .filter((task) => task.status !== 'done' && task.due && task.due >= today && task.due <= latest)
}
