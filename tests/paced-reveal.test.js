import test from 'node:test'
import assert from 'node:assert/strict'
import { createPacedReveal } from '../src/utils/paced-reveal.js'

test('a complete buffered answer still appears through several visible updates', async () => {
  const frames = []
  const reveal = createPacedReveal(value => frames.push(value), 1)
  reveal.push({ thinking: '先分析原文', content: '第一段第二段' })
  assert.equal(frames.length, 0)
  await reveal.finish()
  assert.ok(frames.length > 2)
  assert.ok(frames.findIndex(frame => frame.content) > 0)
  assert.ok(frames.some(frame => frame.content && frame.content !== '第一段第二段'))
  assert.deepEqual(frames.at(-1), { thinking: '先分析原文', content: '第一段第二段' })
})

test('long buffered replies complete in a bounded number of animation steps', async () => {
  const frames = []
  const reveal = createPacedReveal(value => frames.push(value.content.length), 1)
  reveal.push({ content: '字'.repeat(3600) })
  await reveal.finish()
  assert.ok(frames.length <= 120)
  assert.equal(frames.at(-1), 3600)
})
