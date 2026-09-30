<template><BookPanel ref="panel" :book-id="bookId" @close="back" /></template>
<script setup>
import { ref } from 'vue'
import { onBackPress, onLoad, onShow } from '@dcloudio/uni-app'
import BookPanel from '../../components/BookPanel.vue'
import { primaryNavigation } from '../../src/store/navigation'
const bookId = ref(''), panel = ref(null)
onLoad(options => { bookId.value = options.id || '' })
onShow(() => { primaryNavigation.active = 'library' })
onBackPress(() => panel.value?.dismissOverlay() || false)
function back() { uni.navigateBack() }
</script>
