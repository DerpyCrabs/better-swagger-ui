import { For, Show, createEffect, createMemo, createSignal, type JSX } from 'solid-js'
import { createStore, reconcile } from 'solid-js/store'
import { createVirtualizer } from '@tanstack/solid-virtual'
import hljs from 'highlight.js/lib/core'
import jsonLang from 'highlight.js/lib/languages/json'
import { Braces, FoldVertical, UnfoldVertical } from '../icons'
import { CopyButton } from './CopyButton'
import {
  applyVisibleTextEdit,
  collapsibleFoldRegions,
  findFoldRegions,
  formatJsonText,
  isRootFoldRegion,
  jsonTextFromValue,
  splitJsonLines,
  visibleJsonLines,
  visibleTextFromLines,
  type FoldRegion,
  type VisibleJsonLine,
} from '../lib/json-folding'

hljs.registerLanguage('json', jsonLang)

const HIGHLIGHT_MAX_BYTES = 3 * 1024 * 1024
const VIRTUALIZE_MIN_BYTES = 1024 * 1024
const LINE_HEIGHT = 20

const foldButtonClass =
  'pointer-events-auto cursor-pointer rounded px-0.5 text-zinc-500 underline decoration-dotted underline-offset-2 hover:bg-zinc-200/80 hover:text-zinc-700 dark:text-zinc-500 dark:hover:bg-zinc-800 dark:hover:text-zinc-300'

function foldToolbarButtonClass() {
  return 'inline-flex items-center rounded border border-zinc-400 p-1 text-zinc-700 hover:bg-white disabled:opacity-40 dark:border-dm-border dark:text-dm-text dark:hover:bg-dm-surface-hover'
}

function textByteLength(text: string): number {
  return new TextEncoder().encode(text).length
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function highlightLine(text: string, language: 'json' | 'plaintext', shouldHighlight: boolean): string {
  if (!shouldHighlight || language !== 'json') {
    return escapeHtml(text)
  }
  return hljs.highlight(text, { language: 'json', ignoreIllegals: true }).value
}

function foldBracketParts(
  content: string,
  region: FoldRegion,
): { prefix: string; openChar: string; after: string } | null {
  const openIndex = content.lastIndexOf(region.openChar)
  if (openIndex === -1) return null
  return {
    prefix: content.slice(0, openIndex),
    openChar: region.openChar,
    after: content.slice(openIndex + 1),
  }
}

function collapsedBracketParts(
  content: string,
  region: FoldRegion,
): { prefix: string; openChar: string; after: string } | null {
  const openIndex = content.lastIndexOf(region.openChar)
  if (openIndex === -1) return null
  return {
    prefix: content.slice(0, openIndex),
    openChar: region.openChar,
    after: content.slice(openIndex + 1),
  }
}

export interface JsonTextEditorProps {
  value: string
  onChange?: (value: string) => void
  readOnly?: boolean
  maxHeight?: string
  class?: string
  highlight?: boolean
  collapsible?: boolean
  error?: boolean
  testId?: string
  onBlur?: () => void
  copyText?: () => string
  copyTestId?: string
}

export interface JsonViewerProps {
  data: unknown
  maxHeight?: string
  class?: string
  highlight?: boolean
  collapsible?: boolean
  testId?: string
  copyText?: () => string
  copyTestId?: string
}

function FoldControl(props: {
  foldId: string
  collapsed: boolean
  label: string
  onToggle: (foldId: string) => void
  text: string
  highlighted?: string
  part?: 'open' | 'close'
}) {
  const testId = () =>
    props.part === 'open' ? `json-fold-open-${props.foldId}` : `json-fold-${props.foldId}`

  return (
    <button
      type="button"
      data-testid={testId()}
      class={foldButtonClass}
      aria-expanded={!props.collapsed}
      aria-label={props.label}
      onClick={(event) => {
        event.stopPropagation()
        props.onToggle(props.foldId)
      }}
    >
      {props.highlighted ? <span innerHTML={props.highlighted} /> : props.text}
    </button>
  )
}

function FormatJsonButton(props: { disabled: boolean; onFormat: () => void }) {
  return (
    <button
      type="button"
      data-testid="json-format"
      title="Format JSON"
      aria-label="Format JSON"
      disabled={props.disabled}
      class={`${foldToolbarButtonClass()} bg-zinc-50 dark:bg-zinc-900/80`}
      onClick={(event) => {
        event.stopPropagation()
        props.onFormat()
      }}
    >
      <Braces size={14} />
    </button>
  )
}

function FloatingEditorActions(props: {
  showFold: boolean
  expanded: boolean
  onToggleFolds: () => void
  showFormat: boolean
  canFormat: boolean
  onFormat: () => void
  copyText?: () => string
  copyTestId?: string
}) {
  return (
    <div class="pointer-events-none absolute top-1 right-5 z-30">
      <div class="pointer-events-auto flex gap-0.5 rounded border border-zinc-300/80 bg-white/95 p-0.5 shadow-sm dark:border-zinc-700 dark:bg-zinc-900/95">
        <Show when={props.showFold}>
          <FoldAllToggle expanded={props.expanded} onToggle={props.onToggleFolds} />
        </Show>
        <Show when={props.showFormat}>
          <FormatJsonButton disabled={!props.canFormat} onFormat={props.onFormat} />
        </Show>
        <Show when={props.copyText}>
          <CopyButton text={props.copyText!} testId={props.copyTestId} label="Copy" />
        </Show>
      </div>
    </div>
  )
}

function FoldAllToggle(props: { expanded: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      data-testid="json-toggle-all-folds"
      title={props.expanded ? 'Collapse all' : 'Expand all'}
      aria-label={props.expanded ? 'Collapse all' : 'Expand all'}
      class={`${foldToolbarButtonClass()} bg-zinc-50 dark:bg-zinc-900/80`}
      onClick={(event) => {
        event.stopPropagation()
        props.onToggle()
      }}
    >
      {props.expanded ? <FoldVertical size={14} /> : <UnfoldVertical size={14} />}
    </button>
  )
}

export function JsonTextEditor(props: JsonTextEditorProps) {
  let scrollRef: HTMLDivElement | undefined
  let textareaRef: HTMLTextAreaElement | undefined
  const [editableScrollTop, setEditableScrollTop] = createSignal(0)
  const [lines, setLines] = createSignal<string[]>([''])
  const [collapsed, setCollapsed] = createStore<Record<string, boolean>>({})
  const [language, setLanguage] = createSignal<'json' | 'plaintext'>('json')

  createEffect(() => {
    const nextLines = splitJsonLines(props.value)
    setLines(nextLines)

    try {
      JSON.parse(props.value)
      setLanguage('json')
    } catch {
      setLanguage('plaintext')
    }
  })

  const regions = createMemo(() => findFoldRegions(lines()))
  const nestedRegions = createMemo(() => collapsibleFoldRegions(regions()))
  const collapsedSet = createMemo(() => new Set(Object.keys(collapsed).filter((id) => collapsed[id])))
  const visibleRows = createMemo(() => {
    if (props.collapsible === false) {
      return lines().map((content, lineIndex) => ({
        lineIndex,
        sourceLine: lineIndex + 1,
        content,
      }))
    }
    return visibleJsonLines(lines(), regions(), collapsedSet())
  })
  const regionByStart = createMemo(() => new Map(regions().map((region) => [region.startLine, region])))
  const visibleText = createMemo(() =>
    visibleTextFromLines(lines(), regions(), collapsedSet(), props.collapsible !== false),
  )

  const shouldHighlight = createMemo(
    () =>
      props.highlight !== false &&
      language() === 'json' &&
      textByteLength(props.value) <= HIGHLIGHT_MAX_BYTES,
  )

  const shouldVirtualize = createMemo(
    () => (props.readOnly ?? false) && textByteLength(props.value) >= VIRTUALIZE_MIN_BYTES,
  )

  const mirrorStyle = () => ({ transform: `translateY(-${editableScrollTop()}px)` })

  const highlightedLines = createMemo(() => {
    const map = new Map<number, string>()
    if (!shouldHighlight()) return map

    for (let lineIndex = 0; lineIndex < lines().length; lineIndex++) {
      map.set(lineIndex, highlightLine(lines()[lineIndex] ?? '', language(), true))
    }
    return map
  })

  const virtualizer = createVirtualizer({
    get count() {
      return visibleRows().length
    },
    getScrollElement: () => scrollRef ?? null,
    estimateSize: () => LINE_HEIGHT,
    overscan: 12,
  })

  const showFoldToolbar = createMemo(
    () => props.collapsible !== false && nestedRegions().length > 0,
  )

  const allNestedExpanded = createMemo(() =>
    nestedRegions().every((region) => !collapsed[region.id]),
  )

  const toggleFold = (foldId: string) => {
    if (collapsed[foldId]) {
      setCollapsed(foldId, false)
      return
    }
    setCollapsed(foldId, true)
  }

  const toggleAllFolds = () => {
    if (allNestedExpanded()) {
      const next: Record<string, boolean> = {}
      for (const region of nestedRegions()) {
        next[region.id] = true
      }
      setCollapsed(reconcile(next))
      return
    }
    setCollapsed(reconcile({}))
  }

  const handleFormat = () => {
    if (!props.onChange) return
    const formatted = formatJsonText(props.value)
    if (formatted !== null) props.onChange(formatted)
  }

  const handleTextareaInput = (value: string) => {
    if (!props.onChange) return
    const nextLines = applyVisibleTextEdit(lines(), visibleRows(), splitJsonLines(value))
    props.onChange(nextLines.join('\n'))
  }

  const borderClass = () =>
    props.error
      ? 'border-rose-500 dark:border-rose-500'
      : 'border-zinc-200 dark:border-zinc-800'

  const editorTestId = () => props.testId ?? (props.readOnly ? 'json-viewer' : 'json-text-editor')

  const renderRowContent = (row: VisibleJsonLine, foldControls: 'inline' | 'overlay' | 'none' = 'inline') => {
    const region = regionByStart().get(row.lineIndex)
    const canFold = Boolean(
      row.foldId &&
        region &&
        props.collapsible !== false &&
        !isRootFoldRegion(region, regions()),
    )
    const content = row.collapsed ? row.content : (lines()[row.lineIndex] ?? '')
    const parts =
      canFold && region
        ? row.collapsed
          ? collapsedBracketParts(content, region)
          : foldBracketParts(content, region)
        : null
    const highlight = () => shouldHighlight()
    const lang = () => language()

    if (foldControls === 'overlay' && parts && row.foldId) {
      if (row.collapsed) {
        return (
          <span
            class="inline leading-5"
            innerHTML={highlightLine(parts.prefix, lang(), highlight())}
          />
        )
      }

      return (
        <span class="inline leading-5">
          <span class="inline" innerHTML={highlightLine(parts.prefix, lang(), highlight())} />
          <span class="inline" innerHTML={highlightLine(parts.after, lang(), highlight())} />
        </span>
      )
    }

    if (foldControls === 'inline' && parts && row.foldId) {
      const foldId = row.foldId

      if (row.collapsed) {
        return (
          <span class="inline leading-5">
            <span class="inline" innerHTML={highlightLine(parts.prefix, lang(), highlight())} />
            <FoldControl
              foldId={foldId}
              part="open"
              collapsed={true}
              label="Expand"
              onToggle={toggleFold}
              text={parts.openChar}
              highlighted={highlightLine(parts.openChar, lang(), highlight())}
            />
            <FoldControl
              foldId={foldId}
              part="close"
              collapsed={true}
              label="Expand"
              onToggle={toggleFold}
              text={parts.after}
              highlighted={highlightLine(parts.after, lang(), highlight())}
            />
          </span>
        )
      }

      return (
        <span class="inline leading-5">
          <span class="inline" innerHTML={highlightLine(parts.prefix, lang(), highlight())} />
          <FoldControl
            foldId={foldId}
            part="open"
            collapsed={false}
            label="Collapse"
            onToggle={toggleFold}
            text={parts.openChar}
            highlighted={highlightLine(parts.openChar, lang(), highlight())}
          />
          <span class="inline" innerHTML={highlightLine(parts.after, lang(), highlight())} />
        </span>
      )
    }

    return (
      <span
        innerHTML={
          highlightedLines().get(row.lineIndex) ?? highlightLine(content, lang(), highlight())
        }
      />
    )
  }

  const displayFoldControls = () => (props.readOnly ? 'inline' : 'overlay')

  const renderRow = (row: VisibleJsonLine) => (
    <div
      data-testid="json-line"
      data-line-number={row.sourceLine}
      class="h-5 min-w-max whitespace-pre px-3 leading-5"
    >
      {renderRowContent(row, displayFoldControls())}
    </div>
  )

  const renderFoldOverlayRow = (row: VisibleJsonLine) => {
    const region = regionByStart().get(row.lineIndex)
    const canFold = Boolean(
      row.foldId &&
        region &&
        props.collapsible !== false &&
        !isRootFoldRegion(region, regions()),
    )
    if (!canFold || !row.foldId || !region) {
      return <div class="h-5 px-3 leading-5" aria-hidden="true" />
    }

    const content = row.collapsed ? row.content : (lines()[row.lineIndex] ?? '')
    const parts = row.collapsed
      ? collapsedBracketParts(content, region)
      : foldBracketParts(content, region)
    if (!parts) return <div class="h-5 px-3 leading-5" aria-hidden="true" />

    const foldId = row.foldId
    const highlight = () => shouldHighlight()
    const lang = () => language()

    if (row.collapsed) {
      return (
        <div class="h-5 whitespace-pre px-3 leading-5">
          <span class="invisible">{parts.prefix}</span>
          <FoldControl
            foldId={foldId}
            part="open"
            collapsed={true}
            label="Expand"
            onToggle={toggleFold}
            text={parts.openChar}
            highlighted={highlightLine(parts.openChar, lang(), highlight())}
          />
          <FoldControl
            foldId={foldId}
            part="close"
            collapsed={true}
            label="Expand"
            onToggle={toggleFold}
            text={parts.after}
            highlighted={highlightLine(parts.after, lang(), highlight())}
          />
        </div>
      )
    }

    return (
      <div class="h-5 whitespace-pre px-3 leading-5">
        <span class="invisible">{parts.prefix}</span>
        <FoldControl
          foldId={foldId}
          part="open"
          collapsed={false}
          label="Collapse"
          onToggle={toggleFold}
          text={parts.openChar}
          highlighted={highlightLine(parts.openChar, lang(), highlight())}
        />
        <span class="invisible">{parts.after}</span>
      </div>
    )
  }

  const renderVirtualRows = (renderLine: (row: VisibleJsonLine) => JSX.Element) => (
    <div class="relative w-full" style={{ height: `${virtualizer.getTotalSize()}px` }}>
      <For each={virtualizer.getVirtualItems()}>
        {(item) => {
          const row = () => visibleRows()[item.index]
          return (
            <Show when={row()}>
              {(current) => (
                <div
                  class="absolute top-0 left-0 w-full"
                  style={{ transform: `translateY(${item.start}px)` }}
                >
                  {renderLine(current())}
                </div>
              )}
            </Show>
          )
        }}
      </For>
    </div>
  )

  const renderReadOnlyBody = () => (
    <div
      data-testid="json-content"
      class="w-full min-w-min select-text"
    >
      <Show when={shouldVirtualize()} fallback={<For each={visibleRows()}>{(row) => renderRow(row)}</For>}>
        {renderVirtualRows(renderRow)}
      </Show>
    </div>
  )

  const renderEditableBody = () => (
    <div
      data-testid="json-textarea-resize"
      class="relative h-32 min-h-32 resize-y overflow-hidden"
    >
      <textarea
        ref={textareaRef}
        data-testid="json-textarea"
        value={visibleText()}
        spellcheck={false}
        class="absolute inset-0 z-10 block h-full w-full resize-none overflow-auto border-0 bg-transparent px-3 py-1 font-mono text-[13px] leading-5 text-transparent caret-zinc-900 outline-none selection:bg-sky-300/40 dark:caret-zinc-100 dark:selection:bg-sky-500/30"
        onInput={(event) => handleTextareaInput(event.currentTarget.value)}
        onScroll={(event) => setEditableScrollTop(event.currentTarget.scrollTop)}
        onBlur={() => props.onBlur?.()}
      />
      <div
        data-testid="json-content"
        class="pointer-events-none absolute inset-0 z-0 overflow-hidden py-1"
      >
        <div class="min-w-min" style={mirrorStyle()}>
          <For each={visibleRows()}>{(row) => renderRow(row)}</For>
        </div>
      </div>
      <div
        data-testid="json-fold-overlay"
        class="pointer-events-none absolute inset-0 z-20 overflow-hidden py-1"
      >
        <div class="min-w-min" style={mirrorStyle()}>
          <For each={visibleRows()}>{(row) => renderFoldOverlayRow(row)}</For>
        </div>
      </div>
    </div>
  )

  const showFormatToolbar = createMemo(
    () => !(props.readOnly ?? false) && Boolean(props.onChange),
  )

  const showFloatingActions = createMemo(
    () => showFoldToolbar() || showFormatToolbar() || Boolean(props.copyText),
  )

  const containerStyle = () =>
    props.readOnly ? { 'max-height': props.maxHeight ?? '24rem' } : undefined

  return (
    <div
      data-testid={editorTestId()}
      class={`relative w-full rounded-lg border bg-zinc-50 font-mono text-[13px] dark:bg-zinc-900/80 ${borderClass()} ${
        props.readOnly ? 'flex flex-col overflow-hidden' : ''
      } ${props.class ?? ''}`}
      style={containerStyle()}
    >
      <Show when={showFloatingActions()}>
        <FloatingEditorActions
          showFold={showFoldToolbar()}
          expanded={allNestedExpanded()}
          onToggleFolds={toggleAllFolds}
          showFormat={showFormatToolbar()}
          canFormat={language() === 'json'}
          onFormat={handleFormat}
          copyText={props.copyText}
          copyTestId={props.copyTestId}
        />
      </Show>

      <Show when={props.readOnly} fallback={renderEditableBody()}>
        <div
          ref={scrollRef}
          class="min-h-0 flex-1 overflow-auto"
          onClick={(event) => event.stopPropagation()}
        >
          <div class="relative w-full min-w-0 py-1">{renderReadOnlyBody()}</div>
        </div>
      </Show>
    </div>
  )
}

export function VirtualJsonViewer(props: JsonViewerProps) {
  const text = createMemo(() => jsonTextFromValue(props.data))

  return (
    <JsonTextEditor
      value={text().text}
      readOnly
      maxHeight={props.maxHeight}
      class={props.class}
      highlight={props.highlight}
      collapsible={props.collapsible}
      testId="json-viewer"
      copyText={props.copyText}
      copyTestId={props.copyTestId}
    />
  )
}
