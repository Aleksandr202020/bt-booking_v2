<script setup lang="ts">
const bookings=ref<any[]>([]); const loading=ref(true); const error=ref(''); const status=ref('')
async function load(){loading.value=true;error.value='';try{const r=await $fetch<{bookings:any[]}>('/api/admin/bookings',{query:status.value?{status:status.value}:{}});bookings.value=r.bookings}catch(e:any){error.value=e?.data?.statusMessage||e?.message||'Ошибка'}finally{loading.value=false}}
watch(status,load);await load()
const money=(n:number)=>`${(n/100).toFixed(2)} €`;const state:any={pending:'Ожидает',confirmed:'Подтверждено',completed:'Завершено',cancelled_customer:'Отмена клиента',cancelled_admin:'Отмена админа',no_show:'Не явился'}
const cancelling=ref('')
async function cancelBooking(id:string){
  if(!confirm('Отменить это бронирование?')) return
  cancelling.value=id; error.value=''
  try { await $fetch(`/api/admin/bookings/${id}`,{method:'DELETE'}); await load() }
  catch(e:any){ error.value=e?.data?.data?.code||e?.data?.statusMessage||e?.message||'Ошибка отмены' }
  finally { cancelling.value='' }
}
</script>
<template><main class="page"><div class="container"><div class="page-head"><div><h1>All bookings</h1><p>Все бронирования и их текущий статус</p></div><NuxtLink class="btn" to="/admin">Admin</NuxtLink></div><div class="card toolbar"><label>Статус<select v-model="status"><option value="">Все</option><option value="pending">Ожидает</option><option value="confirmed">Подтверждено</option><option value="completed">Завершено</option><option value="cancelled_customer">Отмена клиента</option><option value="cancelled_admin">Отмена админа</option><option value="no_show">Не явился</option></select></label></div><div v-if="error" class="error">{{error}}</div><div v-if="loading">Загрузка…</div><div v-else class="table-wrap"><table><thead><tr><th>Дата</th><th>Время</th><th>Клиент</th><th>Авто</th><th>Цена</th><th>Статус</th><th>Примечание</th><th></th></tr></thead><tbody><tr v-for="b in bookings" :key="b.id"><td>{{b.booking_date}}</td><td>{{String(b.booking_time).slice(0,5)}}</td><td>{{b.customer_name}}<br><small>{{b.customer_phone}}</small></td><td>{{b.make}} {{b.model}}<br><small>{{b.registration_number}}</small></td><td>{{money(b.price_cents)}}</td><td>{{state[b.status]}}</td><td>{{b.notes||'—'}}</td><td class="actions"><NuxtLink class="btn" :to="`/admin/booking-edit?id=${b.id}`">Edit</NuxtLink><button v-if="['pending','confirmed'].includes(b.status)" class="btn" :disabled="cancelling===b.id" @click="cancelBooking(b.id)">{{cancelling===b.id?'Отмена…':'Отменить'}}</button></td></tr></tbody></table></div></div></main></template>
