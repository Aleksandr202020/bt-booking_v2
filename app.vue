<template>
  <div class="app-shell">
    <header class="site-header">
      <NuxtLink to="/" class="brand">BT Automazgātava</NuxtLink>
      <nav class="nav">
        <NuxtLink to="/booking">Rezervēt laiku</NuxtLink>
        <NuxtLink to="/bookings">Manas rezervācijas</NuxtLink>
        <NuxtLink to="/cars">Manas automašīnas</NuxtLink>
        <NuxtLink v-if="user" to="/profile">Profils</NuxtLink>
        <NuxtLink v-if="user?.role === 'admin'" to="/admin">Admin</NuxtLink>
        <NuxtLink v-if="!user" to="/login" class="nav-button">Ielogoties</NuxtLink>
        <button v-else class="nav-button" @click="logout">Iziet</button>
      </nav>
    </header>
    <main class="page"><NuxtPage /></main>
    <footer class="footer">BT Automazgātava · Automazgāšana ar rokām · 09:00–21:00</footer>
  </div>
</template>

<script setup lang="ts">
const user = useState<any | null>('auth-user', () => null)

if (import.meta.client && !user.value) {
  try {
    const result = await $fetch<{ user: any }>('/api/auth/me')
    user.value = result.user
  } catch {
    user.value = null
  }
}

async function logout() {
  await $fetch('/api/auth/logout', { method: 'POST' })
  user.value = null
  await navigateTo('/login')
}
</script>
