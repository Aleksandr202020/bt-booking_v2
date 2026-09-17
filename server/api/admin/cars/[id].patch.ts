import { createError } from 'h3'
import { z } from 'zod'
import { requireAdmin } from '../../../utils/authorization'
import { getDb } from '../../../utils/db'
import { writeAuditLog } from '../../../utils/audit'

const schema=z.object({make:z.string().trim().min(1).max(80),model:z.string().trim().min(1).max(80),registrationNumber:z.string().trim().min(2).max(20)})
const uuidSchema = z.string().uuid()
export default defineEventHandler(async(event)=>{
 const admin=await requireAdmin(event); const id=getRouterParam(event,'id'); if(!id || !uuidSchema.safeParse(id).success) throw createError({statusCode:400,statusMessage:'INVALID_CAR_ID'})
 const body=schema.parse(await readBody(event)); const db=getDb()
 const model=await db`SELECT v.category FROM vehicle_models v JOIN vehicle_makes m ON m.id=v.make_id WHERE m.name=${body.make} AND v.name=${body.model} AND m.active=true AND v.active=true LIMIT 1`
 if(!model.length) throw createError({statusCode:400,statusMessage:'INVALID_VEHICLE_MODEL'})
 const rows=await db`UPDATE cars SET make=${body.make},model=${body.model},registration_number=${body.registrationNumber},category=${model[0].category},updated_at=now() WHERE id=${id} RETURNING *`
 if(!rows.length) throw createError({statusCode:404,statusMessage:'CAR_NOT_FOUND'})
 await writeAuditLog({actorId:admin.id,action:'car.updated',targetId:id,metadata:{make:body.make,model:body.model,registrationNumber:body.registrationNumber}})
 return {car:rows[0]}
})
