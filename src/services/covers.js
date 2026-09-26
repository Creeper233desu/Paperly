export function chooseBookCover() {
  return new Promise((resolve, reject) => {
    uni.chooseImage({ count: 1, sizeType: ['compressed'], sourceType: ['album', 'camera'], success: result => {
      const tempFilePath = result.tempFilePaths?.[0]
      if (!tempFilePath) return reject(new Error('没有选中图片'))
      uni.saveFile({ tempFilePath, success: saved => resolve(saved.savedFilePath), fail: error => reject(new Error(error?.errMsg || '封面保存失败')) })
    }, fail: error => reject(new Error(error?.errMsg || '已取消选择')) })
  })
}
