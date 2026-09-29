import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { translations } from '../src/i18n.js'

function files(root) {
  return readdirSync(root, { withFileTypes:true }).flatMap(item => item.isDirectory() ? files(join(root, item.name)) : item.name.endsWith('.vue') ? [join(root, item.name)] : [])
}

const used = new Set()
const dynamic = new Set()
const attributes = new Set()
for (const path of [...files('pages'), ...files('components')]) {
  const source = readFileSync(path, 'utf8')
  for (const match of source.matchAll(/\$t\('((?:\\'|[^'])*)'\)/g)) used.add(match[1].replace(/\\'/g, "'"))
  const template = source.split('</template>')[0].replace(/\$t\('(?:\\'|[^'])*'\)/g, '')
  for (const match of template.matchAll(/{{([\s\S]*?)}}/g)) if (/[\u3400-\u9fff]/u.test(match[1])) dynamic.add(`${path}: ${match[1].trim()}`)
  for (const match of template.matchAll(/\b(?:placeholder|title|subtitle|message|confirm-text|cancel-text|aria-label)="([^"<>]*[\u3400-\u9fff][^"<>]*)"/g)) attributes.add(`${path}: ${match[0]}`)
}
for (const locale of ['en-US', 'ja-JP']) {
  const missing = [...used].filter(key => !translations[locale]?.[key]).sort()
  console.log(`${locale}: ${used.size - missing.length}/${used.size} template phrases translated`)
  if (missing.length) console.log(missing.join('\n'))
}
if (process.argv.includes('--remaining')) {
  console.log(`\nDynamic expressions (${dynamic.size}):\n${[...dynamic].join('\n')}`)
  console.log(`\nStatic attributes (${attributes.size}):\n${[...attributes].join('\n')}`)
}
