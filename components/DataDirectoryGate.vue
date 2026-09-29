<template>
  <view class="data-gate" :class="themeClass()">
    <view class="gate-card">
      <image class="gate-icon" src="/static/brand/app-icon.png" mode="aspectFit" />
      <view class="gate-kicker">开始使用纸间</view>
      <view class="gate-title">为文字选一个家</view>
      <view class="gate-copy">请选择一个空文件夹。纸间会在其中建立 <text>PaperWriter</text> 目录，保存书籍数据和导出文件。重装应用时，再选同一个文件夹即可恢复。</view>
      <view class="gate-notes"><view><text class="note-number">01</text><text>书籍、封面、插图和字体一起备份</text></view><view><text class="note-number">02</text><text>原有书籍会在选择后写入该目录</text></view></view>
      <view class="gate-button" :class="{ busy:dataDirectory.busy }" @tap="selectFolder">{{ dataDirectory.busy ? '正在准备目录…' : '选择数据文件夹' }}</view>
      <view v-if="error" class="gate-error">{{ error }}</view>
      <view class="gate-foot">选择文件夹时会打开 Android 文件选择器。</view>
    </view>
  </view>
</template>

<script setup>
import { ref } from 'vue'
import { themeClass } from '../src/store/preferences.js'
import { chooseDataDirectory, dataDirectory } from '../src/services/data-directory.js'
import { reloadAppData } from '../src/services/reload-data.js'

const error = ref('')
async function selectFolder() {
  if (dataDirectory.busy) return
  error.value = ''
  try { const result = await chooseDataDirectory(); if (result === 'restored') reloadAppData() }
  catch (failure) { if (!String(failure.message).includes('取消')) error.value = failure.message || '无法使用所选目录' }
}
</script>

<style scoped>
.data-gate { position:fixed; z-index:100; inset:0; padding:calc(var(--status-bar-height) + 18px) 20px 25px; display:flex; align-items:center; justify-content:center; background:var(--bg); color:var(--text); overflow:auto; }
.gate-card { width:min(490px,100%); padding:38px 35px; border:1px solid var(--line); border-radius:30px; background:var(--surface); box-shadow:0 24px 75px var(--shadow); animation:gate-appear .48s cubic-bezier(.2,.8,.2,1) both; }
.gate-icon { display:block; width:66px; height:66px; margin-bottom:25px; border-radius:19px; box-shadow:0 9px 23px var(--shadow); }
.gate-kicker { color:var(--accent); font-size:12px; letter-spacing:.12em; }
.gate-title { margin:9px 0 17px; font-size:32px; font-weight:750; letter-spacing:-.04em; }
.gate-copy { color:var(--muted); font-size:14px; line-height:1.8; }.gate-copy text { color:var(--text); font-weight:650; }
.gate-notes { display:flex; flex-direction:column; gap:14px; margin:28px 0; padding:18px 0; border-top:1px solid var(--line); border-bottom:1px solid var(--line); }.gate-notes>view { display:flex; gap:13px; align-items:center; color:var(--muted); font-size:12px; }.gate-notes .note-number { color:var(--accent); font-size:11px; font-weight:700; }
.gate-button { padding:16px; border-radius:14px; background:var(--accent); color:var(--on-accent); text-align:center; font-size:14px; font-weight:700; box-shadow:0 8px 22px var(--shadow); transition:transform .2s ease,opacity .2s ease; }.gate-button:active { transform:scale(.98); }.gate-button.busy { opacity:.6; }
.gate-error { margin-top:17px; color:var(--danger); font-size:12px; line-height:1.6; }.gate-foot { margin-top:19px; color:var(--muted); font-size:11px; text-align:center; }
@keyframes gate-appear { from { opacity:0; transform:translateY(20px) scale(.97); } }
@media(prefers-reduced-motion:reduce) { .gate-card { animation:none; } .gate-button { transition:none; } }
</style>
