import test from 'node:test'
import assert from 'node:assert/strict'
import { contextUsage, estimateTokens, formatTokenCount } from '../src/utils/context-usage.js'

test('context meter estimates the next request and labels optional window capacity', () => {
  const preview = contextUsage({ system: '第一章内容', summary: '旧消息', messages: [{ content: '请修改开头' }, { content: '可以。' }], draft: '再写一点', limit: 100 })
  assert.ok(preview.book > 0 && preview.older > 0 && preview.question > 0)
  assert.equal(preview.total, preview.book + preview.older + preview.recent + preview.question)
  assert.equal(preview.percent, Math.round(preview.total))
  assert.equal(contextUsage({ system: '你好' }).window, 0)
  assert.equal(estimateTokens(''), 0)
  assert.equal(formatTokenCount(1250), '1.3k')
})
