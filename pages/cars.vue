<template>
  <section>
    <div class="actions" style="justify-content:space-between;align-items:center"><div><p class="muted">Konts</p><h1>Manas automašīnas</h1></div><NuxtLink class="button secondary" to="/booking">Rezervēt</NuxtLink></div>
    <div class="card" style="margin-bottom:20px">
      <h2>Pievienot automašīnu</h2>
      <div v-if="error" class="error">{{ error }}</div>
      <div class="grid" style="grid-template-columns:1fr 1fr 1fr">
        <div class="field"><label>Marka</label><select v-model="make"><option value="">Izvēlies marku</option><option v-for="m in catalog" :key="m.id" :value="m.name">{{m.name}}</option></select></div>
        <div class="field"><label>Modelis</label><select v-model="model"><option value="">Izvēlies modeli</option><option v-for="m in models" :key="m.id" :value="m.name">{{m.name}}</option></select></div>
        <div class="field"><label>Reģistrācijas numurs</label><input v-model="registrationNumber" placeholder="AA-1234" /></div>
      </div>
      <button class="button" @click="addCar" :disabled="saving || !make || !model">{{saving?'Saglabā...':'Pievienot'}}</button>
    </div>
    <div class="grid"><article v-for="car in cars" :key="car.id" class="card"><h3>{{car.make}} {{car.model}}</h3><p>{{car.registration_number}}</p><span class="badge">{{labels[car.category] || car.category}}</span></article></div>
  </section>
</template>
<script setup lang="ts">
type CarModel={id:string;name:string;category:string}
type Make={id:string;name:string;models:CarModel[]}
type Car={id:string;make:string;model:string;registration_number:string;category:string}
const cars=ref<Car[]>([]); const catalog=ref<Make[]>([]); const make=ref(''); const model=ref(''); const registrationNumber=ref(''); const saving=ref(false); const error=ref(''); const labels:Record<string,string>={passenger:'Pasažieru auto',crossover:'Crossover / SUV',minivan:'Minivans',commercial:'Komerctransports'}
const models=computed<CarModel[]>(()=>catalog.value.find((item:Make)=>item.name===make.value)?.models||[])
async function load(){try{const [c,cat]=await Promise.all([$fetch<{cars:Car[]}>('/api/cars'),$fetch<{makes:Make[]}>('/api/cars/catalog')]);cars.value=c.cars;catalog.value=cat.makes}catch(e:any){error.value='Nepieciešams ielogoties.'}}
async function addCar(){saving.value=true;error.value='';try{await $fetch('/api/cars',{method:'POST',body:{make:make.value,model:model.value,registrationNumber:registrationNumber.value}});registrationNumber.value='';await load()}catch(e:any){error.value=e?.data?.statusMessage||'Neizdevās pievienot auto.'}finally{saving.value=false}}
await load()
</script>
