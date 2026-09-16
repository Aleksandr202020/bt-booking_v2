<script setup lang="ts">
const user=useState<any>('auth-user',()=>null)
const loading=ref(true); const error=ref('')
const stats=ref({bookings:0,customers:0,cars:0,blocked:0,holidays:0})
async function load(){
  loading.value=true; error.value=''
  try{
    const [me,b,c,bs,h]=await Promise.all([
      $fetch<{user:any}>('/api/auth/me'),
      $fetch<{bookings:any[]}>('/api/admin/bookings'),
      $fetch<{cars:any[]}>('/api/admin/cars'),
      $fetch<{blockedSlots:any[]}>('/api/admin/blocked-slots'),
      $fetch<{holidays:any[]}>('/api/admin/holidays')
    ])
    user.value=me.user
    if(me.user?.role!=='admin') throw new Error('FORBIDDEN')
    stats.value={bookings:b.bookings.length,customers:new Set(b.bookings.map(x=>x.user_id)).size,cars:c.cars.length,blocked:bs.blockedSlots.length,holidays:h.holidays.filter(x=>x.active).length}
  }catch(e:any){ error.value=e?.data?.statusMessage||e?.message||'Не удалось загрузить админ-панель' }
  finally{loading.value=false}
}
await load()
</script>
<template>
  <main class="page"><div class="container">
    <div class="page-head"><div><h1>Admin panel</h1><p>Управление BT Automazgātava</p></div><NuxtLink class="btn" to="/">На сайт</NuxtLink></div>
    <p v-if="loading">Загрузка…</p><div v-else-if="error" class="error">{{ error }}</div>
    <template v-else>
      <div class="stats-grid"><div class="card"><strong>{{stats.bookings}}</strong><span>Бронирований</span></div><div class="card"><strong>{{stats.customers}}</strong><span>Клиентов</span></div><div class="card"><strong>{{stats.cars}}</strong><span>Автомобилей</span></div><div class="card"><strong>{{stats.blocked}}</strong><span>Блокировок</span></div><div class="card"><strong>{{stats.holidays}}</strong><span>Активных праздников</span></div></div>
      <div class="card admin-nav"><h2>Разделы</h2><div class="grid"><NuxtLink class="btn" to="/admin/calendar">Calendar</NuxtLink><NuxtLink class="btn" to="/admin/bookings">All bookings</NuxtLink><NuxtLink class="btn" to="/admin/manual-booking">Manual booking</NuxtLink><NuxtLink class="btn" to="/admin/blocked-time">Blocked time</NuxtLink><NuxtLink class="btn" to="/admin/holidays">Holidays</NuxtLink><NuxtLink class="btn" to="/admin/clients">Customers</NuxtLink><NuxtLink class="btn" to="/admin/cars">Cars</NuxtLink></div></div>
    </template>
  </div></main>
</template>
