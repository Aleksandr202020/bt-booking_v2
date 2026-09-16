<script setup lang="ts">
const user=useState<any>('auth-user',()=>null);const error=ref('');const loading=ref(!user.value)
if(!user.value){try{user.value=(await $fetch<{user:any}>('/api/auth/me')).user}catch(e:any){error.value='Необходимо войти в аккаунт';await navigateTo('/login')}finally{loading.value=false}}
</script>
<template><main class="page"><div class="container"><div class="page-head"><div><h1>Профиль</h1><p>Данные вашего аккаунта</p></div></div><div v-if="loading">Загрузка…</div><div v-else-if="error" class="error">{{error}}</div><div v-else class="card"><div class="list-row"><span>Имя</span><strong>{{user?.name}}</strong></div><div class="list-row"><span>Email</span><strong>{{user?.email}}</strong></div><div class="list-row"><span>Телефон</span><strong>{{user?.phone}}</strong></div><div class="list-row"><span>Роль</span><strong>{{user?.role}}</strong></div></div></div></main></template>
