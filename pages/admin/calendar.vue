<script setup lang="ts">
type Slot={time:string;status:string;booking?:any}
const date=ref(new Date().toISOString().slice(0,10)); const slots=ref<Slot[]>([]); const bookings=ref<any[]>([]); const error=ref(''); const loading=ref(false)
const labels:any={available:'Свободно',booked:'Забронировано',blocked:'Заблокировано',past:'Прошло',holiday:'Праздник',outside_booking_window:'Вне окна'}
async function load(){loading.value=true;error.value='';try{const [a,b]=await Promise.all([$fetch<{slots:Slot[]}>('/api/availability',{query:{date:date.value}}),$fetch<{bookings:any[]}>('/api/admin/bookings',{query:{date:date.value}})]);slots.value=a.slots;bookings.value=b.bookings}catch(e:any){error.value=e?.data?.statusMessage||e?.message||'Ошибка'}finally{loading.value=false}}
watch(date,load); await load()
function bookingFor(time:string){return bookings.value.find(b=>String(b.booking_time).slice(0,5)===time&&['pending','confirmed'].includes(b.status))}
</script>
<template><main class="page"><div class="container"><div class="page-head"><div><h1>Calendar</h1><p>Все рабочие слоты 09:00–20:00</p></div><NuxtLink class="btn" to="/admin">Admin</NuxtLink></div><div class="card toolbar"><label>Дата<input v-model="date" type="date"></label></div><div v-if="error" class="error">{{error}}</div><div v-if="loading">Загрузка…</div><div v-else class="slot-grid"><div v-for="slot in slots" :key="slot.time" class="slot-card" :class="'status-'+slot.status"><strong>{{slot.time}}</strong><span>{{labels[slot.status]||slot.status}}</span><small v-if="bookingFor(slot.time)">{{bookingFor(slot.time).customer_name}} · {{bookingFor(slot.time).make}} {{bookingFor(slot.time).model}}</small><small v-if="bookingFor(slot.time)">{{bookingFor(slot.time).price_cents/100}} €</small></div></div></div></main></template>
