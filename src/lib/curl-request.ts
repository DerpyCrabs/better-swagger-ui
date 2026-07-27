function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`
}

function isFile(value: FormDataEntryValue | BodyInit): value is File {
  return typeof File !== 'undefined' && value instanceof File
}

function bodyArguments(body: BodyInit | undefined): string[] {
  if (body === undefined || body === null) return []

  if (typeof body === 'string') {
    return [`--data-raw ${shellQuote(body)}`]
  }

  if (body instanceof URLSearchParams) {
    return [`--data-raw ${shellQuote(body.toString())}`]
  }

  if (body instanceof FormData) {
    const args: string[] = []
    for (const [name, value] of body.entries()) {
      const formValue = isFile(value)
        ? `${name}=@${value.name}${value.type ? `;type=${value.type}` : ''}`
        : `${name}=${value}`
      args.push(`-F ${shellQuote(formValue)}`)
    }
    return args
  }

  if (isFile(body)) {
    return [`--data-binary ${shellQuote(`@${body.name}`)}`]
  }

  return []
}

export interface CurlRequest {
  method: string
  url: string
  headers: Record<string, string>
  body?: BodyInit
}

export function buildCurlCommand(request: CurlRequest): string {
  const lines = [
    `curl -X ${shellQuote(request.method.toUpperCase())}`,
    `  ${shellQuote(request.url)}`,
  ]

  for (const [name, value] of Object.entries(request.headers)) {
    lines.push(`  -H ${shellQuote(`${name}: ${value}`)}`)
  }

  lines.push(...bodyArguments(request.body).map((argument) => `  ${argument}`))
  return lines.join(' \\\n')
}
