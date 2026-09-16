<template>
  <section>
    <p class="muted">Rezervācija</p><h1>Izvēlies auto, datumu un laiku</h1>
    <div v-if="error" class="error">{{ error }}</div>
    <div class="card" style="margin-bottom:18px">
      <div class="field"><label>Automašīna</label><select v-model="carId"><option value="">Izvēlies automašīnu</option><option v-for="car in cars" :key="car.id" :value="car.id">{{car.make}} {{car.model}} · {{car.registration_number}} · {{price(car.category)}}</option></select></div>
      <div class="field"><label>Datums</label><input v-model="date" type="date" :min="today" @change="loadAvailability" /></div>
    </div>
    <div class="card">
      <div class="actions" style="justify-content:space-between"><h2 style="margin:0">Laiks</h2><span class="muted">09:00–20:00</span></div>
      <div class="slot-grid" style="margin-top:18px"><button v-for="slot in slots" :key="slot.time" class="slot" :class="[slot.state, {selected: selectedTime===slot.time}]" :disabled="slot.state!=='available'" @click="selectedTime=slot.time"><strong>{{slot.time}}</strong><br><small>{{slotLabel(slot.state)}}</small></button></div>
      <div class="actions"><button class="button" :disabled="!carId||!selectedTime||saving" @click="book">{{saving?'Rezervē...':'Apstiprināt rezervāciju'}}</button><NuxtLink class="button secondary" to="/cars">Pārvaldīt auto</NuxtLink></div>
    </div>
  </section>
</template>
<script setup lang="ts">
function rigaToday(){return new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Riga',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())}
const cars=ref<any[]>([]);const slots=ref<any[]>([]);const carId=ref('');const selectedTime=ref('');const saving=ref(false);const error=ref('');const date=ref(rigaToday());const today=date.value
const prices:any={passenger:'25 €',crossover:'30 €',minivan:'35 €',commercial:'35 €'}
function price(c:string){return prices[c]||''} function slotLabel(s:string){return ({available:'Brīvs',booked:'Aizņemts',blocked:'Bloķēts',past:'Pagājis',holiday:'Brīvdiena',outside_booking_window:'Ārpus rezervācijas loga'} as any)[s]||s}
async function load(){try{const r=await $fetch<any>('/api/cars');cars.value=r.cars;if(!carId.value&&cars.value[0])carId.value=cars.value[0].id;await loadAvailability()}catch(e:any){error.value='Lai rezervētu, vispirms ielogojies un pievieno auto.'}}
async function loadAvailability(){selectedTime.value='';try{const r=await $fetch<any>('/api/availability',{query:{date:date.value}});slots.value=r.slots}catch(e:any){error.value='Neizdevās ielādēt pieejamību.'}}
async function book(){saving.value=true;error.value='';try{await $fetch('/api/bookings',{method:'POST',body:{carId:carId.value,bookingDate:date.value,bookingTime:selectedTime.value}});await navigateTo('/bookings')}catch(e:any){error.value=e?.data?.statusMessage||e?.data?.data?.code||'Rezervācija neizdevās.';await loadAvailability()}finally{saving.value=false}}
await load()
</script>
