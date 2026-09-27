# 纸间

面向 Android 平板的 Vue 3 / uni-app 本地写作应用。直接在 HBuilderX 打开项目根目录运行或云打包。正文按纯文本段落保存，界面为 app-vue WebView。

## 运行与打包

1. 在 HBuilderX 中打开本目录，运行到 Android 平板或模拟器。
2. 重新打包安装应用，`manifest.json` 中新增的横竖屏方向配置才会生效；热更新页面无法改变已经安装的原生屏幕方向声明。
3. 通过“发行 → 原生 App 云打包”生成 APK。`manifest.json` 已有 AppID，如更换 DCloud 账号，请在 HBuilderX 中确认 AppID 归属。

HBuilderX 使用内置 Vue 3 / uni-app 编译器。单元测试可运行 `npm install`、`npm test`。

## 功能与结构

- `pages/library`：书架、统计、设置共用的主页面；三个内容面板平行滑动，底部导航固定。
- `components/StatisticsPanel.vue`：近半年每日净字数热力图、每日书籍与篇章来源。
- `pages/book`：可折叠的章节与正文目录、接续上次写作、文本筛选、PDF 与图片导出。
- `pages/export-image`：从单篇正文选择连续文字，预览浅色或深色卡片，可选书名信息，生成带“纸间”标识的 PNG 并保存相册或打开 Android 系统分享面板。私有图片路径在部分高版本 Android 上不能直接分享时，会引导从相册选择刚保存的图片。
- `pages/editor`：连续文本编辑、回车后自然段首行缩进、实时字数统计、全书篇章侧栏、段落聚焦、标点补全、撤销重做、前后查找与替换、沉浸模式、动画光标，以及长按后的复制、粘贴、剪切、全选菜单。侧栏切换正文只更新编辑内容，不重建整个页面；工具栏操作保留页面滚动位置，查找将光标移到匹配末尾。聚焦与动画光标分别同步到 renderjs；动画在主动移动光标或换行时播放，普通输入与删除不触发。`DocumentInput` 先显示正文并保留可输入的备用控件，待 renderjs 成功接管后启用逐段编辑；正文更新带篇章版本号，避免旧篇章的延迟更新覆盖新篇章。缩进由段落样式绘制，不写入正文；旧版自动生成的全角空格在打开正文时清理。
- `pages/settings`：外观、字体、编辑体验和 AI 助手分为四个入口，具体选项在居中弹窗中设置；动画光标可选经典竖线或 Neovim 方块样式，设置中可查看实时运动预览。自定义颜色在应用内色板中选取。已导入字体显示独立预览。DeepSeek API Key 与模型保存在本机设置，可用模型列表接口测试连通。光标运动参考的第三方项目许可见 `THIRD_PARTY_NOTICES.md`。
- `components`：底部导航、连续正文输入、应用内操作菜单、确认对话框。
- `src/store`：书库、设置、每日统计的本地 JSON 持久化与主导航状态。
- `src/services`：Android PDF、PNG 绘制、封面持久化、字体导入与加载，以及 DeepSeek 聊天和正文增删提案。AI 只接收当前书本的限长上下文，改动按差异显示；用户逐项接受后核对正文未变化，再经现有保存入口记录净字数。
- `src/utils/text.js`：可单独测试的编辑与替换逻辑。

书库的存储键为 `paperwriter.library.v1`，层级为 `books[] → chapters[] → articles[] → paragraphs[]`。每本书的 `lastEdited` 保存最近写作的篇章与光标位置。旧书缺少作者、封面或写作位置字段时仍可正常读取。设置存于 `paperwriter.preferences.v1`，统计存于 `paperwriter.statistics.v1`。每日统计按本地日期保存正文净字数变化，删除正文、章节或书籍也计入负数，并保留当日书籍和篇章来源；安装本版本前的历史写作不会补算。所有数据均保存在本机应用存储，无服务端和加密；卸载应用会清除本地书库与统计。

AI 助手配置含明文 API Key、模型和可编辑的系统提示词，仅保存在本机应用设置；对话时会将当前书本正文片段和选中的文字发送给 DeepSeek。编辑器底栏的 ✦ 打开侧栏，长按选择正文后可从菜单把选中文字带入对话。助手的 `insert_text` 与 `delete_text` 只生成待确认修改，接受前会检查目标正文及原文是否仍匹配；其他工具调用不执行。

## 字体

随应用内置 **思源宋体 Noto Serif SC** 和 **霞鹜文楷 Lite**，在离线环境下也可切换。字体及许可分别位于 `static/fonts/`，均按 SIL Open Font License 1.1 随附许可文本。两款字体总计约 39 MB，会增加 APK 体积。

Android 上可从系统文件选择器导入 TTF/OTF。应用通过 Android 文件描述符读取所选字体，再复制到 `_doc/fonts/`，核对复制后的文件大小，加载并记录路径；重启后仍可选用。字体设置弹窗会按实际字体显示每款自定义字体的中文预览。单个导入文件限制 25 MB。该功能依赖 Android Native.js 和 `uni.loadFontFace`，仍需在云打包后的 APK 上检查不同设备的文件选择器与字体渲染。

## PDF

PDF 导出使用 Android `PdfDocument`，支持可选目录和作者信息，保存于 `_doc/`。修复了对原生 Canvas 直接调用 `drawText` 的兼容问题，改用 `plus.android.invoke`。导出后可在应用内打开 PDF。PDF 生成与本地字体导入依赖 Android 原生运行环境，不能通过 Node 单元测试完全验证。
