import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { parse, compileTemplate } from '@vue/compiler-sfc'
import { localizeMessage, setLanguage, t, translations } from '../src/i18n.js'

function files(root) {
  return readdirSync(root, { withFileTypes:true }).flatMap(item => item.isDirectory() ? files(join(root, item.name)) : item.name.endsWith('.vue') ? [join(root, item.name)] : [])
}

test('language switching resolves English and Japanese UI messages and variables', () => {
  setLanguage('en-US')
  assert.equal(t('书架'), 'Library')
  assert.equal(t('{chapters} 章 · {articles} 篇', { chapters:2, articles:3 }), '2 chapters · 3 articles')
  setLanguage('ja-JP')
  assert.equal(t('书架'), '本棚')
  assert.equal(t('{chapters} 章 · {articles} 篇', { chapters:2, articles:3 }), '2 章 · 3 編')
  setLanguage('zh-CN')
  assert.equal(t('书架'), '书架')
  setLanguage('unknown')
  assert.equal(t('书架'), '书架')
})

test('runtime errors with values follow the selected language', () => {
  setLanguage('en-US')
  assert.equal(localizeMessage('模型服务返回 500'), 'Model provider returned 500')
  setLanguage('ja-JP')
  assert.equal(localizeMessage('无法恢复数据：所有已完成的备份均不可用（未知错误）'), 'データを復元できません。完了済みのバックアップがすべて利用できません（不明なエラー）')
  setLanguage('zh-CN')
})

test('translated Vue templates compile and every literal UI key has both translations', () => {
  const missing = []
  for (const path of [...files('pages'), ...files('components')]) {
    const source = readFileSync(path, 'utf8')
    const { descriptor, errors } = parse(source, { filename:path })
    // uni-app renderjs uses an additional <script module="..."> block.
    if (!source.includes('<script module=')) assert.deepEqual(errors, [], `${path} SFC parse`)
    if (descriptor.template) {
      const compiled = compileTemplate({ source:descriptor.template.content, filename:path, id:path })
      assert.deepEqual(compiled.errors, [], `${path} template compile`)
    }
    for (const match of source.matchAll(/\b(?:\$t|t)\('((?:\\'|[^'])*)'/g)) {
      const key = match[1].replace(/\\'/g, "'")
      for (const locale of ['en-US', 'ja-JP']) if (!translations[locale][key]) missing.push(`${path}: ${locale}: ${key}`)
    }
  }
  assert.deepEqual(missing, [])
})
