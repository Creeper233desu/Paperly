import { deflateSync } from 'node:zlib'
import { writeFileSync } from 'node:fs'

// A small, real PDF with compressed Chinese text streams and a ToUnicode map.
// The fixture is authored here; no user-provided books are committed.
const utf16 = text => Buffer.from(text, 'utf16le').swap16().toString('hex').toUpperCase()
export function samplePdf({ blank = false, builtinMap = false, images = false, inline = false } = {}) {
  const objects = []
  const add = value => { objects.push(Buffer.isBuffer(value) ? value : Buffer.from(value, 'ascii')); return objects.length }
  const stream = (text, compressed = false, dictionary = '') => {
    const raw = Buffer.isBuffer(text) ? text : Buffer.from(text, 'ascii')
    const data = compressed ? deflateSync(raw) : raw
    return Buffer.concat([Buffer.from(`<< /Length ${data.length}${compressed ? ' /Filter /FlateDecode' : ''} ${dictionary} >>\nstream\n`), data, Buffer.from('\nendstream')])
  }
  add('<< /Type /Catalog /Pages 2 0 R >>')
  add('<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>')
  for (const content of [5, 6]) add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 7 0 R >> ${images ? '/XObject << /Im1 12 0 R >>' : ''} >> /Contents ${content} 0 R >>`)
  const first = ['第一章 初见', '第一节 清晨', '清晨的书店刚刚开门。', '她推开窗，街上的风', '穿过树影，落在书页间。']
  const second = ['第二章 回声', '这是第二章的正文。', '最后一行保留了中文标点：你好，世界！']
  const content = lines => lines.map((line, index) => `BT /F1 ${index === 0 ? 22 : 14} Tf 1 0 0 1 54 ${760 - index * 24 - ((images || inline) && index >= 3 ? 120 : 0)} Tm <${utf16(line)}> Tj ET`).join('\n')
  const picture = images ? '\nq 120 0 0 80 54 620 cm /Im1 Do Q' : inline ? '\nq 120 0 0 80 54 620 cm BI /W 2 /H 2 /CS /RGB /BPC 8 ID \xFF\x00\x00\x00\xFF\x00\x00\x00\xFF\xFF\xFF\x00 EI Q' : ''
  add(stream((blank ? '' : content(first)) + picture, true)); add(stream((blank ? '' : content(second)) + picture, true))
  add(`<< /Type /Font /Subtype /Type0 /BaseFont /STSong-Light /Encoding /${builtinMap ? 'UniGB-UCS2-H' : 'Identity-H'} /DescendantFonts [8 0 R] ${builtinMap ? '' : '/ToUnicode 9 0 R'} >>`)
  add('<< /Type /Font /Subtype /CIDFontType0 /BaseFont /STSong-Light /CIDSystemInfo << /Registry (Adobe) /Ordering (GB1) /Supplement 4 >> /DW 1000 /FontDescriptor 11 0 R >>')
  const chars = [...new Set([...first.join(''), ...second.join('')])]
  add(stream(`/CIDInit /ProcSet findresource begin\n12 dict begin\nbegincmap\n/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def\n/CMapName /Test def\n/CMapType 2 def\n1 begincodespacerange\n<0000> <FFFF>\nendcodespacerange\n${chars.length} beginbfchar\n${chars.map(char => `<${utf16(char)}> <${utf16(char)}>`).join('\n')}\nendbfchar\nendcmap\nCMapName currentdict /CMap defineresource pop\nend\nend`, true))
  add(`<< /Title <FEFF${utf16('纸间 PDF 导入示例')}> /Author <FEFF${utf16('测试作者')}> /Subject <FEFF${utf16('中文文字层、压缩流与章节识别')}> >>`)
  add('<< /Type /FontDescriptor /FontName /STSong-Light /Flags 6 /FontBBox [0 -200 1000 900] /ItalicAngle 0 /Ascent 900 /Descent -200 /CapHeight 700 /StemV 80 >>')
  if (images) {
    add(stream(Buffer.from([255, 0, 0, 0, 255, 0, 0, 0, 255, 255, 255, 0]), true, '/Type /XObject /Subtype /Image /Width 2 /Height 2 /ColorSpace /DeviceRGB /BitsPerComponent 8 /SMask 13 0 R'))
    add(stream(Buffer.from([255, 128, 0, 255]), true, '/Type /XObject /Subtype /Image /Width 2 /Height 2 /ColorSpace /DeviceGray /BitsPerComponent 8'))
  }
  let offset = 9
  const buffers = [Buffer.from('%PDF-1.7\n')], offsets = [0]
  objects.forEach((object, index) => {
    offsets.push(offset)
    const entry = Buffer.concat([Buffer.from(`${index + 1} 0 obj\n`), object, Buffer.from('\nendobj\n')])
    buffers.push(entry); offset += entry.length
  })
  buffers.push(Buffer.from(`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map(value => `${String(value).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info 10 0 R >>\nstartxref\n${offset}\n%%EOF\n`))
  return Buffer.concat(buffers)
}
if (process.argv[1]?.replace(/\\/g, '/').endsWith('/create-pdf-fixture.mjs')) {
  writeFileSync(new URL('../fixtures/pdf-import-sample.pdf', import.meta.url), samplePdf())
  writeFileSync(new URL('../fixtures/pdf-images-sample.pdf', import.meta.url), samplePdf({ images: true }))
}
