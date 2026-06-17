import { For, Show, createEffect, createSignal } from 'solid-js'
import type { OpenAPIV3 } from 'openapi-types'
import type { JSX } from 'solid-js'
import type { MediaSchemaInfo, RequestBodySchemaInfo, ResponseSchemaInfo } from '../lib/schema'
import {
  formatRequestBodySchemaForCopy,
  formatResponseSchemaForCopy,
  hasCopyableSchema,
} from '../lib/schema'
import { SchemaModel } from './SchemaModel'
import { VirtualJsonViewer } from './VirtualJsonViewer'
import { CopyButton } from './CopyButton'
import { ChevronRight } from '../icons'
import {
  dmBorderB,
  dmMuted,
  dmSchemaPanel,
  dmSectionHeading,
} from '../lib/dm-classes'

interface SchemaSectionProps {
  spec: OpenAPIV3.Document
  title: string
  media: MediaSchemaInfo
  description?: string
  plainSchema?: boolean
}

function SchemaSection(props: SchemaSectionProps) {
  return (
    <div class="space-y-1.5">
      <div class="flex flex-wrap items-center gap-2 text-xs">
        <span class="rounded bg-zinc-200 px-1.5 py-0.5 font-mono text-zinc-800 dark:bg-dm-surface dark:text-dm-text dark:ring-1 dark:ring-dm-border">
          {props.media.contentType}
        </span>
        <Show when={props.media.schemaName}>
          <span class="font-mono text-sky-700 dark:text-[#60a5fa]">{props.media.schemaName}</span>
        </Show>
      </div>
      <Show when={props.description}>
        <p class={`text-xs ${dmMuted}`}>{props.description}</p>
      </Show>
      <Show
        when={props.media.properties.length > 0}
        fallback={
          <Show when={props.media.example !== null && props.media.example !== undefined}>
            <VirtualJsonViewer data={props.media.example} maxHeight="16rem" />
          </Show>
        }
      >
        <SchemaModel spec={props.spec} properties={props.media.properties} plain={props.plainSchema} />
      </Show>
    </div>
  )
}

interface RequestBodySchemaViewProps {
  spec: OpenAPIV3.Document
  info: RequestBodySchemaInfo
}

type RequestBodyTab = 'example' | 'model'

const tabButtonClass = (active: boolean) =>
  `border-b-2 px-3 py-1.5 text-xs font-semibold transition ${
    active
      ? 'border-zinc-900 text-zinc-900 dark:border-white dark:text-white'
      : 'border-transparent text-zinc-600 hover:text-zinc-800 dark:text-dm-muted dark:hover:text-dm-text'
  }`

interface RequestBodyPanelProps {
  spec: OpenAPIV3.Document
  info: RequestBodySchemaInfo
  tryItOut: boolean
  exampleViewer: JSX.Element
  editor: JSX.Element
}

export function RequestBodyPanel(props: RequestBodyPanelProps) {
  const [tab, setTab] = createSignal<RequestBodyTab>(props.tryItOut ? 'example' : 'model')
  const copyText = () => formatRequestBodySchemaForCopy(props.info)

  createEffect(() => {
    if (props.tryItOut) {
      setTab('example')
    }
  })

  return (
    <section class="mt-2 space-y-1.5 pt-1">
      <div class="flex flex-wrap items-center gap-2">
        <h4 class={dmSectionHeading}>
          Request body
        </h4>
        <Show when={props.info.required}>
          <span class="text-[11px] text-rose-600 dark:text-rose-400">required</span>
        </Show>
      </div>
      <Show when={props.info.description}>
        <p class={`text-xs ${dmMuted}`}>{props.info.description}</p>
      </Show>

      <div class={`flex gap-1 ${dmBorderB}`}>
        <button
          type="button"
          data-testid="request-body-tab-example"
          class={tabButtonClass(tab() === 'example')}
          onClick={() => setTab('example')}
        >
          Example Value
        </button>
        <button
          type="button"
          data-testid="request-body-tab-model"
          class={tabButtonClass(tab() === 'model')}
          onClick={() => setTab('model')}
        >
          Model
        </button>
      </div>

      <Show when={tab() === 'example'}>
        <div class={dmSchemaPanel}>
          <Show when={props.tryItOut} fallback={props.exampleViewer}>
            {props.editor}
          </Show>
        </div>
      </Show>

      <Show when={tab() === 'model'}>
        <div class={dmSchemaPanel}>
          <div class="flex items-start gap-2">
            <div class="min-w-0 flex-1 space-y-2">
              <For each={props.info.media}>
                {(media) => <SchemaSection spec={props.spec} title="Request body" media={media} />}
              </For>
            </div>
            <Show when={hasCopyableSchema(props.info)}>
              <CopyButton
                testId="copy-request-body-schema"
                text={copyText}
                label="Copy schema"
                class="shrink-0"
              />
            </Show>
          </div>
        </div>
      </Show>
    </section>
  )
}

export function RequestBodySchemaView(props: RequestBodySchemaViewProps) {
  const copyText = () => formatRequestBodySchemaForCopy(props.info)

  return (
    <section class="mt-2 space-y-1.5 pt-1">
      <div class="flex flex-wrap items-center gap-2">
        <h4 class={dmSectionHeading}>
          Request body
        </h4>
        <Show when={props.info.required}>
          <span class="text-[11px] text-rose-600 dark:text-rose-400">required</span>
        </Show>
      </div>
      <Show when={props.info.description}>
        <p class={`text-xs ${dmMuted}`}>{props.info.description}</p>
      </Show>
      <div class="flex items-start gap-2">
        <div class="min-w-0 flex-1 space-y-2">
          <For each={props.info.media}>
            {(media) => <SchemaSection spec={props.spec} title="Request body" media={media} />}
          </For>
        </div>
        <Show when={hasCopyableSchema(props.info)}>
          <CopyButton
            testId="copy-request-body-schema"
            text={copyText}
            label="Copy schema"
            class="shrink-0"
          />
        </Show>
      </div>
    </section>
  )
}

interface ResponsesSchemaViewProps {
  spec: OpenAPIV3.Document
  responses: ResponseSchemaInfo[]
}

function isErrorResponseStatus(status: string): boolean {
  return status.startsWith('4') || status.startsWith('5')
}

function statusBadgeClass(status: string): string {
  if (status.startsWith('2')) {
    return 'bg-emerald-600/15 text-emerald-800 dark:bg-[rgba(46,204,113,0.15)] dark:text-[#4ade80]'
  }
  if (isErrorResponseStatus(status)) {
    return 'bg-rose-600/15 text-rose-800 dark:bg-[rgba(231,76,60,0.15)] dark:text-[#f87171]'
  }
  return 'bg-zinc-200 text-zinc-800 dark:bg-dm-surface dark:text-dm-muted'
}

function ResponseBlock(props: {
  spec: OpenAPIV3.Document
  response: ResponseSchemaInfo
  collapsible?: boolean
}) {
  const copyText = () => formatResponseSchemaForCopy(props.response)

  const header = (
    <div class="flex flex-wrap items-center gap-2">
      <span class={`rounded px-1.5 py-0.5 text-xs font-semibold ${statusBadgeClass(props.response.status)}`}>
        {props.response.status}
      </span>
      <Show when={props.response.description}>
        <span class="text-xs text-zinc-600 dark:text-dm-muted">{props.response.description}</span>
      </Show>
    </div>
  )

  const body = (
    <div class="pt-2">
      <Show
        when={props.response.media.length > 0}
        fallback={<p class={`text-xs ${dmMuted}`}>No content</p>}
      >
        <div class={dmSchemaPanel}>
          <div class="flex items-start gap-2">
            <div class="min-w-0 flex-1 space-y-2">
              <For each={props.response.media}>
                {(media) => (
                  <SchemaSection
                    spec={props.spec}
                    title={`Response ${props.response.status}`}
                    media={media}
                    plainSchema
                  />
                )}
              </For>
            </div>
            <Show when={hasCopyableSchema(props.response)}>
              <CopyButton
                testId={`copy-response-schema-${props.response.status}`}
                text={copyText}
                label="Copy schema"
                class="shrink-0"
              />
            </Show>
          </div>
        </div>
      </Show>
    </div>
  )

  return (
    <Show
      when={props.collapsible}
      fallback={<div class="space-y-1">{header}{body}</div>}
    >
      <details class="group -mx-1 rounded-md px-1 transition-colors hover:bg-zinc-100/90 dark:hover:bg-dm-surface-hover">
        <summary class="cursor-pointer list-none rounded-md py-1.5 [&::-webkit-details-marker]:hidden">
          <div class="flex items-center gap-2">
            <ChevronRight
              size={16}
              class="shrink-0 text-zinc-500 transition-transform group-open:rotate-90 dark:text-dm-muted"
            />
            {header}
          </div>
        </summary>
        <div class="pb-1 pl-6">{body}</div>
      </details>
    </Show>
  )
}

export function ResponsesSchemaView(props: ResponsesSchemaViewProps) {
  return (
    <Show when={props.responses.length > 0}>
      <section class="mt-2 space-y-2 pt-1">
        <h4 class={dmSectionHeading}>
          Responses
        </h4>
        <For each={props.responses}>
          {(response) => (
            <ResponseBlock
              spec={props.spec}
              response={response}
              collapsible={isErrorResponseStatus(response.status)}
            />
          )}
        </For>
      </section>
    </Show>
  )
}
