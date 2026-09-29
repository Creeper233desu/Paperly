<template><view class="ui-icon" :class="name" aria-hidden="true"><view></view><view></view><view></view></view></template>
<script setup>defineProps({ name: { type: String, default: 'file' } })</script>
<style scoped>
.ui-icon { position:relative; display:inline-block; flex:none; width:22px; height:22px; color:inherit; }
.ui-icon,.ui-icon view,.ui-icon::before,.ui-icon::after { box-sizing:border-box; }
.ui-icon::before,.ui-icon::after { content:''; position:absolute; }
.plus::before,.close::before,.plus::after,.close::after { width:16px; height:2px; left:3px; top:10px; border-radius:2px; background:currentColor; }.plus::after { transform:rotate(90deg); }.close::before { transform:rotate(45deg); }.close::after { transform:rotate(-45deg); }
.chevron-right::before,.chevron-left::before { width:8px; height:8px; border-top:2px solid; border-right:2px solid; top:7px; left:5px; transform:rotate(45deg); }.chevron-left::before { transform:rotate(-135deg); left:9px; }
.shelf view { position:absolute; bottom:3px; width:5px; height:16px; border:1.6px solid; border-radius:1px; }.shelf view:nth-child(1) { left:1px; }.shelf view:nth-child(2) { left:8px; }.shelf view:nth-child(3) { left:16px; height:14px; transform:rotate(-10deg); }.shelf::after { width:22px; height:1.5px; background:currentColor; bottom:1px; }
.chart view { position:absolute; bottom:2px; width:4px; border-radius:2px; background:currentColor; }.chart view:nth-child(1) { height:9px; left:2px; }.chart view:nth-child(2) { height:18px; left:9px; }.chart view:nth-child(3) { height:13px; left:16px; }
.sliders view { position:absolute; width:20px; height:1.5px; background:currentColor; left:1px; }.sliders view:nth-child(1) { top:4px; }.sliders view:nth-child(2) { top:11px; }.sliders view:nth-child(3) { top:18px; }.sliders view::after { content:''; position:absolute; top:-2.5px; left:5px; width:6px; height:6px; border:1.5px solid; border-radius:50%; background:var(--surface); }.sliders view:nth-child(2)::after { left:12px; }
.file::before { inset:1px 3px; border:1.6px solid; border-radius:3px; }.file::after { left:7px; top:9px; width:8px; height:6px; border-top:1.6px solid; border-bottom:1.6px solid; }
.image::before { inset:2px 0; border:1.6px solid; border-radius:4px; }.image::after { width:4px; height:4px; border-radius:50%; background:currentColor; top:6px; right:5px; }.image view:first-child { position:absolute; left:4px; top:11px; width:10px; height:8px; border-top:1.6px solid; border-left:1.6px solid; transform:rotate(40deg); }
.download::before { left:10px; top:1px; height:12px; border-left:2px solid; }.download::after { left:7px; top:7px; width:8px; height:8px; border-right:2px solid; border-bottom:2px solid; transform:rotate(45deg); }.download view:first-child { position:absolute; bottom:1px; left:2px; right:2px; height:6px; border:1.6px solid; border-top:0; border-radius:0 0 3px 3px; }
.undo::before,.redo::before { width:14px; height:13px; top:6px; left:5px; border:1.7px solid; border-left-color:transparent; border-bottom-color:transparent; border-radius:50%; transform:rotate(-25deg); }.undo::after,.redo::after { width:7px; height:7px; left:3px; top:4px; border-left:1.7px solid; border-bottom:1.7px solid; }.redo { transform:scaleX(-1); }
.return::before { top:3px; left:4px; width:15px; height:11px; border-right:1.7px solid; border-bottom:1.7px solid; border-radius:0 0 5px 0; }.return::after { top:9px; left:4px; width:8px; height:8px; border-left:1.7px solid; border-bottom:1.7px solid; transform:rotate(45deg); }
.search::before { width:13px; height:13px; border:1.8px solid; border-radius:50%; left:2px; top:2px; }.search::after { width:8px; height:2px; background:currentColor; transform:rotate(45deg); top:16px; left:13px; border-radius:2px; }
.focus::before { inset:1px; border:1.5px solid; border-radius:50%; }.focus::after { inset:6px; border:1.5px solid; border-radius:50%; }
.expand::before,.collapse::before { inset:2px; border:1.7px solid; border-radius:4px; }.expand::after { inset:6px; background:var(--surface); }.collapse::after { inset:7px; border:1.5px solid; border-radius:1px; }
.check::before { left:4px; top:4px; width:8px; height:13px; border-right:2px solid; border-bottom:2px solid; transform:rotate(45deg); }
.gear view:first-child { position:absolute; inset:3px; border:2px solid currentColor; border-radius:5px; transform:rotate(45deg); }
.gear::before { inset:7px; border:2px solid currentColor; border-radius:50%; }
.gear::after { left:10px; top:0; width:2px; height:22px; background:linear-gradient(currentColor 0 4px,transparent 4px 18px,currentColor 18px); }
.lock::before,.unlock::before { left:4px; top:9px; width:14px; height:11px; border:1.8px solid currentColor; border-radius:3px; }
.lock::after,.unlock::after { left:7px; top:2px; width:8px; height:10px; border:1.8px solid currentColor; border-bottom:0; border-radius:7px 7px 0 0; transition:transform .25s cubic-bezier(.2,.8,.2,1); }
.unlock::after { transform:translateX(5px) rotate(30deg); transform-origin:left bottom; }
</style>
