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
- `pages/book`：可折叠的章节与正文目录、接续上次写作、文本筛选和 PDF 导出。
- `pages/editor`：连续文本编辑、实时字数统计、全书篇章侧栏、段落聚焦、标点补全、撤销重做、查找替换、沉浸模式和光标过渡效果。
- `pages/settings`：浅色/深色/跟随系统、内置与导入字体、字号和编辑偏好。
- `components`：底部导航、连续正文输入、应用内操作菜单、确认对话框。
- `src/store`：书库、设置、每日统计的本地 JSON 持久化与主导航状态。
- `src/services`：Android PDF、封面持久化、字体导入与加载。
- `src/utils/text.js`：可单独测试的编辑与替换逻辑。

书库的存储键为 `paperwriter.library.v1`，层级为 `books[] → chapters[] → articles[] → paragraphs[]`。每本书的 `lastEdited` 保存最近写作的篇章与光标位置。旧书缺少作者、封面或写作位置字段时仍可正常读取。设置存于 `paperwriter.preferences.v1`，统计存于 `paperwriter.statistics.v1`。每日统计按本地日期保存正文净字数变化，删除正文、章节或书籍也计入负数，并保留当日书籍和篇章来源；安装本版本前的历史写作不会补算。所有数据均保存在本机应用存储，无服务端和加密；卸载应用会清除本地书库与统计。

## 字体

随应用内置 **思源宋体 Noto Serif SC** 和 **霞鹜文楷 Lite**，在离线环境下也可切换。字体及许可分别位于 `static/fonts/`，均按 SIL Open Font License 1.1 随附许可文本。两款字体总计约 39 MB，会增加 APK 体积。

Android 上可从系统文件选择器导入 TTF/OTF。应用将字体复制到 `_doc/fonts/` 并记录路径；重启后仍可选用。中文字体文件可能较大，单个导入文件限制 25 MB。该功能使用 Android Native.js 和 `uni.loadFontFace`，需要在真机或模拟器中检查字体加载。

## PDF

PDF 导出使用 Android `PdfDocument`，支持可选目录和作者信息，保存于 `_doc/`。修复了对原生 Canvas 直接调用 `drawText` 的兼容问题，改用 `plus.android.invoke`。导出后可在应用内打开 PDF。PDF 生成与本地字体导入依赖 Android 原生运行环境，不能通过 Node 单元测试完全验证。
