<script setup lang="ts">
type Setting = { key: string; value: unknown }

const settings = ref<Setting[]>([])
const error = ref('')
const saving = ref('')

function findSetting(key: string) {
  return settings.value.find((item: Setting) => item.key === key)
}

function value(key: string) {
  return Number(findSetting(key)?.value ?? 0)
}

function updateValue(key: string, event: Event) {
  const target = event.target as HTMLInputElement | null
  const setting = findSetting(key)
  if (setting && target) setting.value = Number(target.value)
}

async function load() {
  try {
    settings.value = (await $fetch<{ settings: Setting[] }>('/api/admin/settings')).settings
  } catch (e: any) {
    error.value = e?.data?.statusMessage || e?.message || 'Ошибка'
  }
}

async function save(key: string) {
  error.value = ''
  saving.value = key
  try {
    await $fetch('/api/admin/settings', {
      method: 'PATCH',
      body: { key, value: value(key) },
    })
    await load()
  } catch (e: any) {
    error.value = e?.data?.statusMessage || e?.message || 'Ошибка'
  } finally {
    saving.value = ''
  }
}

await load()
</script>

<template>
  <main class="page">
    <div class="container">
      <div class="page-head">
        <div>
          <h1>Settings</h1>
          <p>Ограничения клиентского бронирования</p>
        </div>
        <NuxtLink class="btn" to="/admin">Admin</NuxtLink>
      </div>

      <div v-if="error" class="error">{{ error }}</div>

      <div class="card form-grid">
        <label>
          Максимум бронирований клиента в окне
          <input
            :value="value('max_customer_bookings_in_window')"
            type="number"
            min="1"
            max="30"
            @input="updateValue('max_customer_bookings_in_window', $event)"
          >
        </label>
        <button
          class="btn primary"
          :disabled="saving === 'max_customer_bookings_in_window'"
          @click="save('max_customer_bookings_in_window')"
        >Сохранить</button>

        <label>
          Максимум бронирований на один автомобиль в окне
          <input
            :value="value('max_customer_bookings_per_car_in_window')"
            type="number"
            min="1"
            max="30"
            @input="updateValue('max_customer_bookings_per_car_in_window', $event)"
          >
        </label>
        <button
          class="btn primary"
          :disabled="saving === 'max_customer_bookings_per_car_in_window'"
          @click="save('max_customer_bookings_per_car_in_window')"
        >Сохранить</button>
      </div>
    </div>
  </main>
</template>
