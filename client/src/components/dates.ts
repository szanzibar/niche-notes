// A checkbox line's date is wall-clock time, "2026-11-14" or "2026-11-14T15:30", so it reads the same in every
// time zone and each device alerts at its own 9:00 or 15:30.

export type Repeat = 'daily' | 'weekdays' | 'weekly' | 'monthly' | 'yearly'

export const REPEATS: [Repeat, string][] = [
  ['daily', 'Daily'],
  ['weekdays', 'Weekdays'],
  ['weekly', 'Weekly'],
  ['monthly', 'Monthly'],
  ['yearly', 'Yearly'],
]

const pad = (n: number) => String(n).padStart(2, '0')
export const dayOf = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
const parse = (day: string) => {
  const [y, m, d] = day.split('-').map(Number)
  return new Date(y, m - 1, d)
}

// Today plus `days`, as a day.
export function inDays(days: number) {
  const date = new Date()
  date.setDate(date.getDate() + days)
  return dayOf(date)
}

function step(date: Date, repeat: Repeat) {
  const next = new Date(date)
  if (repeat === 'daily') next.setDate(next.getDate() + 1)
  else if (repeat === 'weekly') next.setDate(next.getDate() + 7)
  else if (repeat === 'weekdays') {
    do next.setDate(next.getDate() + 1)
    while (next.getDay() === 0 || next.getDay() === 6)
  } else {
    // The 31st moves to a shorter month's last day and stays there after. Known and accepted.
    next.setDate(1)
    next.setMonth(next.getMonth() + (repeat === 'monthly' ? 1 : 12))
    next.setDate(Math.min(date.getDate(), new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate()))
  }
  return next
}

// The first date after today, so a line ticked late lands on its next coming day and one ticked early skips one.
export function nextDue(due: string, repeat: Repeat) {
  const [day, time] = due.split('T')
  const today = parse(dayOf(new Date()))
  let date = step(parse(day), repeat)
  while (date <= today) date = step(date, repeat)
  return time ? `${dayOf(date)}T${time}` : dayOf(date)
}

export function overdue(due: string) {
  const [day, time] = due.split('T')
  return time ? new Date(due) < new Date() : day < dayOf(new Date())
}

// Near days by name, the coming week by weekday, the rest by date.
export function dueLabel(due: string) {
  const [day, time] = due.split('T')
  const date = parse(day)
  const now = new Date()
  const days = Math.round((date.getTime() - parse(dayOf(now)).getTime()) / 86_400_000)
  const label =
    days === 0
      ? 'Today'
      : days === 1
        ? 'Tomorrow'
        : days === -1
          ? 'Yesterday'
          : days > 1 && days < 7
            ? date.toLocaleDateString(undefined, { weekday: 'short' })
            : date.toLocaleDateString(undefined, {
                month: 'short',
                day: 'numeric',
                year: date.getFullYear() === now.getFullYear() ? undefined : 'numeric',
              })
  if (!time) return label
  const [h, m] = time.split(':').map(Number)
  return `${label} ${new Date(2000, 0, 1, h, m).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`
}
