import { For, Show } from 'solid-js'
import { ChevronDown } from '../icons'
import type { SpecDefinition } from '../lib/spec-definitions'

interface DefinitionSelectorProps {
  definitions: SpecDefinition[]
  selected: string
  onChange: (name: string) => void
}

export function DefinitionSelector(props: DefinitionSelectorProps) {
  return (
    <Show when={props.definitions.length > 1}>
      <div class="relative shrink-0">
        <select
          data-testid="definition-select"
          aria-label="Select a definition"
          title="Select a definition"
          onChange={(event) => props.onChange(event.currentTarget.value)}
          class="min-w-[11.5rem] max-w-[14rem] appearance-none rounded-md border border-emerald-600 bg-white py-1.5 pr-8 pl-3 text-sm text-zinc-900 outline-none focus:ring-2 focus:ring-emerald-500/40 dark:border-emerald-600 dark:bg-zinc-900 dark:text-zinc-100"
        >
          <For each={props.definitions}>
            {(definition) => (
              <option value={definition.name} selected={definition.name === props.selected}>
                {definition.name}
              </option>
            )}
          </For>
        </select>
        <ChevronDown
          size={14}
          class="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-zinc-500 dark:text-zinc-400"
        />
      </div>
    </Show>
  )
}
