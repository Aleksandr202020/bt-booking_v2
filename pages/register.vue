<template>
  <section class="card form">
    <h1>Reģistrācija</h1>
    <div v-if="error" class="error">{{ error }}</div>
    <form @submit.prevent="submit">
      <div class="field"><label>Vārds</label><input v-model="name" autocomplete="name" required /></div>
      <div class="field"><label>E-pasts</label><input v-model="email" type="email" autocomplete="email" required /></div>
      <div class="field"><label>Tālrunis</label><input v-model="phone" type="tel" autocomplete="tel" required /></div>
      <div class="field"><label>Parole</label><input v-model="password" type="password" autocomplete="new-password" minlength="8" required /></div>
      <button class="button" :disabled="loading">{{ loading ? 'Notiek...' : 'Izveidot kontu' }}</button>
    </form>
    <p class="muted">Jau esi reģistrēts? <NuxtLink to="/login">Ielogoties</NuxtLink></p>
  </section>
</template>
<script setup lang="ts">
const user=useState<any|null>('auth-user',()=>null); const name=ref(''); const email=ref(''); const phone=ref(''); const password=ref(''); const loading=ref(false); const error=ref('')
async function submit(){loading.value=true;error.value='';try{const r=await $fetch<{user:any}>('/api/auth/register',{method:'POST',body:{name:name.value,email:email.value,phone:phone.value,password:password.value}});user.value=r.user;await navigateTo('/booking')}catch(e:any){error.value=e?.data?.statusMessage||'Neizdevās izveidot kontu.'}finally{loading.value=false}}
</script>
