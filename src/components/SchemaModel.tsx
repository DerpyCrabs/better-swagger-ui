import { For, Show } from 'solid-js'
import type { SchemaProperty } from '../lib/schema'

interface SchemaModelProps {
  properties: SchemaProperty[]
  depth?: number
}

function PropertyRow(props: { property: SchemaProperty; depth: number }) {
  const nameIndent = () => `calc(0.5rem + ${props.depth * 1.25}rem)`

  return (
    <>
      <div class="grid grid-cols-[minmax(8rem,26%)_minmax(6rem,18%)_1fr] gap-x-3 border-t border-zinc-300 py-1 text-[13px] dark:border-zinc-700">
        <span
          class="font-semibold text-zinc-900 dark:text-zinc-100"
          style={{ 'padding-left': nameIndent() }}
        >
          {props.property.name}
          {props.property.required ? (
            <span class="text-rose-600 dark:text-rose-400"> *</span>
          ) : null}
        </span>
        <span class="font-mono text-[11px] text-sky-700 dark:text-sky-400">{props.property.type}</span>
        <span class="text-zinc-600 dark:text-zinc-400">
          <Show
            when={props.property.enum?.length}
            fallback={props.property.description ?? '—'}
          >
            {props.property.description ? `${props.property.description} · ` : ''}
            enum: {props.property.enum!.map(String).join(', ')}
          </Show>
        </span>
      </div>
      <Show when={props.property.properties?.length}>
        <For each={props.property.properties}>
          {(child) => <PropertyRow property={child} depth={props.depth + 1} />}
        </For>
      </Show>
    </>
  )
}

export function SchemaModel(props: SchemaModelProps) {
  const depth = () => props.depth ?? 0

  return (
    <Show
      when={props.properties.length > 0}
      fallback={<p class="text-xs text-zinc-500">No properties defined</p>}
    >
      <div class="overflow-x-auto rounded border border-zinc-300 bg-white dark:border-zinc-700 dark:bg-zinc-950/50">
        <div class="grid grid-cols-[minmax(8rem,26%)_minmax(6rem,18%)_1fr] gap-x-3 px-2 py-1 text-[11px] font-semibold text-zinc-600 dark:text-zinc-400">
          <span>Name</span>
          <span>Type</span>
          <span>Description</span>
        </div>
        <For each={props.properties}>
          {(property) => <PropertyRow property={property} depth={depth()} />}
        </For>
      </div>
    </Show>
  )
}
