import type { Editor } from '@tiptap/react'
import { BubbleMenu, type BubbleMenuProps } from '@tiptap/react/menus'
import { useEffect, useLayoutEffect, useReducer, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { enableAlerts } from '../lib/alerts'
import { ALT, MOD, SHIFT } from '../lib/keys'
import { notePath } from '../lib/links'
import type { User } from '../lib/types'
import { settings } from '../sync/tree'
import { DAYS, type Day, describeRule, formatRule, inDays, onRule, parseDay, parseRule, type Rule, ruleOn, WEEK } from './dates'
import {
  AddColumnIcon,
  AddRowIcon,
  BoldIcon,
  BulletListIcon,
  CalendarIcon,
  CheckIcon,
  CodeBlockIcon,
  ChecklistIcon,
  CodeIcon,
  DeleteColumnIcon,
  DeleteRowIcon,
  DeleteTableIcon,
  DividerIcon,
  HeadingIcon,
  HighlightIcon,
  IndentIcon,
  ItalicIcon,
  LinkIcon,
  NumberedListIcon,
  OpenLinkIcon,
  OutdentIcon,
  PersonIcon,
  QuoteIcon,
  RedoIcon,
  StrikeIcon,
  TableIcon,
  TrashIcon,
  UndoIcon,
  UnlinkIcon,
} from './icons'
import { assign, listPosition, pickSuggestion, suggestions, toggleList, typedPerson } from './lists'
import { Popover } from './Popover'
import { ScrollRow } from './ScrollRow'

const HINTS: [string[], string][] = [
  [[`${MOD}Z`, `${MOD}${SHIFT}Z`], 'Undo, Redo'],
  [[`${MOD}B`, `${MOD}I`], 'Bold, Italic'],
  [[`${MOD}F`], 'Find in note'],
  [[`${MOD}Enter`], 'Tick the task'],
  [[`${ALT}${SHIFT}↑`, `${ALT}${SHIFT}↓`], 'Move a line'],
  [[`${MOD}${SHIFT}[`, `${MOD}${SHIFT}]`], 'Collapse, Expand'],
  [['Tab', `${SHIFT}Tab`], 'Indent, Outdent'],
]
const ICON = 'h-5 w-5'
// How long a timed line lasts in the calendar. Half an hour unless set.
const DURATIONS = [
  ['15m', '15 minutes', 15],
  ['30m', '30 minutes', 30],
  ['1h', '1 hour', 60],
  ['2h', '2 hours', 120],
  ['3h', '3 hours', 180],
] as const
const FIELD = 'h-9 min-w-0 border-2 border-border bg-bg px-2 outline-none focus:border-accent-ink'
// Each change to these sends the menu a transaction, and the bar redraws on every transaction, so they are made once.
// The box sits under the link, or over it when the keyboard leaves no room below.
const LINK_BOX = { placement: 'bottom-start', offset: 6, shift: { padding: 8 } } as const
const inLink: BubbleMenuProps['shouldShow'] = ({ editor, view }) => view.hasFocus() && editor.isActive('link')
const typingPerson: BubbleMenuProps['shouldShow'] = ({ view, state }) => view.hasFocus() && Boolean(typedPerson.getState(state)?.at)
const suggesting: BubbleMenuProps['shouldShow'] = ({ view, state }) =>
  view.hasFocus() && Boolean(suggestions.getState(state)?.matches.length)

// `people` are who a task on the note can be assigned to.
export function Toolbar({ editor, people }: { editor: Editor | null; people: User[] }) {
  const [, force] = useReducer((x: number) => x + 1, 0)
  // One box opens above the bar at a time: text styles, the address of a link, a checkbox line's date or its person.
  const [row, setRow] = useState<'styles' | 'link' | 'due' | 'person' | null>(null)
  const [href, setHref] = useState('')
  // Daily is Weekly on all seven days, so the date box remembers which was tapped until it closes.
  const [weekly, setWeekly] = useState(false)
  useEffect(() => setWeekly(false), [row])
  const navigate = useNavigate()
  useEffect(() => {
    if (!editor) return
    // A tap on a line's date or person opens its box too.
    const due = () => setRow('due')
    const person = () => setRow('person')
    // Lines slide and fold for a moment after an edit, so the boxes under the cursor measure again once they stop. A
    // line folding away ends hidden, which cancels its transition rather than ending it.
    const settled = (e: TransitionEvent) =>
      e.propertyName === 'height' &&
      !editor.isDestroyed &&
      editor.view.dispatch(
        editor.state.tr
          .setMeta('linkBox', 'updatePosition')
          .setMeta('personBox', 'updatePosition')
          .setMeta('suggestionBox', 'updatePosition'),
      )
    const dom = editor.view.dom
    editor.on('transaction', force)
    dom.addEventListener('due-date', due)
    dom.addEventListener('assign', person)
    dom.addEventListener('transitionend', settled)
    dom.addEventListener('transitioncancel', settled)
    return () => {
      editor.off('transaction', force)
      dom.removeEventListener('due-date', due)
      dom.removeEventListener('assign', person)
      dom.removeEventListener('transitionend', settled)
      dom.removeEventListener('transitioncancel', settled)
    }
  }, [editor])
  // Moving into a table brings its tools into view on a narrow bar.
  const inTable = editor?.isActive('table') ?? false
  const tableTools = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (inTable) tableTools.current?.scrollIntoView({ inline: 'nearest', block: 'nearest', behavior: 'smooth' })
  }, [inTable])
  const link = editor?.getAttributes('link').href as string | undefined
  // The box places itself before its address is drawn in it, so it measures again once it is.
  useLayoutEffect(() => {
    if (link) editor!.view.dispatch(editor!.state.tr.setMeta('linkBox', 'updatePosition'))
  }, [editor, link])
  if (!editor) return null

  const { item, list, depth } = listPosition(editor)
  const listItem = item ?? 'listItem'
  const chain = () => editor.chain().focus()
  // The link box's input and the date box's fields hold focus, and TipTap only takes it back on the next frame, so
  // the editor takes it before the box goes.
  const close = () => {
    editor.view.focus()
    setRow(null)
  }
  const style = (apply: () => void) => {
    close()
    apply()
  }
  const openLink = (open: boolean) => {
    if (!open) return close()
    setHref(link ?? '')
    setRow('link')
  }
  // Dates belong to checkbox lines. Each change applies at once and the box stays open, so a time or a repeat
  // can follow a date. Only Remove closes it.
  const linePos = item === 'taskItem' ? editor.state.selection.$from.before(depth) : null
  const line = linePos == null ? null : editor.state.doc.nodeAt(linePos)
  const due = line?.attrs.due as string | null | undefined
  const [day = '', time = ''] = due?.split('T') ?? []
  const rule = parseRule(line?.attrs.repeat)
  const setLine = (attrs: Record<string, unknown>) =>
    editor
      .chain()
      .command(({ tr }) => {
        tr.setNodeMarkup(linePos!, undefined, { ...line!.attrs, ...attrs })
        return true
      })
      .run()
  const setDue = (next: string | null, repeat = next && ruleOn(line?.attrs.repeat, next)) => {
    // A line that gets a time lasts as long as the last length this person picked.
    const picked = !time && next?.includes('T') ? settings().get('duration') : null
    setLine({ due: next, repeat: next ? repeat : null, duration: next ? (line!.attrs.duration ?? picked ?? null) : null })
    if (next) void enableAlerts()
  }
  const pick = (next: string) => setDue(time ? `${next}T${time}` : next)
  // A new rule moves the date to the rule's first day.
  const setRule = (next: Rule | null) => {
    if (!next) return due && setDue(due, null)
    const repeat = formatRule(next)
    setDue(onRule(due ?? inDays(0), repeat), repeat)
  }
  const start = parseDay(day || inDays(0))
  const weekday = DAYS[start.getDay()]
  const everyDay = rule?.freq === 'WEEKLY' && rule.interval === 1 && rule.days.length === 7
  const daily = everyDay && !weekly
  const assignee = people.find((u) => u.id === line?.attrs.assignee)?.id ?? null
  const typed = typedPerson.getState(editor.state)?.at
  const suggested = suggestions.getState(editor.state)

  const applyLink = () => {
    close()
    const typed = href.trim()
    if (!typed) return
    // A bare address like example.com would otherwise link to a page on this site.
    const url = /^[a-z][a-z\d+.-]*:/i.test(typed) ? typed : `https://${typed}`
    if (!editor.state.selection.empty || editor.isActive('link')) {
      return chain().extendMarkRange('link').setLink({ href: url }).run()
    }
    chain()
      .insertContent({ type: 'text', text: typed, marks: [{ type: 'link', attrs: { href: url } }] })
      .run()
  }

  return (
    <div className="shrink-0 border-t-2 border-border bg-surface">
      <BubbleMenu editor={editor} pluginKey="linkBox" shouldShow={inLink} options={LINK_BOX} className="z-10 w-max">
        <a
          href={link}
          target="_blank"
          rel="noopener noreferrer"
          title="Open link"
          // A link to one of our notes opens it in place, over the list like any note.
          onClick={(e) => {
            const note = notePath(link!)
            if (!note) return
            e.preventDefault()
            navigate(note, { replace: true })
          }}
          className="flex h-9 max-w-[min(24rem,calc(100vw-2rem))] items-center gap-2 border-2 border-border bg-surface px-2 font-bold"
        >
          <OpenLinkIcon className={`${ICON} shrink-0`} />
          <span className="truncate">{link?.replace(/^https?:\/\//, '')}</span>
        </a>
      </BubbleMenu>
      <BubbleMenu editor={editor} pluginKey="personBox" shouldShow={typingPerson} options={LINK_BOX} className="z-10 w-max">
        <div className="flex border-2 border-border bg-surface p-1">
          {typed?.matches.map((user, i) => (
            <Tool
              key={user.id}
              label={user.name.split(' ')[0]}
              active={i === 0}
              onClick={() => assign(editor.view, typed.line, user.id, typed)}
            >
              {user.name.split(' ')[0]}
            </Tool>
          ))}
        </div>
      </BubbleMenu>
      <BubbleMenu editor={editor} pluginKey="suggestionBox" shouldShow={suggesting} options={LINK_BOX} className="z-10 w-max">
        <div
          role="group"
          aria-label="Suggestions"
          className="flex max-w-[min(24rem,calc(100vw-2rem))] flex-col border-2 border-border bg-surface p-1 [&>button]:justify-start"
        >
          {suggested?.matches.map((text, i) => (
            <Tool key={text} label={text} active={i === suggested.chosen} onClick={() => pickSuggestion(editor.view, text)}>
              <span className="truncate">{text}</span>
            </Tool>
          ))}
        </div>
      </BubbleMenu>
      <div className="relative m-2">
        <div aria-hidden="true" className="key-box absolute bottom-full right-0 mb-3 flex-col gap-1 border-2 border-border bg-surface p-1 font-bold">
          {HINTS.map(([keys, action]) => (
            <div key={action} className="flex items-center gap-2">
              {keys.map((k) => (
                <kbd key={k} className="key-chip">{k}</kbd>
              ))}
              <span>{action}</span>
            </div>
          ))}
        </div>
        <ScrollRow name="tools" className="gap-2 [&>*+*]:border-l-2 [&>*+*]:border-border [&>*+*]:pl-2">
          <Group>
            <Tool
              label="Task list"
              disabled={inTable}
              active={list === 'taskList'}
              onClick={() => toggleList(editor, 'taskList')}
            >
              <ChecklistIcon className={ICON} />
            </Tool>
            <Tool
              label="Bullet list"
              disabled={inTable}
              active={list === 'bulletList'}
              onClick={() => toggleList(editor, 'bulletList')}
            >
              <BulletListIcon className={ICON} />
            </Tool>
            <Tool
              label="Numbered list"
              disabled={inTable}
              active={list === 'orderedList'}
              onClick={() => toggleList(editor, 'orderedList')}
            >
              <NumberedListIcon className={ICON} />
            </Tool>
          </Group>
          <Group>
            <Popover
              side="top"
              open={row === 'due'}
              onOpenChange={(open) => (open ? setRow('due') : close())}
              className="w-[min(calc(100vw-1rem),22rem)]"
              trigger={
                <Tool label="Date" disabled={!line} active={row === 'due' || Boolean(due)}>
                  <CalendarIcon className={ICON} />
                </Tool>
              }
            >
              <div className="flex min-w-0 flex-1 flex-col gap-2 p-1">
                <Group className="[&>*]:flex-1">
                  {(
                    [
                      ['Today', 0],
                      ['Tomorrow', 1],
                      ['Next week', 7],
                    ] as const
                  ).map(([label, days]) => (
                    <Tool key={label} label={label} active={day === inDays(days)} onClick={() => pick(inDays(days))}>
                      {label}
                    </Tool>
                  ))}
                </Group>
                {/* An empty field holds the value it shows in grey, so a change to one part of it saves the whole. */}
                <div className="flex gap-1">
                  <label className={`${FIELD} flex flex-1 items-center gap-1 focus-within:border-accent-ink`}>
                    {day && <span className="shrink-0">{start.toLocaleDateString(undefined, { weekday: 'short' })}</span>}
                    <input
                      type="date"
                      aria-label="Day"
                      value={day || inDays(0)}
                      onChange={(e) => setDue(e.target.value ? (time ? `${e.target.value}T${time}` : e.target.value) : null)}
                      className={`min-w-0 flex-1 bg-transparent outline-none ${day ? '' : 'text-ink-muted'}`}
                    />
                  </label>
                  <input
                    type="time"
                    aria-label="Time"
                    value={time || '12:30'}
                    onChange={(e) => setDue(e.target.value ? `${day || inDays(0)}T${e.target.value}` : day || null)}
                    className={`${FIELD} w-28 ${time ? '' : 'text-ink-muted'}`}
                  />
                </div>
                {time && (
                  <Group className="[&>*]:flex-1">
                    {DURATIONS.map(([text, label, minutes]) => (
                      <Tool
                        key={minutes}
                        label={label}
                        active={(line!.attrs.duration ?? 30) === minutes}
                        onClick={() => {
                          setLine({ duration: minutes })
                          settings().set('duration', minutes)
                        }}
                      >
                        {text}
                      </Tool>
                    ))}
                  </Group>
                )}
                <Group className="[&>*]:flex-1">
                  {(
                    [
                      ['Once', null],
                      ['Daily', { freq: 'WEEKLY', interval: 1, days: WEEK, weeks: [], monthDay: null }],
                      ['Weekly', { freq: 'WEEKLY', interval: 1, days: [weekday], weeks: [], monthDay: null }],
                      ['Monthly', { freq: 'MONTHLY', interval: 1, days: [], weeks: [], monthDay: start.getDate() }],
                      ['Yearly', { freq: 'YEARLY', interval: 1, days: [], weeks: [], monthDay: null }],
                    ] satisfies [string, Rule | null][]
                  ).map(([label, fresh]) => {
                    const active = label === 'Daily' ? daily : !daily && (rule?.freq ?? null) === (fresh?.freq ?? null)
                    return (
                      <Tool
                        key={label}
                        label={label}
                        active={active}
                        onClick={() => {
                          if (active) return
                          setWeekly(label === 'Weekly')
                          // Weekly from Daily starts with all seven days, for the person to untick some.
                          if (!everyDay || fresh?.freq !== 'WEEKLY') setRule(fresh)
                        }}
                      >
                        {label}
                      </Tool>
                    )
                  })}
                </Group>
                {rule?.freq === 'MONTHLY' && (
                  <Group className="[&>*]:flex-1">
                    <Tool
                      label={`On the ${start.getDate()}`}
                      active={!rule.weeks.length}
                      onClick={() => setRule({ ...rule, weeks: [], days: [], monthDay: start.getDate() })}
                    >
                      {start.getDate()}
                    </Tool>
                    {[1, 2, 3, 4, -1].map((week) => (
                      <Tool
                        key={week}
                        label={week < 0 ? 'Last' : ['1st', '2nd', '3rd', '4th'][week - 1]}
                        active={rule.weeks.includes(week)}
                        onClick={() => {
                          const weeks = rule.weeks.includes(week) ? rule.weeks.filter((w) => w !== week) : [...rule.weeks, week]
                          setRule(
                            weeks.length
                              ? { ...rule, weeks, days: rule.days.length ? rule.days : [weekday], monthDay: null }
                              : { ...rule, weeks, days: [], monthDay: start.getDate() },
                          )
                        }}
                      >
                        {week < 0 ? 'Last' : ['1st', '2nd', '3rd', '4th'][week - 1]}
                      </Tool>
                    ))}
                  </Group>
                )}
                {((rule?.freq === 'WEEKLY' && !daily) || (rule?.freq === 'MONTHLY' && rule.weeks.length > 0)) && (
                  <Group className="[&>*]:flex-1">
                    {WEEK.map((d: Day) => (
                      <Tool
                        key={d}
                        label={new Date(2026, 10, 1 + DAYS.indexOf(d)).toLocaleDateString('en', { weekday: 'long' })}
                        active={rule.days.includes(d)}
                        // A rule keeps at least one day.
                        onClick={() =>
                          (rule.days.length > 1 || !rule.days.includes(d)) &&
                          setRule({ ...rule, days: WEEK.filter((x) => (x === d) !== rule.days.includes(x)) })
                        }
                      >
                        {'SMTWTFS'[DAYS.indexOf(d)]}
                      </Tool>
                    ))}
                  </Group>
                )}
                {rule && (
                  <div className="flex items-center gap-2">
                    {!daily && (
                      <Group>
                        <Tool
                          label="Repeat more often"
                          disabled={rule.interval === 1}
                          onClick={() => setRule({ ...rule, interval: rule.interval - 1 })}
                        >
                          <span className="text-xl leading-none">−</span>
                        </Tool>
                        <Tool label="Repeat less often" onClick={() => setRule({ ...rule, interval: rule.interval + 1 })}>
                          <span className="text-xl leading-none">+</span>
                        </Tool>
                      </Group>
                    )}
                    <span className="min-w-0 flex-1 text-sm font-bold">{describeRule(rule, start)}</span>
                  </div>
                )}
                {due && (
                  <Tool
                    label="Remove date"
                    onClick={() => {
                      setRow(null)
                      setDue(null)
                    }}
                  >
                    <TrashIcon className={ICON} />
                    <span className="ml-1">Remove date</span>
                  </Tool>
                )}
              </div>
            </Popover>
            {people.length > 1 && (
              <Popover
                side="top"
                open={row === 'person'}
                onOpenChange={(open) => setRow(open ? 'person' : null)}
                trigger={
                  <Tool label="Assign" disabled={!line} active={row === 'person' || assignee != null}>
                    <PersonIcon className={ICON} />
                  </Tool>
                }
              >
                {[null, ...people].map((user) => (
                  <Tool
                    key={user?.id ?? ''}
                    label={user ? user.name.split(' ')[0] : 'Nobody'}
                    active={assignee === (user?.id ?? null)}
                    onClick={() => {
                      setRow(null)
                      assign(editor.view, linePos!, user?.id ?? null)
                    }}
                  >
                    {user ? user.name.split(' ')[0] : 'Nobody'}
                  </Tool>
                ))}
              </Popover>
            )}
          </Group>
          <Group>
            <Tool label="Outdent" disabled={inTable} onClick={() => chain().liftListItem(listItem).run()}>
              <OutdentIcon className={ICON} />
            </Tool>
            <Tool label="Indent" disabled={inTable} onClick={() => chain().sinkListItem(listItem).run()}>
              <IndentIcon className={ICON} />
            </Tool>
          </Group>
          <Group>
            <Tool label="Undo" onClick={() => chain().undo().run()}>
              <UndoIcon className={ICON} />
            </Tool>
            <Tool label="Redo" onClick={() => chain().redo().run()}>
              <RedoIcon className={ICON} />
            </Tool>
          </Group>
          <Group>
            <Popover
              side="top"
              open={row === 'styles'}
              onOpenChange={(open) => setRow(open ? 'styles' : null)}
              trigger={
                <Tool label="Text style" disabled={inTable} active={row === 'styles' || editor.isActive('heading')}>
                  <HeadingIcon className={ICON} />
                </Tool>
              }
            >
              <Tool label="Text" active={editor.isActive('paragraph')} onClick={() => style(() => chain().setParagraph().run())}>
                Text
              </Tool>
              {([1, 2, 3] as const).map((level) => (
                <Tool
                  key={level}
                  label={`Heading ${level}`}
                  active={editor.isActive('heading', { level })}
                  onClick={() => style(() => chain().setHeading({ level }).run())}
                >
                  H{level}
                </Tool>
              ))}
            </Popover>
            <Tool label="Quote" disabled={inTable} active={editor.isActive('blockquote')} onClick={() => chain().toggleBlockquote().run()}>
              <QuoteIcon className={ICON} />
            </Tool>
            <Tool label="Code block" disabled={inTable} active={editor.isActive('codeBlock')} onClick={() => chain().toggleCodeBlock().run()}>
              <CodeBlockIcon className={ICON} />
            </Tool>
            <Tool label="Divider" disabled={inTable} onClick={() => chain().setHorizontalRule().run()}>
              <DividerIcon className={ICON} />
            </Tool>
            <Tool
              label="Table"
              disabled={inTable}
              onClick={() => chain().insertTable({ rows: 2, cols: 3, withHeaderRow: true }).run()}
            >
              <TableIcon className={ICON} />
            </Tool>
          </Group>
          {inTable && (
            <Group ref={tableTools}>
              <Tool label="Add row" onClick={() => chain().addRowAfter().run()}>
                <AddRowIcon className={ICON} />
              </Tool>
              <Tool label="Add column" onClick={() => chain().addColumnAfter().run()}>
                <AddColumnIcon className={ICON} />
              </Tool>
              <Tool label="Delete row" onClick={() => chain().deleteRow().run()}>
                <DeleteRowIcon className={ICON} />
              </Tool>
              <Tool label="Delete column" onClick={() => chain().deleteColumn().run()}>
                <DeleteColumnIcon className={ICON} />
              </Tool>
              <Tool label="Delete table" onClick={() => chain().deleteTable().run()}>
                <DeleteTableIcon className={ICON} />
              </Tool>
            </Group>
          )}
          <Group>
            <Tool label="Bold" active={editor.isActive('bold')} onClick={() => chain().toggleBold().run()}>
              <BoldIcon className={ICON} />
            </Tool>
            <Tool label="Italic" active={editor.isActive('italic')} onClick={() => chain().toggleItalic().run()}>
              <ItalicIcon className={ICON} />
            </Tool>
            <Tool label="Strikethrough" active={editor.isActive('strike')} onClick={() => chain().toggleStrike().run()}>
              <StrikeIcon className={ICON} />
            </Tool>
            <Tool label="Code" active={editor.isActive('code')} onClick={() => chain().toggleCode().run()}>
              <CodeIcon className={ICON} />
            </Tool>
            <Popover
              side="top"
              open={row === 'link'}
              onOpenChange={openLink}
              className="w-[min(calc(100vw-1rem),28rem)]"
              trigger={
                <Tool label="Link" active={row === 'link' || editor.isActive('link')}>
                  <LinkIcon className={ICON} />
                </Tool>
              }
            >
              <form
                className="flex min-w-0 flex-1 items-center gap-1"
                onSubmit={(e) => {
                  e.preventDefault()
                  applyLink()
                }}
              >
                <input
                  aria-label="Link address"
                  inputMode="url"
                  placeholder="Paste or type a link"
                  autoFocus
                  value={href}
                  onChange={(e) => setHref(e.target.value)}
                  className="h-9 min-w-0 flex-1 border-2 border-border bg-bg px-2 outline-none focus:border-accent-ink"
                />
                <Tool label="Apply link" onClick={applyLink}>
                  <CheckIcon className={ICON} />
                </Tool>
                {editor.isActive('link') && (
                  <Tool
                    label="Remove link"
                    onClick={() => style(() => chain().extendMarkRange('link').unsetLink().run())}
                  >
                    <UnlinkIcon className={ICON} />
                  </Tool>
                )}
              </form>
            </Popover>
            <Tool label="Highlight" active={editor.isActive('highlight')} onClick={() => chain().toggleHighlight().run()}>
              <HighlightIcon className={ICON} />
            </Tool>
          </Group>
        </ScrollRow>
      </div>
    </div>
  )
}

function Group({
  className = '',
  children,
  ref,
}: {
  className?: string
  children: React.ReactNode
  ref?: React.Ref<HTMLDivElement>
}) {
  return <div ref={ref} className={`flex shrink-0 ${className}`}>{children}</div>
}

function Tool({ label, active, ...props }: React.ComponentProps<'button'> & { label: string; active?: boolean }) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      title={label}
      // Keep the editor focused and the keyboard open while tapping the bar.
      onMouseDown={(e) => e.preventDefault()}
      className={`flex h-9 min-w-9 shrink-0 items-center justify-center px-1.5 text-sm font-bold disabled:text-ink-muted ${active ? 'bg-accent text-on-accent' : 'bg-surface'}`}
      {...props}
    />
  )
}
