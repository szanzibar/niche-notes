// A checkbox line's date is wall-clock time, "2026-11-14" or "2026-11-14T15:30", so it reads the same in every
// time zone and each device alerts at its own 9:00 or 15:30.

// A repeat is the calendar standard's rule (RFC 5545), in the shapes the date box writes: FREQ=WEEKLY;BYDAY=MO,TH,
// FREQ=MONTHLY;BYDAY=1SU,3SU or BYMONTHDAY=15, and FREQ=YEARLY, each with an optional INTERVAL. Google Calendar
// takes it as it is.
export const DAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'] as const
export type Day = (typeof DAYS)[number]
// The week starts on Monday, as it does in Switzerland.
export const WEEK = [...DAYS.slice(1), DAYS[0]]
export interface Rule {
  freq: 'WEEKLY' | 'MONTHLY' | 'YEARLY'
  interval: number
  days: Day[]
  // Which of a month's weekdays: 1 to 4, or -1 for the last. Empty for a monthly rule on a day of the month.
  weeks: number[]
  monthDay: number | null
}

export function parseRule(text: string | null | undefined): Rule | null {
  const parts = Object.fromEntries((text ?? '').split(';').map((part) => part.split('=')))
  if (!['WEEKLY', 'MONTHLY', 'YEARLY'].includes(parts.FREQ)) return null
  const byDay: string[] = parts.BYDAY?.split(',') ?? []
  return {
    freq: parts.FREQ,
    interval: Number(parts.INTERVAL ?? 1),
    days: WEEK.filter((day) => byDay.some((entry) => entry.endsWith(day))),
    weeks: [...new Set(byDay.map((entry) => Number(entry.slice(0, -2))).filter(Boolean))].sort(
      (a, b) => (a < 0 ? 9 : a) - (b < 0 ? 9 : b),
    ),
    monthDay: parts.BYMONTHDAY ? Number(parts.BYMONTHDAY) : null,
  }
}

export function formatRule({ freq, interval, days, weeks, monthDay }: Rule) {
  const byDay = freq === 'WEEKLY' ? days : weeks.flatMap((week) => days.map((day) => `${week}${day}`))
  return [
    `FREQ=${freq}`,
    interval > 1 && `INTERVAL=${interval}`,
    byDay.length && `BYDAY=${byDay.join(',')}`,
    monthDay && `BYMONTHDAY=${monthDay}`,
  ]
    .filter(Boolean)
    .join(';')
}

const pad = (n: number) => String(n).padStart(2, '0')
export const dayOf = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
export const parseDay = (day: string) => {
  const [y, m, d] = day.split('-').map(Number)
  return new Date(y, m - 1, d)
}

// Today plus `days`, as a day.
export function inDays(days: number) {
  const date = new Date()
  date.setDate(date.getDate() + days)
  return dayOf(date)
}

const monday = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate() - ((date.getDay() + 6) % 7))

// Whether `date` is one of the rule's days, counting intervals from `start`. Like a calendar, a monthly rule
// on the 31st skips shorter months. The server's `occurs?` in reminders.ex alerts by the same rules, so a new
// shape needs both.
function occurs(rule: Rule, start: Date, date: Date) {
  const months = (date.getFullYear() - start.getFullYear()) * 12 + date.getMonth() - start.getMonth()
  const weekday = DAYS[date.getDay()]
  if (rule.freq === 'WEEKLY') {
    const weeks = Math.round((monday(date).getTime() - monday(start).getTime()) / (7 * 86_400_000))
    return weeks % rule.interval === 0 && (rule.days.length ? rule.days : [DAYS[start.getDay()]]).includes(weekday)
  }
  if (rule.freq === 'YEARLY') return months % (12 * rule.interval) === 0 && date.getDate() === start.getDate()
  if (months % rule.interval !== 0) return false
  if (!rule.weeks.length) return date.getDate() === (rule.monthDay ?? start.getDate())
  const nth = Math.ceil(date.getDate() / 7)
  const last = date.getDate() + 7 > new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate()
  return rule.days.includes(weekday) && rule.weeks.some((week) => week === nth || (week === -1 && last))
}

// The rule's first day after `from`. Five years without one means the rule never comes round, which the date
// box can't write.
function after(rule: Rule, start: Date, from: Date) {
  const date = new Date(from)
  for (let i = 0; i < 5 * 366; i++) {
    date.setDate(date.getDate() + 1)
    if (occurs(rule, start, date)) return date
  }
  return null
}

const withTime = (date: Date | null, due: string) => {
  const time = due.split('T')[1]
  return date ? `${dayOf(date)}${time ? `T${time}` : ''}` : due
}

// The rule's first day after the line's own that hasn't gone by, so a line ticked late lands on its next coming
// day and one ticked early skips one. Today hasn't gone by while its time is still to come.
export function nextDue(due: string, repeat: string, today = new Date()) {
  const rule = parseRule(repeat)
  const [day, time] = due.split('T')
  const start = parseDay(day)
  const from = parseDay(dayOf(today))
  if (time && today.toTimeString().slice(0, 5) < time) from.setDate(from.getDate() - 1)
  return rule ? withTime(after(rule, start, from > start ? from : start), due) : due
}

// A line given a repeat moves to the rule's first day from today, or from its own date when that is earlier,
// so its date is always one of the rule's days.
export function onRule(due: string, repeat: string, today = new Date()) {
  const start = parseDay(due.split('T')[0])
  const now = parseDay(dayOf(today))
  const from = now < start ? now : start
  from.setDate(from.getDate() - 1)
  return withTime(after(parseRule(repeat)!, start, from), due)
}

const ORDINAL: Record<string, string> = { one: 'st', two: 'nd', few: 'rd', other: 'th' }
const nth = (n: number) => (n < 0 ? 'last' : `${n}${ORDINAL[new Intl.PluralRules('en', { type: 'ordinal' }).select(n)]}`)
const list = (items: string[]) => new Intl.ListFormat('en', { type: 'conjunction' }).format(items)
// November 2026 starts on a Sunday.
const dayName = (day: Day, width: 'long' | 'short') =>
  new Date(2026, 10, 1 + DAYS.indexOf(day)).toLocaleDateString('en', { weekday: width })

export function describeRule(rule: Rule, start: Date) {
  const every = (unit: string) => (rule.interval > 1 ? `Every ${rule.interval} ${unit}s` : `Every ${unit}`)
  const days = rule.days.map((day) => dayName(day, rule.days.length > 1 ? 'short' : 'long'))
  if (rule.freq === 'WEEKLY') {
    if (rule.interval === 1 && rule.days.length === 7) return 'Every day'
    if (rule.interval === 1 && rule.days.join() === 'MO,TU,WE,TH,FR') return 'Every weekday'
    return `${every('week')} on ${list(days)}`
  }
  if (rule.freq === 'YEARLY') return `${every('year')} on ${start.toLocaleDateString('en', { month: 'long', day: 'numeric' })}`
  if (!rule.weeks.length) return `${every('month')} on the ${nth(rule.monthDay ?? start.getDate())}`
  return `${every('month')} on the ${list(rule.weeks.map(nth))} ${list(days)}`
}

export function overdue(due: string) {
  const [day, time] = due.split('T')
  return time ? new Date(due) < new Date() : day < dayOf(new Date())
}

// Near days by name, the coming week by weekday, the rest by date.
export function dueLabel(due: string) {
  const [day, time] = due.split('T')
  const date = parseDay(day)
  const now = new Date()
  const days = Math.round((date.getTime() - parseDay(dayOf(now)).getTime()) / 86_400_000)
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
