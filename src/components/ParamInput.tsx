import { For, Match, Switch } from 'solid-js'
import type { ParamInputMeta } from '../lib/param-schema'

interface ParamInputProps {
  meta: ParamInputMeta
  value: string
  error?: string
  onInput: (value: string) => void
  onBlur?: () => void
}

const inputClass =
  'w-full max-w-sm rounded-md border bg-white px-2 py-1 text-[13px] text-zinc-900 placeholder:text-zinc-500 outline-none focus:ring-2 focus:ring-sky-500/30 dark:border-dm-border dark:bg-dm-input dark:text-dm-text dark:placeholder:text-dm-muted'

function fieldClass(invalid: boolean) {
  return `${inputClass} ${
    invalid
      ? 'border-rose-500 focus:border-rose-500 focus:ring-rose-500/50 dark:border-rose-500'
      : 'border-zinc-400 focus:border-sky-500 focus:ring-sky-500/50 dark:focus:border-sky-500 dark:focus:ring-sky-500/40'
  }`
}

function EnumSelect(props: ParamInputProps) {
  const options = () => props.meta.enumValues ?? []

  return (
    <select
      value={props.value}
      onClick={(event) => event.stopPropagation()}
      onChange={(event) => props.onInput(event.currentTarget.value)}
      onBlur={() => props.onBlur?.()}
      class={fieldClass(Boolean(props.error))}
    >
      <option value="">{props.meta.required ? 'Select…' : '—'}</option>
      <For each={options()}>
        {(option) => <option value={option}>{option}</option>}
      </For>
    </select>
  )
}

function BooleanSelect(props: ParamInputProps) {
  return (
    <select
      value={props.value}
      onClick={(event) => event.stopPropagation()}
      onChange={(event) => props.onInput(event.currentTarget.value)}
      onBlur={() => props.onBlur?.()}
      class={fieldClass(Boolean(props.error))}
    >
      <option value="">{props.meta.required ? 'Select…' : '—'}</option>
      <option value="true">true</option>
      <option value="false">false</option>
    </select>
  )
}

function TextLikeInput(props: ParamInputProps & { type?: string; placeholder?: string }) {
  return (
    <input
      type={props.type ?? 'text'}
      value={props.value}
      placeholder={props.placeholder ?? props.meta.example ?? props.meta.name}
      min={props.meta.minimum}
      max={props.meta.maximum}
      minLength={props.meta.minLength}
      maxLength={props.meta.maxLength}
      pattern={props.meta.pattern}
      onClick={(event) => event.stopPropagation()}
      onInput={(event) => props.onInput(event.currentTarget.value)}
      onBlur={() => props.onBlur?.()}
      class={fieldClass(Boolean(props.error))}
    />
  )
}

export function ParamInput(props: ParamInputProps) {
  const placeholder = () => {
    if (props.meta.example) return props.meta.example
    if (props.meta.kind === 'array') {
      if (props.meta.arrayItemEnum?.length) {
        return props.meta.arrayItemEnum.join(', ')
      }
      return 'value1, value2'
    }
    return props.meta.name
  }

  return (
    <div class="space-y-0.5">
      <Switch>
        <Match when={props.meta.kind === 'enum'}>
          <EnumSelect {...props} />
        </Match>
        <Match when={props.meta.kind === 'boolean'}>
          <BooleanSelect {...props} />
        </Match>
        <Match when={props.meta.kind === 'integer' || props.meta.kind === 'number'}>
          <TextLikeInput {...props} type="number" placeholder={placeholder()} />
        </Match>
        <Match when={props.meta.kind === 'array'}>
          <TextLikeInput {...props} placeholder={placeholder()} />
        </Match>
        <Match when={props.meta.kind === 'object'}>
          <textarea
            rows={3}
            value={props.value}
            placeholder={props.meta.example ?? '{"key":"value"}'}
            onClick={(event) => event.stopPropagation()}
            onInput={(event) => props.onInput(event.currentTarget.value)}
            onBlur={() => props.onBlur?.()}
            class={fieldClass(Boolean(props.error))}
          />
        </Match>
        <Match when={props.meta.format === 'date'}>
          <TextLikeInput {...props} type="date" />
        </Match>
        <Match when={props.meta.format === 'date-time'}>
          <TextLikeInput {...props} type="datetime-local" />
        </Match>
        <Match when={true}>
          <TextLikeInput {...props} placeholder={placeholder()} />
        </Match>
      </Switch>

      {props.error ? (
        <p class="text-[11px] text-rose-600 dark:text-rose-400">{props.error}</p>
      ) : null}
    </div>
  )
}
