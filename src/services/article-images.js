export function chooseArticleImage(api = uni) {
  return new Promise((resolve, reject) => api.chooseImage({ count: 1, sizeType: ['compressed'], sourceType: ['album'],
    success: picked => {
      const tempFilePath = picked.tempFilePaths?.[0]
      if (!tempFilePath) return reject(new Error('没有选中图片'))
      api.getImageInfo({ src: tempFilePath,
        success: info => api.saveFile({ tempFilePath,
          success: saved => resolve({ path: saved.savedFilePath, width: info.width || 0, height: info.height || 0 }),
          fail: error => reject(new Error(error?.errMsg || '图片保存失败'))
        }),
        fail: error => reject(new Error(error?.errMsg || '无法读取图片'))
      })
    },
    fail: error => reject(new Error(error?.errMsg || '已取消选择'))
  }))
}
