<script setup lang="ts">
const cars=ref<any[]>([]);const error=ref('');const loading=ref(true)
async function load(){try{cars.value=(await $fetch<{cars:any[]}>('/api/admin/cars')).cars}catch(e:any){error.value=e?.data?.statusMessage||e?.message||'Ошибка'}finally{loading.value=false}}await load()
const cat:any={passenger:'Пассажирский',crossover:'Crossover / SUV',minivan:'Minivan',commercial:'Коммерческий'}
</script>
<template><main class="page"><div class="container"><div class="page-head"><div><h1>Cars</h1><p>Автомобили всех клиентов</p></div><NuxtLink class="btn" to="/admin">Admin</NuxtLink></div><div v-if="error" class="error">{{error}}</div><div v-if="loading">Загрузка…</div><div v-else class="table-wrap"><table><thead><tr><th>Клиент</th><th>Авто</th><th>Номер</th><th>Категория</th><th>Телефон</th></tr></thead><tbody><tr v-for="c in cars" :key="c.id"><td>{{c.customer_name}}</td><td>{{c.make}} {{c.model}}</td><td>{{c.registration_number}}</td><td>{{cat[c.category]||c.category}}</td><td>{{c.customer_phone}}</td></tr></tbody></table></div></div></main></template>
