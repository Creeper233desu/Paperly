import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { build } from 'esbuild'

test('reader pinch stays locked until enabled, prevents page zoom and resets between gestures', async () => {
  const source = readFileSync(new URL('../components/ReadingSurface.vue',import.meta.url),'utf8').match(/<script module="gestures" lang="renderjs">([\s\S]*?)<\/script>/)[1]
  const bundle = await build({ stdin:{contents:source,resolveDir:new URL('../components/',import.meta.url).pathname.replace(/^\/([A-Z]:)/,'$1')},write:false,bundle:true,format:'iife',globalName:'Gesture' })
  const sandbox = vm.createContext({})
  vm.runInContext(bundle.outputFiles[0].text,sandbox)
  const component = sandbox.Gesture.default, listeners = new Map(), scales = []
  let prevented = 0
  const host = { $el:{ addEventListener(name,fn,options) { listeners.set(name,fn); if (name === 'touchmove') assert.equal(options.passive,false) }, removeEventListener(name) { listeners.delete(name) } }, $ownerInstance:{ callMethod(name,ratio) { assert.equal(name,'pinch'); scales.push(ratio) } } }
  component.mounted.call(host)
  const event = distance => ({ touches:[{clientX:0,clientY:0},{clientX:distance,clientY:0}], preventDefault() { prevented++ } })
  component.methods.setEnabled.call(host,false)
  listeners.get('touchstart')(event(100)); listeners.get('touchmove')(event(150))
  assert.equal(scales.length,0)
  component.methods.setEnabled.call(host,true)
  listeners.get('touchstart')(event(100)); listeners.get('touchmove')(event(120))
  assert.equal(scales[0],1.2)
  listeners.get('touchend')(); listeners.get('touchstart')(event(300)); listeners.get('touchmove')(event(330))
  assert.equal(scales[1],1.1)
  component.methods.setEnabled.call(host,false)
  listeners.get('touchmove')(event(500)); assert.equal(scales.length,2)
  assert.equal(prevented,4)
  component.beforeUnmount.call(host); assert.equal(listeners.size,0)
})
