import { createMemo, createSignal, For, Show } from 'solid-js'
import type { OpenAPIV3 } from 'openapi-types'
import { schemaProperties, type SchemaProperty } from '../lib/schema'

interface SchemaModelProps {
  spec: OpenAPIV3.Document
  properties: SchemaProperty[]
  depth?: number
  plain?: boolean
}

function TypeLabel(props: {
  type: string
  expandableName?: string
  expanded: boolean
  onToggle: () => void
}) {
  const name = () => props.expandableName
  const index = () => (name() ? props.type.indexOf(name()!) : -1)

  const buttonClass =
    'cursor-pointer rounded px-0.5 -mx-0.5 text-left underline decoration-dotted underline-offset-2 hover:bg-sky-100 hover:text-sky-900 dark:hover:bg-sky-950 dark:hover:text-sky-300'

  return (
    <Show
      when={name() && index() >= 0}
      fallback={
        <button
          type="button"
          class={buttonClass}
          aria-expanded={props.expanded}
          onClick={(event) => {
            event.stopPropagation()
            props.onToggle()
          }}
        >
          {props.type}
        </button>
      }
    >
      <span>
        {props.type.slice(0, index())}
        <button
          type="button"
          class={buttonClass}
          aria-expanded={props.expanded}
          onClick={(event) => {
            event.stopPropagation()
            props.onToggle()
          }}
        >
          {name()}
        </button>
        {props.type.slice(index()! + name()!.length)}
      </span>
    </Show>
  )
}

function PropertyRow(props: {
  spec: OpenAPIV3.Document
  property: SchemaProperty
  depth: number
  plain?: boolean
}) {
  const [expanded, setExpanded] = createSignal(false)
  const nameIndent = () => `calc(0.5rem + ${props.depth * 1.25}rem)`
  const canExpand = () => Boolean(props.property.expandableSchema)

  const nestedProperties = createMemo(() => {
    if (!expanded() || !props.property.expandableSchema) return []
    return schemaProperties(props.spec, props.property.expandableSchema, new Set())
  })

  return (
    <>
      <div
        class={`grid grid-cols-[minmax(8rem,26%)_minmax(6rem,18%)_1fr] gap-x-3 border-t py-1 text-[13px] ${
          props.plain
            ? 'border-zinc-200 dark:border-dm-border'
            : 'border-zinc-300 dark:border-dm-border'
        }`}
      >
        <span
          class="font-semibold text-zinc-900 dark:text-dm-text"
          style={{ 'padding-left': nameIndent() }}
        >
          {props.property.name}
          {props.property.required ? (
            <span class="text-rose-600 dark:text-rose-400"> *</span>
          ) : null}
        </span>
        <span class="font-mono text-[11px] font-medium text-zinc-800 dark:text-dm-muted">
          <Show
            when={canExpand()}
            fallback={props.property.type}
          >
            <TypeLabel
              type={props.property.type}
              expandableName={props.property.expandableName}
              expanded={expanded()}
              onToggle={() => setExpanded((value) => !value)}
            />
          </Show>
        </span>
        <span class="text-zinc-700 dark:text-dm-muted">
          <Show
            when={props.property.enum?.length}
            fallback={props.property.description ?? '—'}
          >
            {props.property.description ? `${props.property.description} · ` : ''}
            enum: {props.property.enum!.map(String).join(', ')}
          </Show>
        </span>
      </div>
      <Show when={expanded()}>
        <Show
          when={nestedProperties().length > 0}
          fallback={
            <p
              class="border-t border-zinc-300 py-1 text-xs text-zinc-500 dark:border-dm-border dark:text-dm-muted"
              style={{ 'padding-left': nameIndent() }}
            >
              No properties defined
            </p>
          }
        >
          <For each={nestedProperties()}>
            {(child) => (
              <PropertyRow spec={props.spec} property={child} depth={props.depth + 1} plain={props.plain} />
            )}
          </For>
        </Show>
      </Show>
    </>
  )
}

export function SchemaModel(props: SchemaModelProps) {
  const depth = () => props.depth ?? 0
  const plain = () => props.plain ?? false

  return (
    <Show
      when={props.properties.length > 0}
      fallback={<p class="text-xs text-zinc-600 dark:text-dm-muted">No properties defined</p>}
    >
      <div
        class={
          plain()
            ? 'overflow-x-auto'
            : 'overflow-x-auto rounded border border-zinc-300 bg-white dark:border-dm-border dark:bg-dm-surface'
        }
      >
        <div class="grid grid-cols-[minmax(8rem,26%)_minmax(6rem,18%)_1fr] gap-x-3 px-2 py-1 text-[11px] font-semibold text-zinc-700 dark:text-dm-muted">
          <span>Name</span>
          <span>Type</span>
          <span>Description</span>
        </div>
        <For each={props.properties}>
          {(property) => (
            <PropertyRow spec={props.spec} property={property} depth={depth()} plain={plain()} />
          )}
        </For>
      </div>
    </Show>
  )
}
