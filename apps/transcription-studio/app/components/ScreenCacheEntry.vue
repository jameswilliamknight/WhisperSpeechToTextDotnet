<script setup lang="ts">
import { computed, onActivated, onDeactivated, provide, shallowRef } from 'vue'
import type { Component } from 'vue'
import { screenActivityKey } from '~/composables/useScreenActivity'

const props = defineProps<{ screen: Component; path: string; activePath: string; ready: boolean }>()
const attached = shallowRef(true)
onActivated(() => { attached.value = true })
onDeactivated(() => { attached.value = false })
provide(screenActivityKey, computed(() => attached.value && props.ready && props.path === props.activePath))
</script>

<template>
  <component :is="screen" />
</template>
