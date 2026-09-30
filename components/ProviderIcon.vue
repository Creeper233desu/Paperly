<template><image v-if="src" class="provider-icon" :src="src" mode="aspectFit" :aria-label="provider" /></template>
<script setup>
import { computed } from 'vue'
import { themeClass } from '../src/store/preferences.js'
import { providerIcon } from '../src/utils/provider-icon.js'
const props = defineProps({ provider:String })
const src = computed(() => providerIcon(props.provider, themeClass().includes('theme-dark')))
</script>
<style scoped>.provider-icon { width:19px; height:19px; flex:none; vertical-align:middle; }</style>
