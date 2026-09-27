import test from 'node:test'
import assert from 'node:assert/strict'
import { AI_PROVIDERS, buildChatRequest, createChatAccumulator, createSseDecoder, fetchProviderModels, streamChat } from '../src/services/ai-providers.js'
import { prepareImageExport, takeImageExport } from '../src/store/image-export-draft.js'

test('provider model lists come from the selected endpoint and are not fixed in the app', async () => {
  let requested
  globalThis.uni = { request: options => { requested = options; options.success({ statusCode: 200, data: { data: [{ id: 'model-z' }, { id: 'model-a' }] } }) } }
  const models = await fetchProviderModels({ provider: 'anthropic', apiKey: 'key', baseUrl: 'https://api.anthropic.com/v1/' })
  assert.deepEqual(models, ['model-a', 'model-z'])
  assert.equal(requested.url, 'https://api.anthropic.com/v1/models?limit=1000')
  assert.equal(requested.header['x-api-key'], 'key')
  assert.equal(AI_PROVIDERS.length, 4)
})

test('Anthropic model listing follows pagination cursors', async () => {
  const urls = []
  globalThis.uni = { request: options => {
    urls.push(options.url)
    options.success({ statusCode: 200, data: urls.length === 1
      ? { data: [{ id: 'first' }], has_more: true, last_id: 'first' }
      : { data: [{ id: 'second' }], has_more: false, last_id: 'second' } })
  } }
  assert.deepEqual(await fetchProviderModels({ provider: 'anthropic', apiKey: 'key' }), ['first', 'second'])
  assert.match(urls[1], /after_id=first/)
})

test('OpenAI-compatible and Anthropic requests preserve only proposed insert/delete tools', () => {
  const openai = buildChatRequest({ provider: 'openai', apiKey: 'key', model: 'gpt-5-test', effort: 'high' }, 'system', [{ role: 'user', content: 'hello' }])
  assert.equal(openai.data.stream, true)
  assert.equal(openai.url, 'https://api.openai.com/v1/responses')
  assert.equal(openai.data.reasoning.effort, 'high')
  assert.equal(openai.data.reasoning.summary, 'auto')
  assert.deepEqual(openai.data.tools.map(item => item.name), ['insert_text', 'delete_text'])
  const anthropic = buildChatRequest({ provider: 'anthropic', apiKey: 'key', model: 'claude-sonnet-4-6', effort: 'medium' }, 'system', [{ role: 'user', content: 'hello' }])
  assert.equal(anthropic.url, 'https://api.anthropic.com/v1/messages')
  assert.equal(anthropic.data.system, 'system')
  assert.deepEqual(anthropic.data.tools.map(item => item.name), ['insert_text', 'delete_text'])
  assert.equal(anthropic.data.output_config.effort, 'medium')
  assert.deepEqual(anthropic.data.thinking, { type: 'adaptive' })
  const deepseek = buildChatRequest({ provider: 'deepseek', apiKey: 'key', model: 'server-listed-model', effort: 'max' }, 'system', [{ role: 'user', content: 'hello' }])
  assert.deepEqual(deepseek.data.thinking, { type: 'enabled' })
  assert.equal(deepseek.data.reasoning_effort, 'max')
})

test('OpenAI Responses stream collects visible text, reasoning summaries and tool calls', () => {
  const accumulator = createChatAccumulator('openai-responses')
  const feed = data => accumulator.feed({ event: data.type, data: JSON.stringify(data) })
  feed({ type: 'response.reasoning_summary_text.delta', delta: '推理摘要' })
  feed({ type: 'response.output_text.delta', delta: '建议' })
  feed({ type: 'response.output_item.added', output_index: 1, item: { type: 'function_call', name: 'insert_text', arguments: '' } })
  feed({ type: 'response.function_call_arguments.delta', output_index: 1, delta: '{"article_id":"a",' })
  feed({ type: 'response.function_call_arguments.done', output_index: 1, arguments: '{"article_id":"a","after":"","text":"序"}' })
  const result = accumulator.finish()
  assert.equal(result.content, '建议')
  assert.equal(result.thinking, '推理摘要')
  assert.deepEqual(result.calls, [{ name: 'insert_text', args: { article_id: 'a', after: '', text: '序' } }])
})

test('split SSE chunks accumulate text, thinking and tool arguments', () => {
  const updates = []
  const accumulator = createChatAccumulator('deepseek', value => updates.push(value))
  const decoder = createSseDecoder(event => accumulator.feed(event))
  decoder.push('data: {"choices":[{"delta":{"reasoning_content":"先看"}}]}\n\ndata: {"choices":[{"delta":{"content":"建议"}}]}\n\nda')
  decoder.push('ta: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"name":"insert_text","arguments":"{\\"article_id\\":\\"a\\","}}]}}]}\n\n')
  decoder.push('data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"\\"after\\":\\"甲\\",\\"text\\":\\"乙\\"}"}}]}}]}\n\ndata: [DONE]\n\n')
  const result = accumulator.finish()
  assert.equal(result.thinking, '先看')
  assert.equal(result.content, '建议')
  assert.deepEqual(result.calls, [{ name: 'insert_text', args: { article_id: 'a', after: '甲', text: '乙' } }])
  assert.ok(updates.length >= 3)
})

test('Anthropic stream exposes only server-provided thinking and tool calls', () => {
  const accumulator = createChatAccumulator('anthropic')
  const feed = (event, data) => accumulator.feed({ event, data: JSON.stringify(data) })
  feed('content_block_start', { index: 0, content_block: { type: 'thinking' } })
  feed('content_block_delta', { index: 0, delta: { type: 'thinking_delta', thinking: '分析原文' } })
  feed('content_block_start', { index: 1, content_block: { type: 'text' } })
  feed('content_block_delta', { index: 1, delta: { type: 'text_delta', text: '可这样写' } })
  feed('content_block_start', { index: 2, content_block: { type: 'tool_use', name: 'delete_text', input: {} } })
  feed('content_block_delta', { index: 2, delta: { type: 'input_json_delta', partial_json: '{"article_id":"a","text":"旧"}' } })
  feed('content_block_stop', { index: 2 })
  const result = accumulator.finish()
  assert.equal(result.thinking, '分析原文')
  assert.equal(result.content, '可这样写')
  assert.deepEqual(result.calls, [{ name: 'delete_text', args: { article_id: 'a', text: '旧' } }])
})

test('the app XHR transport dispatches progress before completion', async () => {
  const seen = []
  class FakeXHR {
    open() {}
    setRequestHeader() {}
    send() {
      this.readyState = 3
      this.responseText = 'data: {"choices":[{"delta":{"content":"前"}}]}\n\n'
      this.onprogress()
      seen.push('still running')
      this.responseText += 'data: {"choices":[{"delta":{"content":"后"}}]}\n\n'
      this.status = 200
      this.onload()
    }
  }
  globalThis.plus = { net: { XMLHttpRequest: FakeXHR } }
  await streamChat({ url: 'https://example.com', headers: {}, data: {} }, event => seen.push(JSON.parse(event.data).choices[0].delta.content))
  assert.deepEqual(seen, ['前', 'still running', '后'])
  delete globalThis.plus
})

test('editor image selection survives navigation without entering the URL', () => {
  const storage = new Map()
  globalThis.uni = { setStorageSync: (key, value) => storage.set(key, value), getStorageSync: key => storage.get(key), removeStorageSync: key => storage.delete(key) }
  prepareImageExport({ bookId: 'book', articleId: 'article', start: 2, end: 5, text: '文字' })
  const draft = takeImageExport()
  assert.equal(draft.text, '文字')
  assert.equal(takeImageExport(), null)
})
