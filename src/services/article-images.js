import { chooseSavedImage } from './image-picker.js'

export function chooseArticleImage(api = uni) { return chooseSavedImage(api, '图片保存失败', { title: '裁切插图' }) }
