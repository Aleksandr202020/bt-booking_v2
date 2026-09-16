<script setup lang="ts">
type Holiday={id:string;date:string;name:string;active:boolean}
const holidays=ref<Holiday[]>([]);const date=ref('');const name=ref('');const error=ref('');const loading=ref(false)
async function load(){try{holidays.value=(await $fetch<{holidays:Holiday[]}>('/api/admin/holidays')).holidays}catch(e:any){error.value=e?.data?.statusMessage||e?.message||'Ошибка'}}
async function add(){error.value='';loading.value=true;try{await $fetch('/api/admin/holidays',{method:'POST',body:{date:date.value,name:name.value}});date.value='';name.value='';await load()}catch(e:any){error.value=e?.data?.statusMessage||e?.message||'Ошибка'}finally{loading.value=false}}
async function remove(id:string){try{await $fetch(`/api/admin/holidays/${id}`,{method:'DELETE'});await load()}catch(e:any){error.value=e?.data?.statusMessage||e?.message||'Ошибка'}}
await load()
</script>
<template><main class="page"><div class="container"><div class="page-head"><div><h1>Holidays</h1><p>В эти даты клиентам бронирование недоступно</p></div><NuxtLink class="btn" to="/admin">Admin</NuxtLink></div><div class="card form-grid"><label>Дата<input v-model="date" type="date"></label><label>Название<input v-model="name" maxlength="150" placeholder="Например: Jāņi"></label><button class="btn primary" :disabled="loading||!date||!name" @click="add">Добавить</button></div><div v-if="error" class="error">{{error}}</div><div class="card"><h2>Праздничные дни</h2><div v-for="h in holidays" :key="h.id" class="list-row"><span><strong>{{h.date}}</strong> · {{h.name}}</span><button class="btn danger" @click="remove(h.id)">Удалить</button></div><p v-if="!holidays.length">Нет заданных праздников.</p></div></div></main></template>
