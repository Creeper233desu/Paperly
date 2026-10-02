import { chooseSavedImage } from './image-picker.js'

export async function chooseBookCover(api = uni) {
  const image = await chooseSavedImage(api, '封面保存失败')
  return image.path
}
