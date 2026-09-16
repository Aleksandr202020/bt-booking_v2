<template>
  <section class="card form">
    <h1>Ielogoties</h1>
    <p class="muted">Pārvaldi savas automašīnas un rezervācijas.</p>
    <div v-if="error" class="error">{{ error }}</div>
    <form @submit.prevent="submit">
      <div class="field"><label>E-pasts</label><input v-model="email" type="email" autocomplete="email" required /></div>
      <div class="field"><label>Parole</label><input v-model="password" type="password" autocomplete="current-password" required /></div>
      <button class="button" :disabled="loading">{{ loading ? 'Notiek...' : 'Ielogoties' }}</button>
    </form>
    <p class="muted">Nav konta? <NuxtLink to="/register">Reģistrēties</NuxtLink></p>
  </section>
</template>
<script setup lang="ts">
const user = useState<any | null>('auth-user', () => null)
const email = ref(''); const password = ref(''); const loading = ref(false); const error = ref('')
async function submit() {
  loading.value = true; error.value = ''
  try { const result = await $fetch<{user:any}>('/api/auth/login', { method:'POST', body:{email:email.value,password:password.value} }); user.value=result.user; await navigateTo('/booking') }
  catch (e:any) { error.value=e?.data?.statusMessage || e?.data?.data?.code || 'Neizdevās ielogoties.' }
  finally { loading.value=false }
}
</script>
