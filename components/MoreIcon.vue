<template>
  <view class="more-icon" :aria-label="$t('更多操作')"><view></view><view></view><view></view></view>
</template>

<style scoped>
.more-icon { width: 34px; height: 34px; display: flex; align-items: center; justify-content: center; gap: 3px; border-radius: 11px; color: var(--muted); transition: background .18s ease, color .18s ease, transform .18s ease; }
.more-icon view { width: 3px; height: 3px; border-radius: 50%; background: currentColor; }
.more-icon:active { color: var(--accent); background: var(--accent-soft); transform: scale(.94); }
@media (prefers-reduced-motion: reduce) { .more-icon { transition: none; } }
</style>
