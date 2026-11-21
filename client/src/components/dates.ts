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
export function inDays(days: number, today = new Date()) {
  const date = new Date(today)
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
  const from = new Date(now < start ? now : start)
  from.setDate(from.getDate() - 1)
  return withTime(after(parseRule(repeat)!, start, from), due)
}

// A date in the words of a line, the way Todoist reads one: "today", "friday at 5pm", "nov 20", "every other monday",
// "every day at 9:00". `from` and `to` are where the words sit in the text. English, with weekdays spelled out,
// since "sun" and "sat" are words of their own.
export interface Typed {
  from: number
  to: number
  day?: string
  time?: string
  rule?: Rule
}

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
const WEEKDAY = WEEKDAYS.join('|')
const MONTH =
  'jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?'
const NEAR: Record<string, number> = { today: 0, tomorrow: 1, 'next week': 7 }
const EACH: Record<string, string> = { daily: 'day', weekly: 'week', monthly: 'month', yearly: 'year' }
const NTH = ['first', 'second', 'third', 'fourth', 'last']
const HOUR = '(?:[01]?\\d|2[0-3])'
const CLOCK = `(?:at )?(?:${HOUR}:[0-5]\\d(?: ?[ap]m)?|${HOUR} ?[ap]m)`
const HEAD = [
  '(?<near>today|tomorrow|next week)',
  `(?:next )?(?<weekday>${WEEKDAY})`,
  `(?<month>${MONTH}) (?<date>\\d{1,2})(?:st|nd|rd|th)?`,
  `(?<date2>\\d{1,2})(?:st|nd|rd|th)? (?<month2>${MONTH})`,
  `(?:every (?:(?<apart>other|\\d{1,2}) )?(?<each>day|weekday|weeks?|months?|years?|(?:${WEEKDAY})(?:(?:,| and|, and) (?:${WEEKDAY}))*)|(?<ly>daily|weekly|monthly|yearly))` +
    `(?: on the (?<nth>${NTH.join('|')}|\\d{1,2}(?:st|nd|rd|th)?)(?: (?<nthday>${WEEKDAY}))?)?`,
].join('|')
// "at 5" is as likely a count as a time, so a bare hour only counts after a day. "today's" and "Monday:" are
// not dates.
const TYPED = new RegExp(`(?<![\\w'’-])(?:(?:${HEAD})(?: (?<then>${CLOCK}|at ${HOUR}))?|(?<alone>${CLOCK}))(?![\\w'’:-])`, 'gi')

export function typedDates(text: string, now = new Date()): Typed[] {
  const found: Typed[] = []
  for (const match of text.matchAll(TYPED)) {
    const g = Object.fromEntries(Object.entries(match.groups!).map(([name, value]) => [name, value?.toLowerCase()]))
    const typed: Typed = { from: match.index, to: match.index + match[0].length }

    if (g.near) typed.day = inDays(NEAR[g.near], now)
    // The coming one, a week on when it is today.
    if (g.weekday) typed.day = inDays(((WEEKDAYS.indexOf(g.weekday) - now.getDay() + 6) % 7) + 1, now)
    const month = g.month ?? g.month2
    if (month) {
      const at = (year: number) => new Date(year, MONTHS.indexOf(month.slice(0, 3)), Number(g.date ?? g.date2))
      const date = dayOf(at(now.getFullYear())) < dayOf(now) ? at(now.getFullYear() + 1) : at(now.getFullYear())
      // The 30th of February rolls into March.
      if (MONTHS[date.getMonth()] !== month.slice(0, 3)) continue
      typed.day = dayOf(date)
    }

    const each = g.each ?? EACH[g.ly ?? '']
    if (each) {
      const interval = g.apart === 'other' ? 2 : Number(g.apart ?? 1)
      // A rule has no every other day.
      if (interval < 1 || (each === 'day' && interval > 1)) continue
      const named = WEEK.filter((day) => each.includes(WEEKDAYS[DAYS.indexOf(day)]))
      typed.rule = {
        freq: each.startsWith('month') ? 'MONTHLY' : each.startsWith('year') ? 'YEARLY' : 'WEEKLY',
        interval,
        days: each === 'day' ? WEEK : each === 'weekday' ? WEEK.slice(0, 5) : named,
        weeks: [],
        monthDay: null,
      }
      // "On the first" is a day of the month, "on the first monday" a week of it, as the date box writes them.
      if (g.nth) {
        const n = NTH.includes(g.nth) ? (g.nth === 'last' ? -1 : NTH.indexOf(g.nth) + 1) : parseInt(g.nth)
        const weekday = g.nthday && DAYS[WEEKDAYS.indexOf(g.nthday)]
        if (typed.rule.freq !== 'MONTHLY' || (weekday ? n > 4 : n < 1 || n > 31)) continue
        if (weekday) Object.assign(typed.rule, { days: [weekday], weeks: [n] })
        else typed.rule.monthDay = n
      }
    }

    const clock = /(\d{1,2})(?::(\d\d))?(?: ?([ap])m)?$/.exec(g.then ?? g.alone ?? '')
    if (clock) {
      const hour = clock[3] ? (Number(clock[1]) % 12) + (clock[3] === 'p' ? 12 : 0) : Number(clock[1])
      typed.time = `${pad(hour)}:${clock[2] ?? '00'}`
    }
    found.push(typed)
  }
  return found
}

// The line's date once the words are read into it. What they leave unsaid stays as the line had it: "at 9" keeps
// the day, and "friday" keeps the time and the repeat.
export function withTyped(line: { due?: string | null; repeat?: string | null }, typed: Typed, now = new Date()) {
  const [lineDay, lineTime] = line.due?.split('T') ?? []
  const time = typed.time ?? lineTime
  const at = (day: string) => (time ? `${day}T${time}` : day)
  let due = at(typed.day ?? lineDay ?? dayOf(now))
  let repeat = line.repeat ?? null
  if (typed.rule) {
    // "Every week" and "every month" take their day from the line's date, as the date box does.
    const start = parseDay(due.split('T')[0])
    const rule = { ...typed.rule }
    if (rule.freq === 'WEEKLY' && !rule.days.length) rule.days = [DAYS[start.getDay()]]
    if (rule.freq === 'MONTHLY' && !rule.weeks.length) rule.monthDay ??= start.getDate()
    repeat = formatRule(rule)
    // Every other week counts from the first of its days, not from this week.
    due = onRule(due, formatRule({ ...rule, interval: 1 }), now)
  }
  // With no day said, a time that has gone by today means the next one.
  if (!typed.day && !lineDay && time && new Date(due) < now) due = repeat ? nextDue(due, repeat, now) : at(inDays(1, now))
  return { due, repeat }
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
