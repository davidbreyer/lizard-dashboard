const priorities = ['high', 'normal', 'low'];
const localDateKey = date => [
  date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')
].join('-');

function validTaskDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + 'T00:00:00Z');
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

// Date-only tasks retain their calendar date; timed events use the viewer's timezone.
export function buildUpcoming({ tasks = [], events = [], includeLater = false } = {}, now = new Date()) {
  const startKey = localDateKey(now);
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 7);
  const endKey = localDateKey(end);
  let refreshAt = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime();
  const items = [];
  for (const [index, task] of (Array.isArray(tasks) ? tasks : []).entries()) {
    if (task?.completed || typeof task?.title !== 'string' || !task.title.trim() ||
        !validTaskDate(task.dueDate) || task.dueDate < startKey || (!includeLater && task.dueDate >= endKey)) continue;
    items.push({
      kind: 'task', title: task.title.trim(), dateKey: task.dueDate, index,
      priority: priorities.includes(task.priority) ? task.priority : 'normal'
    });
  }
  for (const [index, event] of (Array.isArray(events) ? events : []).entries()) {
    if (typeof event?.id !== 'string' || typeof event.name !== 'string' || !event.name.trim() ||
        typeof event.target !== 'string') continue;
    const timestamp = Date.parse(event.target);
    if (!Number.isFinite(timestamp) || timestamp <= now.getTime() || (!includeLater && timestamp >= end.getTime())) continue;
    const dateKey = localDateKey(new Date(timestamp));
    if (dateKey < startKey) continue;
    refreshAt = Math.min(refreshAt, timestamp);
    items.push({ kind: 'event', title: event.name.trim(), dateKey, timestamp, index });
  }
  items.sort((a, b) => a.dateKey.localeCompare(b.dateKey) ||
    (a.kind !== b.kind ? (a.kind === 'task' ? -1 : 1) :
      a.kind === 'task' ? priorities.indexOf(a.priority) - priorities.indexOf(b.priority) : a.timestamp - b.timestamp) ||
    a.title.localeCompare(b.title) || a.index - b.index);
  return { items, startKey, endKey, refreshAt };
}
