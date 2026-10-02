import { chooseSavedImage } from './image-picker.js'

export async function chooseBookCover(api = uni) {
  const image = await chooseSavedImage(api, '封面保存失败', { title: '裁切封面', ratio: 7 / 10, lockAspect: true, maxEdge: 1600 })
  return image.path
}
