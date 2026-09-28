import { TEXT_TOOLS } from './assistant.js'

export const AI_PROVIDERS = [
  { id: 'openai', name: 'OpenAI', baseUrl: 'https://api.openai.com/v1' },
  { id: 'anthropic', name: 'Anthropic', baseUrl: 'https://api.anthropic.com/v1' },
  { id: 'kimi', name: 'Kimi', baseUrl: 'https://api.moonshot.ai/v1' },
  { id: 'deepseek', name: 'DeepSeek', baseUrl: 'https://api.deepseek.com' }
]

export function providerInfo(id) { return AI_PROVIDERS.find(item => item.id === id) || AI_PROVIDERS[0] }
export function providerBase(profile) { return (profile.baseUrl || providerInfo(profile.provider).baseUrl).trim().replace(/\/+$/, '') }
export function providerHeaders(profile) {
  const key = (profile.apiKey || '').trim()
  if (!key) throw new Error('请先填写 API Key')
  return profile.provider === 'anthropic'
    ? { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' }
    : { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }
}

function requestModelPage(url, header) {
  return new Promise((resolve, reject) => uni.request({
    url, method: 'GET', header, timeout: 30000,
    success: response => {
      if (response.statusCode < 200 || response.statusCode >= 300) return reject(new Error(response.data?.error?.message || `模型列表返回 ${response.statusCode}`))
      resolve(response.data)
    },
    fail: error => reject(new Error(error?.errMsg || '无法连接模型服务'))
  }))
}
export async function fetchProviderModels(profile) {
  const base = `${providerBase(profile)}/models`, header = providerHeaders(profile)
  const all = []
  let cursor = ''
  for (let page = 0; page < 10; page++) {
    const url = profile.provider === 'anthropic' ? `${base}?limit=1000${cursor ? `&after_id=${encodeURIComponent(cursor)}` : ''}` : base
    const result = await requestModelPage(url, header)
    all.push(...(result?.data || []).map(item => item.id).filter(Boolean))
    if (profile.provider !== 'anthropic' || !result?.has_more || !result?.last_id) break
    cursor = result.last_id
  }
  const models = [...new Set(all)].sort((a, b) => a.localeCompare(b))
  if (!models.length) throw new Error('连接成功，但没有取得可用模型')
  return models
}

export function supportsReasoning(profile) {
  if (!profile?.model) return false
  if (profile.provider === 'openai') return /^(o[1-9]|gpt-5|gpt-6)/i.test(profile.model)
  if (profile.provider === 'anthropic') return /claude-(opus|sonnet|haiku)-(?:4[-.]([6-9]|[1-9][0-9])|[5-9])/i.test(profile.model)
  if (profile.provider === 'deepseek') return true
  return false
}

export function buildChatRequest(profile, system, messages) {
  if (!profile?.model) throw new Error('请先从已获取的模型列表中选择模型')
  const headers = providerHeaders(profile)
  if (profile.provider === 'openai' && /^(gpt-[56]|o[1-9])/i.test(profile.model)) {
    const data = {
      model: profile.model, stream: true, store: false, instructions: system,
      input: messages.map(item => ({ role: item.role, content: item.content })),
      tools: TEXT_TOOLS.map(item => ({ type: 'function', name: item.function.name, description: item.function.description, parameters: item.function.parameters, strict: false })),
      tool_choice: 'auto'
    }
    if (supportsReasoning(profile)) data.reasoning = { summary: 'auto', ...(profile.effort !== 'auto' ? { effort: profile.effort } : {}) }
    return { url: `${providerBase(profile)}/responses`, headers, data, provider: 'openai-responses' }
  }
  if (profile.provider === 'anthropic') {
    const data = {
      model: profile.model, max_tokens: 4096, stream: true, system,
      messages: messages.map(item => ({ role: item.role, content: item.content })),
      tools: TEXT_TOOLS.map(item => ({ name: item.function.name, description: item.function.description, input_schema: item.function.parameters }))
    }
    if (supportsReasoning(profile)) {
      data.thinking = { type: 'adaptive' }
      if (profile.effort !== 'auto') data.output_config = { effort: profile.effort }
    }
    return { url: `${providerBase(profile)}/messages`, headers, data, provider: 'anthropic' }
  }
  const data = {
    model: profile.model, stream: true,
    messages: [{ role: 'system', content: system }, ...messages.map(item => ({ role: item.role, content: item.content }))],
    tools: TEXT_TOOLS, tool_choice: 'auto'
  }
  if (supportsReasoning(profile)) {
    if (profile.provider === 'deepseek') {
      data.thinking = { type: 'enabled' }
      if (['high', 'max'].includes(profile.effort)) data.reasoning_effort = profile.effort
    }
    else if (profile.effort !== 'auto') data.reasoning_effort = profile.effort
  }
  return { url: `${providerBase(profile)}/chat/completions`, headers, data, provider: profile.provider }
}

export function createSseDecoder(onEvent) {
  let buffer = ''
  function consume(block) {
    let event = 'message', data = ''
    for (const line of block.split('\n')) {
      if (line.startsWith('event:')) event = line.slice(6).trim()
      if (line.startsWith('data:')) data += line.slice(5).trimStart() + '\n'
    }
    if (data) onEvent({ event, data: data.trimEnd() })
  }
  return {
    push(chunk) {
      buffer += String(chunk)
      buffer = buffer.replace(/\r\n/g, '\n').replace(/\r(?!$)/g, '\n')
      let end
      while ((end = buffer.indexOf('\n\n')) >= 0) { consume(buffer.slice(0, end)); buffer = buffer.slice(end + 2) }
    },
    finish() { buffer = buffer.replace(/\r\n?/g, '\n'); if (buffer.trim()) consume(buffer); buffer = '' }
  }
}

export function createChatAccumulator(provider, onUpdate = () => {}) {
  const result = { content: '', thinking: '', calls: [] }
  const tools = new Map(), blocks = new Map()
  function emit() { onUpdate({ ...result, calls: [...result.calls] }) }
  function feed(event) {
    if (event.data === '[DONE]') return
    let data
    try { data = JSON.parse(event.data) } catch (_) { return }
    if (data.error || data.type === 'response.failed' || data.type === 'error') throw new Error(data.error?.message || data.response?.error?.message || '模型服务返回错误')
    if (provider === 'openai-responses') {
      if (data.type === 'response.output_text.delta') result.content += data.delta || ''
      if (data.type === 'response.reasoning_summary_text.delta') result.thinking += data.delta || ''
      if (data.type === 'response.output_item.added' && data.item?.type === 'function_call') tools.set(data.output_index, { name: data.item.name, argsText: data.item.arguments || '' })
      if (data.type === 'response.function_call_arguments.delta') {
        const call = tools.get(data.output_index) || { name: '', argsText: '' }
        call.argsText += data.delta || ''; tools.set(data.output_index, call)
      }
      if (data.type === 'response.function_call_arguments.done') {
        const call = tools.get(data.output_index) || { name: '', argsText: '' }
        call.argsText = data.arguments || call.argsText; tools.set(data.output_index, call)
      }
      if (data.type === 'response.output_item.done' && data.item?.type === 'function_call') {
        const call = tools.get(data.output_index) || { name: '', argsText: '' }
        call.name = data.item.name || call.name; call.argsText = data.item.arguments || call.argsText; tools.set(data.output_index, call)
      }
      if (data.type === 'response.completed') {
        for (const item of data.response?.output || []) {
          if (item.type === 'message' && !result.content) result.content = (item.content || []).filter(part => part.type === 'output_text').map(part => part.text).join('')
          if (item.type === 'reasoning' && !result.thinking) result.thinking = (item.summary || []).map(part => part.text).join('\n')
          if (item.type === 'function_call' && ![...tools.values()].some(call => call.name === item.name && call.argsText === item.arguments)) tools.set(`completed-${tools.size}`, { name: item.name, argsText: item.arguments })
        }
      }
    } else if (provider === 'anthropic') {
      if (event.event === 'content_block_start') blocks.set(data.index, { ...data.content_block, partial: '' })
      if (event.event === 'content_block_delta') {
        const delta = data.delta || {}
        if (delta.type === 'text_delta') result.content += delta.text || ''
        if (delta.type === 'thinking_delta') result.thinking += delta.thinking || ''
        if (delta.type === 'input_json_delta') { const block = blocks.get(data.index); if (block) block.partial += delta.partial_json || '' }
      }
      if (event.event === 'content_block_stop') {
        const block = blocks.get(data.index)
        if (block?.type === 'tool_use') {
          let args = block.input || {}
          try { if (block.partial) args = JSON.parse(block.partial) } catch (_) { args = {} }
          result.calls.push({ name: block.name, args })
        }
      }
    } else {
      const delta = data.choices?.[0]?.delta || {}
      if (delta.content) result.content += delta.content
      if (delta.reasoning_content) result.thinking += delta.reasoning_content
      for (const call of delta.tool_calls || []) {
        const index = call.index ?? 0
        const entry = tools.get(index) || { name: '', argsText: '' }
        if (call.function?.name) entry.name = call.function.name
        if (call.function?.arguments) entry.argsText += call.function.arguments
        tools.set(index, entry)
      }
    }
    emit()
  }
  function finish() {
    if (provider !== 'anthropic') for (const call of [...tools.values()]) {
      try { result.calls.push({ name: call.name, args: JSON.parse(call.argsText || '{}') }) }
      catch (_) { result.calls.push({ name: call.name, args: {}, error: '工具参数无法解析' }) }
    }
    emit()
    return result
  }
  return { feed, finish, result }
}

const activeStreamReaders = new Set()

// Android may defer XHR progress/completion callbacks while the app is in background.
export function flushActiveStreams() { for (const read of [...activeStreamReaders]) read() }

export function parseCompleteChat(provider, data) {
  if (provider === 'openai-responses') {
    const output = data?.output || []
    return {
      content: output.filter(item => item.type === 'message').flatMap(item => item.content || []).filter(item => item.type === 'output_text').map(item => item.text || '').join(''),
      thinking: output.filter(item => item.type === 'reasoning').flatMap(item => item.summary || []).map(item => item.text || '').join('\n'),
      calls: output.filter(item => item.type === 'function_call').map(item => ({ name: item.name, args: JSON.parse(item.arguments || '{}') }))
    }
  }
  if (provider === 'anthropic') return {
    content: (data?.content || []).filter(item => item.type === 'text').map(item => item.text || '').join(''),
    thinking: (data?.content || []).filter(item => item.type === 'thinking').map(item => item.thinking || '').join('\n'),
    calls: (data?.content || []).filter(item => item.type === 'tool_use').map(item => ({ name: item.name, args: item.input || {} }))
  }
  const message = data?.choices?.[0]?.message || {}
  return { content: message.content || '', thinking: message.reasoning_content || '', calls: (message.tool_calls || []).map(item => ({ name: item.function?.name, args: JSON.parse(item.function?.arguments || '{}') })) }
}

export function requestCompleteChat(request) {
  return new Promise((resolve, reject) => {
    if (typeof plus === 'undefined' || !plus.net?.XMLHttpRequest) return reject(new Error('当前运行环境不支持模型请求'))
    const xhr = new plus.net.XMLHttpRequest()
    try {
      xhr.open('POST', request.url, true)
      xhr.timeout = 180000
      for (const [name, value] of Object.entries(request.headers)) xhr.setRequestHeader(name, value)
      xhr.onload = () => {
        if (xhr.status < 200 || xhr.status >= 300) return reject(new Error(`模型服务返回 ${xhr.status}`))
        try { resolve(parseCompleteChat(request.provider, JSON.parse(xhr.responseText || '{}'))) }
        catch (error) { reject(new Error(`无法解析模型响应：${error.message}`)) }
      }
      xhr.onerror = () => reject(new Error('网络请求中断'))
      xhr.ontimeout = () => reject(new Error('模型响应超时'))
      xhr.send(JSON.stringify({ ...request.data, stream: false }))
    } catch (error) { reject(error) }
  })
}

// The request lives in the logic layer, independently of editor/sidebar components.
export function streamChat(request, onEvent) {
  return new Promise((resolve, reject) => {
    if (typeof plus === 'undefined' || !plus.net?.XMLHttpRequest) return reject(new Error('当前运行环境不支持应用内流式请求'))
    const xhr = new plus.net.XMLHttpRequest()
    let consumed = 0, settled = false
    const decoder = createSseDecoder(onEvent)
    const ingest = () => {
      if (settled) return
      let value = ''
      try { value = xhr.responseText || '' } catch (_) { return }
      if (value.length > consumed) {
        try { decoder.push(value.slice(consumed)); consumed = value.length }
        catch (error) { fail(error) }
      }
    }
    const fail = error => { if (!settled) { settled = true; activeStreamReaders.delete(resume); reject(error instanceof Error ? error : new Error(String(error))) } }
    const complete = (force = false) => {
      if (settled || (!force && xhr.readyState !== 4)) return
      try {
        ingest()
        if (settled) return
        if (xhr.status < 200 || xhr.status >= 300) {
          let message = `模型服务返回 ${xhr.status}`
          try { message = JSON.parse(xhr.responseText).error?.message || message } catch (_) { /* keep status */ }
          throw new Error(message)
        }
        decoder.finish(); settled = true; activeStreamReaders.delete(resume); resolve()
      } catch (error) { fail(error) }
    }
    const resume = () => { ingest(); complete() }
    activeStreamReaders.add(resume)
    xhr.onprogress = ingest
    xhr.onreadystatechange = () => { if (xhr.readyState === 3) ingest(); else if (xhr.readyState === 4) complete() }
    xhr.onerror = () => fail(new Error('网络请求中断'))
    xhr.ontimeout = () => fail(new Error('模型响应超时'))
    xhr.onload = () => complete(true)
    try {
      xhr.open('POST', request.url, true)
      xhr.timeout = 180000
      for (const [name, value] of Object.entries(request.headers)) xhr.setRequestHeader(name, value)
      xhr.send(JSON.stringify(request.data))
    } catch (error) { fail(error) }
  })
}
