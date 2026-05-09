import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'http'
import crypto from 'crypto'
import { getDatabase } from './database'
import type { Provider } from './ipc/providers'

export const CODEX_PROXY_PORT = 47891
export const CODEX_PROXY_BASE_URL = `http://127.0.0.1:${CODEX_PROXY_PORT}`

type ChatRole = 'system' | 'user' | 'assistant' | 'tool'

interface ChatToolCall {
  id: string
  type: 'function'
  function: {
    name: string
    arguments: string
  }
}

interface ChatMessage {
  role: ChatRole
  content?: string
  tool_call_id?: string
  tool_calls?: ChatToolCall[]
}

interface ResponsesRequest {
  model?: string
  instructions?: string
  input?: unknown
  previous_response_id?: string
  tools?: unknown[]
  tool_choice?: unknown
  stream?: boolean
  temperature?: number
  top_p?: number
  max_output_tokens?: number
  max_tokens?: number
}

interface StreamedToolCall {
  id: string
  itemId: string
  outputIndex: number
  name: string
  arguments: string
}

const MAX_RESPONSE_HISTORIES = 100
const responseHistories = new Map<string, ChatMessage[]>()
let codexProxyServer: Server | null = null

function writeJson(res: ServerResponse, statusCode: number, payload: unknown): void {
  res.writeHead(statusCode, { 'content-type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(payload))
}

function writeSse(res: ServerResponse, event: string, payload: unknown): void {
  res.write(`event: ${event}\n`)
  res.write(`data: ${JSON.stringify(payload)}\n\n`)
}

function createResponseId(): string {
  return `resp_${crypto.randomUUID().replace(/-/g, '')}`
}

function createItemId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, '')}`
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

function errorMessageFromPayload(payload: unknown, fallback: string): string {
  if (!payload || typeof payload !== 'object') return fallback
  const error = (payload as { error?: unknown }).error
  if (error && typeof error === 'object') {
    const message = (error as { message?: unknown }).message
    if (typeof message === 'string' && message) return message
  }
  const message = (payload as { message?: unknown }).message
  return typeof message === 'string' && message ? message : fallback
}

function writeUpstreamError(res: ServerResponse, status: number, text: string): void {
  const payload = safeJson(text)
  const message = errorMessageFromPayload(payload, text || `HTTP ${status}`)
  writeJson(res, status, {
    error: {
      message: `Chat Completions 上游返回 ${status}: ${message}`,
      type: 'upstream_error',
      status,
      body: payload ?? text
    }
  })
}

function readRequestBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)))
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')))
    req.on('error', reject)
  })
}

function getProvider(providerId: string): Provider | null {
  const db = getDatabase()
  return (db.prepare('SELECT * FROM providers WHERE id = ?').get(providerId) as Provider | undefined) ?? null
}

function getChatCompletionsUrl(provider: Provider): string {
  const baseUrl = provider.base_url.replace(/\/+$/, '')
  if (baseUrl.endsWith('/chat/completions')) return baseUrl
  return `${baseUrl}/chat/completions`
}

function contentToText(content: unknown): string {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''

  return content
    .map((part) => {
      if (typeof part === 'string') return part
      if (!part || typeof part !== 'object') return ''
      const record = part as Record<string, unknown>
      const text = record.text ?? record.output_text ?? record.input_text
      return typeof text === 'string' ? text : ''
    })
    .filter(Boolean)
    .join('\n')
}

function normalizeRole(role: unknown): ChatRole {
  if (role === 'assistant' || role === 'tool') return role
  if (role === 'system' || role === 'developer') return 'system'
  return 'user'
}

function responseItemToChatMessages(item: unknown): ChatMessage[] {
  if (!item || typeof item !== 'object') return []
  const record = item as Record<string, unknown>
  const type = record.type

  if (type === 'function_call_output') {
    return [
      {
        role: 'tool',
        tool_call_id: String(record.call_id ?? ''),
        content: contentToText(record.output ?? record.content)
      }
    ]
  }

  if (type === 'function_call') {
    return [
      {
        role: 'assistant',
        content: '',
        tool_calls: [
          {
            id: String(record.call_id ?? record.id ?? createItemId('call')),
            type: 'function',
            function: {
              name: String(record.name ?? ''),
              arguments: typeof record.arguments === 'string' ? record.arguments : JSON.stringify(record.arguments ?? {})
            }
          }
        ]
      }
    ]
  }

  return [
    {
      role: normalizeRole(record.role),
      content: contentToText(record.content ?? record.text)
    }
  ]
}

function responseInputToChatMessages(input: unknown, instructions?: string): ChatMessage[] {
  const messages: ChatMessage[] = []
  if (instructions) messages.push({ role: 'system', content: instructions })

  if (typeof input === 'string') {
    messages.push({ role: 'user', content: input })
    return messages
  }

  if (Array.isArray(input)) {
    for (const item of input) messages.push(...responseItemToChatMessages(item))
  }

  return messages
}

function messagesWithHistory(body: ResponsesRequest): ChatMessage[] {
  const currentMessages = responseInputToChatMessages(body.input, body.instructions)
  if (!body.previous_response_id) return currentMessages
  const history = responseHistories.get(body.previous_response_id)
  return history ? [...history, ...currentMessages] : currentMessages
}

function rememberResponseHistory(responseId: string, messages: ChatMessage[], assistantMessage: ChatMessage | null): void {
  responseHistories.set(responseId, assistantMessage ? [...messages, assistantMessage] : messages)
  while (responseHistories.size > MAX_RESPONSE_HISTORIES) {
    const oldestResponseId = responseHistories.keys().next().value
    if (!oldestResponseId) break
    responseHistories.delete(oldestResponseId)
  }
}

function responsesToolsToChatTools(tools: unknown[] | undefined): unknown[] | undefined {
  if (!tools?.length) return undefined
  const chatTools = tools
    .map((tool) => {
      if (!tool || typeof tool !== 'object') return null
      const record = tool as Record<string, unknown>
      const name = record.name ?? record.type
      if (typeof name !== 'string' || !name) return null
      return {
        type: 'function',
        function: {
          name,
          description: typeof record.description === 'string' ? record.description : '',
          parameters: record.parameters ?? { type: 'object', properties: {} }
        }
      }
    })
    .filter(Boolean)

  return chatTools.length ? chatTools : undefined
}

function responsesToolChoiceToChatToolChoice(toolChoice: unknown): unknown {
  if (toolChoice === undefined || toolChoice === 'auto') return undefined
  if (toolChoice === 'none' || toolChoice === 'required') return toolChoice
  if (!toolChoice || typeof toolChoice !== 'object') return undefined

  const record = toolChoice as Record<string, unknown>
  const name = record.name ?? (record.function as Record<string, unknown> | undefined)?.name
  if (record.type === 'function' && typeof name === 'string') {
    return { type: 'function', function: { name } }
  }

  return undefined
}

function buildChatCompletionsBody(provider: Provider, body: ResponsesRequest, messages: ChatMessage[]): Record<string, unknown> {
  const chatBody: Record<string, unknown> = {
    model: body.model || provider.model_id,
    messages,
    stream: body.stream === true
  }
  const tools = responsesToolsToChatTools(body.tools)
  const toolChoice = responsesToolChoiceToChatToolChoice(body.tool_choice)
  if (tools) chatBody.tools = tools
  if (toolChoice !== undefined) chatBody.tool_choice = toolChoice
  if (body.temperature !== undefined) chatBody.temperature = body.temperature
  if (body.top_p !== undefined) chatBody.top_p = body.top_p
  if (body.max_output_tokens !== undefined) chatBody.max_tokens = body.max_output_tokens
  if (body.max_tokens !== undefined) chatBody.max_tokens = body.max_tokens
  return chatBody
}

async function fetchChatCompletions(provider: Provider, body: ResponsesRequest, messages: ChatMessage[]): Promise<Response> {
  return fetch(getChatCompletionsUrl(provider), {
    method: 'POST',
    headers: {
      authorization: `Bearer ${provider.api_key}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify(buildChatCompletionsBody(provider, body, messages))
  })
}

function chatPayloadToAssistantMessage(chatPayload: unknown): ChatMessage | null {
  if (!chatPayload || typeof chatPayload !== 'object') return null
  const choice = (chatPayload as { choices?: unknown[] }).choices?.[0]
  if (!choice || typeof choice !== 'object') return null
  const message = (choice as { message?: Record<string, unknown> }).message ?? {}
  const content = typeof message.content === 'string' ? message.content : ''
  const toolCalls = Array.isArray(message.tool_calls) ? (message.tool_calls as ChatToolCall[]) : undefined
  return { role: 'assistant', content, tool_calls: toolCalls }
}

function buildOutputItems(chatPayload: unknown): unknown[] {
  if (!chatPayload || typeof chatPayload !== 'object') return []
  const choice = (chatPayload as { choices?: unknown[] }).choices?.[0]
  if (!choice || typeof choice !== 'object') return []
  const message = (choice as { message?: Record<string, unknown> }).message ?? {}
  const output: unknown[] = []
  const content = typeof message.content === 'string' ? message.content : ''
  if (content) {
    output.push({
      id: createItemId('msg'),
      type: 'message',
      status: 'completed',
      role: 'assistant',
      content: [{ type: 'output_text', text: content, annotations: [] }]
    })
  }
  if (Array.isArray(message.tool_calls)) {
    for (const toolCall of message.tool_calls as ChatToolCall[]) {
      output.push({
        id: createItemId('fc'),
        type: 'function_call',
        status: 'completed',
        call_id: toolCall.id,
        name: toolCall.function.name,
        arguments: toolCall.function.arguments
      })
    }
  }
  return output
}

function buildResponsePayload(model: string | undefined, chatPayload: unknown, responseId: string): Record<string, unknown> {
  const output = buildOutputItems(chatPayload)
  const outputText = output
    .flatMap((item) => {
      if (!item || typeof item !== 'object' || (item as { type?: unknown }).type !== 'message') return []
      const content = (item as { content?: unknown[] }).content ?? []
      return content.map((part) => (part as { text?: unknown }).text).filter((text) => typeof text === 'string')
    })
    .join('')

  return {
    id: responseId,
    object: 'response',
    created_at: Math.floor(Date.now() / 1000),
    status: 'completed',
    model,
    output,
    output_text: outputText,
    usage: chatPayload && typeof chatPayload === 'object' ? ((chatPayload as { usage?: unknown }).usage ?? null) : null
  }
}

async function proxyNonStreaming(provider: Provider, body: ResponsesRequest, res: ServerResponse): Promise<void> {
  const responseId = createResponseId()
  const messages = messagesWithHistory(body)
  let upstream: Response
  try {
    upstream = await fetchChatCompletions(provider, { ...body, stream: false }, messages)
  } catch (error) {
    writeJson(res, 502, {
      error: {
        message: `无法连接 Chat Completions 上游：${error instanceof Error ? error.message : String(error)}`,
        type: 'proxy_connection_error'
      }
    })
    return
  }

  const text = await upstream.text()
  if (!upstream.ok) {
    writeUpstreamError(res, upstream.status, text)
    return
  }

  const chatPayload = safeJson(text)
  rememberResponseHistory(responseId, messages, chatPayloadToAssistantMessage(chatPayload))
  writeJson(res, 200, buildResponsePayload(body.model ?? provider.model_id, chatPayload, responseId))
}

function startTextOutput(res: ServerResponse, responseId: string, outputIndex: number): string {
  const itemId = createItemId('msg')
  writeSse(res, 'response.output_item.added', {
    type: 'response.output_item.added',
    response_id: responseId,
    output_index: outputIndex,
    item: { id: itemId, type: 'message', status: 'in_progress', role: 'assistant', content: [] }
  })
  writeSse(res, 'response.content_part.added', {
    type: 'response.content_part.added',
    response_id: responseId,
    item_id: itemId,
    output_index: outputIndex,
    content_index: 0,
    part: { type: 'output_text', text: '', annotations: [] }
  })
  return itemId
}

function finishTextOutput(res: ServerResponse, responseId: string, itemId: string, outputIndex: number, outputText: string): void {
  writeSse(res, 'response.output_text.done', {
    type: 'response.output_text.done',
    response_id: responseId,
    item_id: itemId,
    output_index: outputIndex,
    content_index: 0,
    text: outputText
  })
  writeSse(res, 'response.content_part.done', {
    type: 'response.content_part.done',
    response_id: responseId,
    item_id: itemId,
    output_index: outputIndex,
    content_index: 0,
    part: { type: 'output_text', text: outputText, annotations: [] }
  })
  writeSse(res, 'response.output_item.done', {
    type: 'response.output_item.done',
    response_id: responseId,
    output_index: outputIndex,
    item: {
      id: itemId,
      type: 'message',
      status: 'completed',
      role: 'assistant',
      content: [{ type: 'output_text', text: outputText, annotations: [] }]
    }
  })
}

function startToolCall(res: ServerResponse, responseId: string, outputIndex: number, id: string, name: string): StreamedToolCall {
  const toolCall: StreamedToolCall = {
    id,
    itemId: createItemId('fc'),
    outputIndex,
    name,
    arguments: ''
  }
  writeSse(res, 'response.output_item.added', {
    type: 'response.output_item.added',
    response_id: responseId,
    output_index: outputIndex,
    item: {
      id: toolCall.itemId,
      type: 'function_call',
      status: 'in_progress',
      call_id: toolCall.id,
      name: toolCall.name,
      arguments: ''
    }
  })
  return toolCall
}

function finishToolCall(res: ServerResponse, responseId: string, toolCall: StreamedToolCall): void {
  writeSse(res, 'response.function_call_arguments.done', {
    type: 'response.function_call_arguments.done',
    response_id: responseId,
    item_id: toolCall.itemId,
    output_index: toolCall.outputIndex,
    arguments: toolCall.arguments
  })
  writeSse(res, 'response.output_item.done', {
    type: 'response.output_item.done',
    response_id: responseId,
    output_index: toolCall.outputIndex,
    item: {
      id: toolCall.itemId,
      type: 'function_call',
      status: 'completed',
      call_id: toolCall.id,
      name: toolCall.name,
      arguments: toolCall.arguments
    }
  })
}

function parseSseDataBlocks(buffer: string): { data: string[]; rest: string } {
  const parts = buffer.split(/\r?\n\r?\n/)
  const rest = parts.pop() ?? ''
  const data = parts
    .map((part) =>
      part
        .split(/\r?\n/)
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trimStart())
        .join('\n')
    )
    .filter(Boolean)
  return { data, rest }
}

async function proxyStreaming(provider: Provider, body: ResponsesRequest, res: ServerResponse): Promise<void> {
  const responseId = createResponseId()
  const messages = messagesWithHistory(body)
  let upstream: Response
  try {
    upstream = await fetchChatCompletions(provider, { ...body, stream: true }, messages)
  } catch (error) {
    writeJson(res, 502, {
      error: {
        message: `无法连接 Chat Completions 上游：${error instanceof Error ? error.message : String(error)}`,
        type: 'proxy_connection_error'
      }
    })
    return
  }

  if (!upstream.ok) {
    writeUpstreamError(res, upstream.status, await upstream.text())
    return
  }

  if (!upstream.body) {
    writeJson(res, 502, { error: { message: 'Chat Completions 上游没有返回流式响应体', type: 'proxy_stream_error' } })
    return
  }

  res.writeHead(200, {
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-cache, no-transform',
    connection: 'keep-alive'
  })

  writeSse(res, 'response.created', {
    type: 'response.created',
    response: {
      id: responseId,
      object: 'response',
      created_at: Math.floor(Date.now() / 1000),
      status: 'in_progress',
      model: body.model ?? provider.model_id,
      output: []
    }
  })

  const decoder = new TextDecoder()
  let buffer = ''
  let outputText = ''
  let nextOutputIndex = 0
  let textItemId: string | null = null
  let textOutputIndex = -1
  const streamedToolCalls = new Map<number, StreamedToolCall>()

  try {
    for await (const chunk of upstream.body as unknown as AsyncIterable<Uint8Array>) {
      buffer += decoder.decode(chunk, { stream: true })
      const parsed = parseSseDataBlocks(buffer)
      buffer = parsed.rest

      for (const data of parsed.data) {
        if (data === '[DONE]') continue
        const payload = safeJson(data)
        if (!payload || typeof payload !== 'object') continue

        const choices = (payload as { choices?: unknown[] }).choices ?? []
        for (const choice of choices) {
          if (!choice || typeof choice !== 'object') continue
          const delta = (choice as { delta?: Record<string, unknown> }).delta ?? {}
          const content = delta.content

          if (typeof content === 'string' && content) {
            if (!textItemId) {
              textOutputIndex = nextOutputIndex
              nextOutputIndex += 1
              textItemId = startTextOutput(res, responseId, textOutputIndex)
            }
            outputText += content
            writeSse(res, 'response.output_text.delta', {
              type: 'response.output_text.delta',
              response_id: responseId,
              item_id: textItemId,
              output_index: textOutputIndex,
              content_index: 0,
              delta: content
            })
          }

          if (Array.isArray(delta.tool_calls)) {
            for (const toolDelta of delta.tool_calls as Array<Record<string, unknown>>) {
              const index = typeof toolDelta.index === 'number' ? toolDelta.index : streamedToolCalls.size
              const functionDelta = (toolDelta.function ?? {}) as Record<string, unknown>
              let toolCall = streamedToolCalls.get(index)
              if (!toolCall) {
                const callId = typeof toolDelta.id === 'string' ? toolDelta.id : createItemId('call')
                const name = typeof functionDelta.name === 'string' ? functionDelta.name : ''
                toolCall = startToolCall(res, responseId, nextOutputIndex, callId, name)
                nextOutputIndex += 1
                streamedToolCalls.set(index, toolCall)
              }
              if (!toolCall.name && typeof functionDelta.name === 'string') toolCall.name = functionDelta.name
              if (typeof functionDelta.arguments === 'string' && functionDelta.arguments) {
                toolCall.arguments += functionDelta.arguments
                writeSse(res, 'response.function_call_arguments.delta', {
                  type: 'response.function_call_arguments.delta',
                  response_id: responseId,
                  item_id: toolCall.itemId,
                  output_index: toolCall.outputIndex,
                  delta: functionDelta.arguments
                })
              }
            }
          }
        }
      }
    }

    if (textItemId) finishTextOutput(res, responseId, textItemId, textOutputIndex, outputText)
    for (const toolCall of streamedToolCalls.values()) finishToolCall(res, responseId, toolCall)

    const assistantToolCalls = [...streamedToolCalls.values()].map((toolCall) => ({
      id: toolCall.id,
      type: 'function' as const,
      function: { name: toolCall.name, arguments: toolCall.arguments }
    }))
    rememberResponseHistory(responseId, messages, {
      role: 'assistant',
      content: outputText,
      tool_calls: assistantToolCalls.length ? assistantToolCalls : undefined
    })

    const completedOutput: unknown[] = []
    if (textItemId) {
      completedOutput.push({
        id: textItemId,
        type: 'message',
        status: 'completed',
        role: 'assistant',
        content: [{ type: 'output_text', text: outputText, annotations: [] }]
      })
    }
    for (const toolCall of streamedToolCalls.values()) {
      completedOutput.push({
        id: toolCall.itemId,
        type: 'function_call',
        status: 'completed',
        call_id: toolCall.id,
        name: toolCall.name,
        arguments: toolCall.arguments
      })
    }

    writeSse(res, 'response.completed', {
      type: 'response.completed',
      response: {
        id: responseId,
        object: 'response',
        created_at: Math.floor(Date.now() / 1000),
        status: 'completed',
        model: body.model ?? provider.model_id,
        output: completedOutput,
        output_text: outputText
      }
    })
    res.end()
  } catch (error) {
    writeSse(res, 'response.failed', {
      type: 'response.failed',
      response: {
        id: responseId,
        status: 'failed',
        error: {
          message: error instanceof Error ? error.message : String(error),
          type: 'proxy_stream_error'
        }
      }
    })
    res.end()
  }
}

async function handleResponsesRequest(providerId: string, req: IncomingMessage, res: ServerResponse): Promise<void> {
  const provider = getProvider(providerId)
  if (!provider) {
    writeJson(res, 404, { error: { message: 'Provider not found', type: 'provider_not_found' } })
    return
  }

  let body: ResponsesRequest
  try {
    body = JSON.parse(await readRequestBody(req)) as ResponsesRequest
  } catch {
    writeJson(res, 400, { error: { message: 'Invalid JSON request body', type: 'invalid_request_error' } })
    return
  }

  if (body.stream) {
    await proxyStreaming(provider, body, res)
    return
  }

  await proxyNonStreaming(provider, body, res)
}

export function startCodexProxyServer(): void {
  if (codexProxyServer) return

  const server = createServer((req, res) => {
    void (async () => {
      if (!req.url || req.method !== 'POST') {
        writeJson(res, 404, { error: { message: 'Not found', type: 'not_found' } })
        return
      }

      const url = new URL(req.url, CODEX_PROXY_BASE_URL)
      const match = url.pathname.match(/^\/codex\/([^/]+)\/v1\/responses$/)
      if (!match) {
        writeJson(res, 404, { error: { message: 'Not found', type: 'not_found' } })
        return
      }

      await handleResponsesRequest(decodeURIComponent(match[1]), req, res)
    })().catch((error) => {
      console.error('Codex proxy error:', error)
      if (!res.headersSent) {
        writeJson(res, 500, {
          error: {
            message: error instanceof Error ? error.message : String(error),
            type: 'proxy_internal_error'
          }
        })
      } else {
        res.end()
      }
    })
  })

  codexProxyServer = server

  server.on('error', (error: NodeJS.ErrnoException) => {
    if (codexProxyServer === server) codexProxyServer = null
    if (error.code === 'EADDRINUSE') {
      console.warn(`Codex proxy server already listening at ${CODEX_PROXY_BASE_URL}`)
      return
    }
    console.error('Codex proxy server failed:', error)
  })

  server.listen(CODEX_PROXY_PORT, '127.0.0.1', () => {
    console.log(`Codex proxy server listening at ${CODEX_PROXY_BASE_URL}`)
  })
}

export function stopCodexProxyServer(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!codexProxyServer) {
      resolve()
      return
    }

    const server = codexProxyServer
    codexProxyServer = null
    server.close((error) => {
      if (error) reject(error)
      else resolve()
    })
  })
}
