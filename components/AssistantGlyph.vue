<template>
  <view class="glyph" :class="[name, { open, expanded }]" aria-hidden="true">
    <view v-if="name === 'chevron'" class="chevron-stroke" />
    <template v-else-if="name === 'window'">
      <view class="corner top-left" /><view class="corner top-right" />
      <view class="corner bottom-left" /><view class="corner bottom-right" />
    </template>
    <template v-else-if="name === 'plus' || name === 'close'">
      <view class="cross-stroke first" /><view class="cross-stroke second" />
    </template>
    <template v-else-if="name === 'send'">
      <view class="send-shaft" /><view class="send-head" />
    </template>
    <template v-else-if="name === 'sparkle'">
      <view class="spark-main" /><view class="spark-small" />
    </template>
  </view>
</template>

<script setup>
defineProps({ name: { type: String, required: true }, open: Boolean, expanded: Boolean })
</script>

<style scoped>
.glyph { width:18px; height:18px; position:relative; display:inline-block; flex:none; color:inherit; transition:transform .28s cubic-bezier(.2,.8,.2,1); }
.chevron-stroke { position:absolute; left:5px; top:4px; width:8px; height:8px; border-right:2px solid currentColor; border-bottom:2px solid currentColor; border-radius:1px; transform:rotate(45deg); transition:transform .28s cubic-bezier(.2,.8,.2,1),top .28s ease; }
.chevron.open .chevron-stroke { top:8px; transform:rotate(225deg); }
.corner { position:absolute; width:6px; height:6px; border-color:currentColor; border-style:solid; border-width:0; transition:transform .32s cubic-bezier(.2,.8,.2,1); }
.top-left { top:2px; left:2px; border-top-width:2px; border-left-width:2px; }
.top-right { top:2px; right:2px; border-top-width:2px; border-right-width:2px; }
.bottom-left { bottom:2px; left:2px; border-bottom-width:2px; border-left-width:2px; }
.bottom-right { bottom:2px; right:2px; border-bottom-width:2px; border-right-width:2px; }
.window.expanded .top-left { transform:translate(4px,4px) rotate(180deg); }
.window.expanded .top-right { transform:translate(-4px,4px) rotate(180deg); }
.window.expanded .bottom-left { transform:translate(4px,-4px) rotate(180deg); }
.window.expanded .bottom-right { transform:translate(-4px,-4px) rotate(180deg); }
.cross-stroke { position:absolute; left:3px; top:8px; width:12px; height:2px; border-radius:2px; background:currentColor; transition:transform .25s ease; }
.plus .second { transform:rotate(90deg); }
.close .first { transform:rotate(45deg); }.close .second { transform:rotate(-45deg); }
.send-shaft { position:absolute; left:8px; top:5px; width:2px; height:12px; border-radius:2px; background:currentColor; }
.send-head { position:absolute; left:4px; top:4px; width:9px; height:9px; border-top:2px solid currentColor; border-left:2px solid currentColor; border-radius:1px; transform:rotate(45deg); }
.spark-main { position:absolute; left:3px; top:2px; width:12px; height:14px; background:currentColor; clip-path:polygon(50% 0,65% 35%,100% 50%,65% 65%,50% 100%,35% 65%,0 50%,35% 35%); }
.spark-small { position:absolute; right:0; top:0; width:4px; height:4px; border-radius:50%; background:currentColor; }
@media (prefers-reduced-motion:reduce) { .glyph,.glyph view { transition:none !important; } }
</style>
