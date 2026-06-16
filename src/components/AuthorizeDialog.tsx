import { For, Show, createSignal } from 'solid-js'
import { Portal } from 'solid-js/web'
import { LoaderCircle, Lock, X } from '../icons'
import type { ClientCredentialsLocation } from '../lib/oauth-token'
import { useAuth } from '../lib/auth-context'
import type { SecuritySchemeInfo } from '../lib/auth-config'

interface AuthorizeDialogProps {
  open: boolean
  onClose: () => void
}

function OAuthPasswordForm(props: {
  scheme: Extract<SecuritySchemeInfo, { kind: 'oauth2-password' }>
  onAuthorized?: () => void
}) {
  const auth = useAuth()
  const [username, setUsername] = createSignal('')
  const [password, setPassword] = createSignal('')
  const [clientId, setClientId] = createSignal(props.scheme.clientId)
  const [clientSecret, setClientSecret] = createSignal(props.scheme.clientSecret)
  const [credentialsLocation, setCredentialsLocation] =
    createSignal<ClientCredentialsLocation>('header')
  const [loading, setLoading] = createSignal(false)
  const [error, setError] = createSignal<string | null>(null)

  const authorized = () => auth.isAuthorized(props.scheme.id)

  const submit = async () => {
    setLoading(true)
    setError(null)
    try {
      await auth.authorizeOAuthPassword({
        schemeId: props.scheme.id,
        username: username(),
        password: password(),
        clientId: clientId(),
        clientSecret: clientSecret(),
        clientCredentialsLocation: credentialsLocation(),
      })
      props.onAuthorized?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authorization failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div class="space-y-3 rounded border border-zinc-300 p-3 dark:border-zinc-700">
      <div class="space-y-1">
        <h3 class="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          {props.scheme.id} (OAuth2, password)
        </h3>
        <p class="text-xs text-zinc-600 dark:text-zinc-400">
          Token URL: <span class="font-mono">{props.scheme.tokenUrl}</span>
        </p>
        <p class="text-xs text-zinc-600 dark:text-zinc-400">Flow: password</p>
      </div>

      <Show when={authorized()}>
        <p class="text-xs font-medium text-emerald-600 dark:text-emerald-400">Authorized</p>
        <button
          type="button"
          class="rounded border border-zinc-400 px-3 py-1 text-xs font-semibold text-zinc-700 hover:bg-zinc-100 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-800"
          onClick={() => auth.logout(props.scheme.id)}
        >
          Logout
        </button>
      </Show>

      <Show when={!authorized()}>
        <form
          class="space-y-3"
          autocomplete="on"
          onSubmit={(event) => {
            event.preventDefault()
            void submit()
          }}
        >
          <label class="block space-y-1 text-xs">
            <span class="font-medium text-zinc-700 dark:text-zinc-300">username:</span>
            <input
              type="text"
              name="username"
              autocomplete="username"
              value={username()}
              onInput={(event) => setUsername(event.currentTarget.value)}
              class="w-full rounded border border-zinc-400 bg-white px-2 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
            />
          </label>
          <label class="block space-y-1 text-xs">
            <span class="font-medium text-zinc-700 dark:text-zinc-300">password:</span>
            <input
              type="password"
              name="password"
              autocomplete="current-password"
              value={password()}
              onInput={(event) => setPassword(event.currentTarget.value)}
              class="w-full rounded border border-zinc-400 bg-white px-2 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
            />
          </label>
          <label class="block space-y-1 text-xs">
            <span class="font-medium text-zinc-700 dark:text-zinc-300">Client credentials location:</span>
            <select
              value={credentialsLocation()}
              onChange={(event) =>
                setCredentialsLocation(event.currentTarget.value as ClientCredentialsLocation)
              }
              autocomplete="off"
              class="w-full rounded border border-zinc-400 bg-white px-2 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
            >
              <option value="body">Request body</option>
              <option value="header">Authorization header</option>
            </select>
          </label>
          <label class="block space-y-1 text-xs">
            <span class="font-medium text-zinc-700 dark:text-zinc-300">client_id:</span>
            <input
              type="text"
              name="client_id"
              autocomplete="off"
              value={clientId()}
              onInput={(event) => setClientId(event.currentTarget.value)}
              class="w-full rounded border border-zinc-400 bg-white px-2 py-1.5 font-mono text-sm dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
            />
          </label>
          <label class="block space-y-1 text-xs">
            <span class="font-medium text-zinc-700 dark:text-zinc-300">client_secret:</span>
            <input
              type="text"
              name="client_secret"
              autocomplete="off"
              data-lpignore="true"
              data-1p-ignore="true"
              data-form-type="other"
              value={clientSecret()}
              onInput={(event) => setClientSecret(event.currentTarget.value)}
              class="w-full rounded border border-zinc-400 bg-white px-2 py-1.5 font-mono text-sm [-webkit-text-security:disc] dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
            />
          </label>

          <Show when={error()}>
            <p class="text-xs text-rose-600 dark:text-rose-400">{error()}</p>
          </Show>

          <button
            type="submit"
            disabled={loading()}
            class="rounded border border-emerald-600 px-4 py-1.5 text-sm font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-60 dark:text-emerald-400 dark:hover:bg-emerald-950/30"
          >
            {loading() ? (
              <span class="inline-flex items-center gap-2">
                <LoaderCircle size={14} class="animate-spin" />
                Authorizing…
              </span>
            ) : (
              'Authorize'
            )}
          </button>
        </form>
      </Show>
    </div>
  )
}

function OAuthClientCredentialsForm(props: {
  scheme: Extract<SecuritySchemeInfo, { kind: 'oauth2-client-credentials' }>
  onAuthorized?: () => void
}) {
  const auth = useAuth()
  const [clientId, setClientId] = createSignal(props.scheme.clientId)
  const [clientSecret, setClientSecret] = createSignal(props.scheme.clientSecret)
  const [credentialsLocation, setCredentialsLocation] =
    createSignal<ClientCredentialsLocation>('header')
  const [loading, setLoading] = createSignal(false)
  const [error, setError] = createSignal<string | null>(null)

  const authorized = () => auth.isAuthorized(props.scheme.id)

  const submit = async () => {
    setLoading(true)
    setError(null)
    try {
      await auth.authorizeOAuthClientCredentials({
        schemeId: props.scheme.id,
        clientId: clientId(),
        clientSecret: clientSecret(),
        clientCredentialsLocation: credentialsLocation(),
      })
      props.onAuthorized?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authorization failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div class="space-y-3 rounded border border-zinc-300 p-3 dark:border-zinc-700">
      <div class="space-y-1">
        <h3 class="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          {props.scheme.id} (OAuth2, client credentials)
        </h3>
        <p class="text-xs text-zinc-600 dark:text-zinc-400">
          Token URL: <span class="font-mono">{props.scheme.tokenUrl}</span>
        </p>
      </div>

      <Show when={authorized()}>
        <p class="text-xs font-medium text-emerald-600 dark:text-emerald-400">Authorized</p>
        <button
          type="button"
          class="rounded border border-zinc-400 px-3 py-1 text-xs font-semibold text-zinc-700 hover:bg-zinc-100 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-800"
          onClick={() => auth.logout(props.scheme.id)}
        >
          Logout
        </button>
      </Show>

      <Show when={!authorized()}>
        <label class="block space-y-1 text-xs">
          <span class="font-medium text-zinc-700 dark:text-zinc-300">Client credentials location:</span>
          <select
            value={credentialsLocation()}
            onChange={(event) =>
              setCredentialsLocation(event.currentTarget.value as ClientCredentialsLocation)
            }
            class="w-full rounded border border-zinc-400 bg-white px-2 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
          >
            <option value="body">Request body</option>
            <option value="header">Authorization header</option>
          </select>
        </label>
        <label class="block space-y-1 text-xs">
          <span class="font-medium text-zinc-700 dark:text-zinc-300">client_id:</span>
          <input
            type="text"
            value={clientId()}
            onInput={(event) => setClientId(event.currentTarget.value)}
            class="w-full rounded border border-zinc-400 bg-white px-2 py-1.5 font-mono text-sm dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
          />
        </label>
        <label class="block space-y-1 text-xs">
          <span class="font-medium text-zinc-700 dark:text-zinc-300">client_secret:</span>
          <input
            type="text"
            name="client_secret"
            autocomplete="off"
            data-lpignore="true"
            data-1p-ignore="true"
            data-form-type="other"
            value={clientSecret()}
            onInput={(event) => setClientSecret(event.currentTarget.value)}
            class="w-full rounded border border-zinc-400 bg-white px-2 py-1.5 font-mono text-sm [-webkit-text-security:disc] dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
          />
        </label>

        <Show when={error()}>
          <p class="text-xs text-rose-600 dark:text-rose-400">{error()}</p>
        </Show>

        <button
          type="button"
          disabled={loading()}
          onClick={() => void submit()}
          class="rounded border border-emerald-600 px-4 py-1.5 text-sm font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-60 dark:text-emerald-400 dark:hover:bg-emerald-950/30"
        >
          {loading() ? (
            <span class="inline-flex items-center gap-2">
              <LoaderCircle size={14} class="animate-spin" />
              Authorizing…
            </span>
          ) : (
            'Authorize'
          )}
        </button>
      </Show>
    </div>
  )
}

function ApiKeyForm(props: {
  scheme: Extract<SecuritySchemeInfo, { kind: 'apiKey' }>
  onAuthorized?: () => void
}) {
  const auth = useAuth()
  const [value, setValue] = createSignal('')
  const authorized = () => auth.isAuthorized(props.scheme.id)

  return (
    <div class="space-y-3 rounded border border-zinc-300 p-3 dark:border-zinc-700">
      <h3 class="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
        {props.scheme.id} (apiKey, {props.scheme.in}: {props.scheme.name})
      </h3>
      <Show when={authorized()}>
        <p class="text-xs font-medium text-emerald-600 dark:text-emerald-400">Authorized</p>
        <button
          type="button"
          class="rounded border border-zinc-400 px-3 py-1 text-xs font-semibold"
          onClick={() => auth.logout(props.scheme.id)}
        >
          Logout
        </button>
      </Show>
      <Show when={!authorized()}>
        <input
          type="text"
          value={value()}
          onInput={(event) => setValue(event.currentTarget.value)}
          placeholder={props.scheme.name}
          class="w-full rounded border border-zinc-400 bg-white px-2 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
        />
        <button
          type="button"
          onClick={() => {
            auth.authorizeApiKey(props.scheme.id, value())
            props.onAuthorized?.()
          }}
          class="rounded border border-emerald-600 px-4 py-1.5 text-sm font-semibold text-emerald-700 dark:text-emerald-400"
        >
          Authorize
        </button>
      </Show>
    </div>
  )
}

function BearerForm(props: {
  scheme: Extract<SecuritySchemeInfo, { kind: 'http-bearer' }>
  onAuthorized?: () => void
}) {
  const auth = useAuth()
  const [token, setToken] = createSignal('')
  const authorized = () => auth.isAuthorized(props.scheme.id)

  return (
    <div class="space-y-3 rounded border border-zinc-300 p-3 dark:border-zinc-700">
      <h3 class="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
        {props.scheme.id} (HTTP Bearer)
      </h3>
      <Show when={authorized()}>
        <p class="text-xs font-medium text-emerald-600 dark:text-emerald-400">Authorized</p>
        <button type="button" class="rounded border px-3 py-1 text-xs" onClick={() => auth.logout(props.scheme.id)}>
          Logout
        </button>
      </Show>
      <Show when={!authorized()}>
        <input
          type="text"
          value={token()}
          onInput={(event) => setToken(event.currentTarget.value)}
          placeholder="Bearer token"
          class="w-full rounded border border-zinc-400 bg-white px-2 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
        />
        <button
          type="button"
          onClick={() => {
            auth.authorizeBearer(props.scheme.id, token())
            props.onAuthorized?.()
          }}
          class="rounded border border-emerald-600 px-4 py-1.5 text-sm font-semibold text-emerald-700 dark:text-emerald-400"
        >
          Authorize
        </button>
      </Show>
    </div>
  )
}

function SchemeForm(props: { scheme: SecuritySchemeInfo; onAuthorized?: () => void }) {
  if (props.scheme.kind === 'oauth2-password') {
    return <OAuthPasswordForm scheme={props.scheme} onAuthorized={props.onAuthorized} />
  }
  if (props.scheme.kind === 'oauth2-client-credentials') {
    return <OAuthClientCredentialsForm scheme={props.scheme} onAuthorized={props.onAuthorized} />
  }
  if (props.scheme.kind === 'apiKey') {
    return <ApiKeyForm scheme={props.scheme} onAuthorized={props.onAuthorized} />
  }
  if (props.scheme.kind === 'http-bearer') {
    return <BearerForm scheme={props.scheme} onAuthorized={props.onAuthorized} />
  }
  return null
}

export function AuthorizeDialog(props: AuthorizeDialogProps) {
  const auth = useAuth()

  return (
    <Show when={props.open}>
      <Portal mount={document.body}>
        <div class="fixed inset-0 z-[100] flex items-start justify-center bg-black/40 p-4 pt-16">
          <div
            role="dialog"
            aria-modal="true"
            class="max-h-[80vh] w-full max-w-lg overflow-auto rounded-lg border border-zinc-300 bg-white shadow-xl dark:border-zinc-700 dark:bg-zinc-900"
          >
          <div class="flex items-center justify-between border-b border-zinc-300 px-4 py-3 dark:border-zinc-700">
            <h2 class="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
              Available authorizations
            </h2>
            <button
              type="button"
              aria-label="Close"
              onClick={props.onClose}
              class="rounded p-1 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
            >
              <X size={18} />
            </button>
          </div>

          <div class="space-y-3 p-4">
            <p class="text-xs text-zinc-600 dark:text-zinc-400">
              Scopes are used to grant an application different levels of access to data on behalf
              of the end user.
            </p>

            <For each={auth.schemes()}>
              {(scheme) => <SchemeForm scheme={scheme} onAuthorized={props.onClose} />}
            </For>
          </div>

          <div class="border-t border-zinc-300 px-4 py-3 dark:border-zinc-700">
            <button
              type="button"
              onClick={props.onClose}
              class="rounded border border-zinc-400 px-4 py-1.5 text-sm font-semibold text-zinc-700 dark:border-zinc-600 dark:text-zinc-200"
            >
              Close
            </button>
          </div>
          </div>
        </div>
      </Portal>
    </Show>
  )
}

export function AuthorizeButton(props: { compact?: boolean }) {
  const auth = useAuth()
  const [open, setOpen] = createSignal(false)
  const authorizedCount = () => auth.entries().size
  const label = () => (authorizedCount() > 0 ? 'Authorized' : 'Authorize')

  return (
    <Show when={auth.hasAnyScheme()}>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={label()}
        class={`inline-flex shrink-0 items-center rounded-md border font-medium transition ${
          props.compact ? 'gap-1 px-2 py-1.5 text-xs' : 'gap-2 rounded-lg px-3 py-2 text-sm'
        } ${
          authorizedCount() > 0
            ? 'border-emerald-600 text-emerald-700 dark:text-emerald-400'
            : 'border-zinc-300 text-zinc-700 dark:border-zinc-700 dark:text-zinc-200'
        }`}
      >
        <Lock size={props.compact ? 14 : 16} />
        <span class={props.compact ? 'hidden md:inline' : ''}>{label()}</span>
        <Show when={authorizedCount() > 0}>
          <span class="rounded-full bg-emerald-600/15 px-1 text-[10px] leading-none md:text-xs">
            {authorizedCount()}
          </span>
        </Show>
      </button>
      <AuthorizeDialog open={open()} onClose={() => setOpen(false)} />
    </Show>
  )
}
