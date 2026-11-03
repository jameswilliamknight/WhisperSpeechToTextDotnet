<script setup lang="ts">
import { Pencil } from 'lucide-vue-next'
import UiIconButton from '#layers/freebore-ui/app/components/ui/UiIconButton.vue'

withDefaults(defineProps<{ name: string; editable?: boolean }>(), { editable: true })
defineEmits<{ edit: [] }>()
</script>

<template>
  <span class="group/speaker flex min-w-0 items-center gap-2.5">
    <span class="truncate">{{ name }}</span>
    <UiIconButton
      v-if="editable"
      :icon="Pencil"
      variant="naked"
      size="xs"
      class="-my-1 h-5 w-5 shrink-0 opacity-0 transition-opacity group-hover/speaker:opacity-100 group-focus-within/speaker:opacity-100 focus-visible:opacity-100"
      :aria-label="`Rename ${name}`"
      @click="$emit('edit')"
    />
  </span>
</template>
