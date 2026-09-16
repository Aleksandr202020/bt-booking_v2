import { requireAdmin } from '../../../utils/authorization'
import { getDb } from '../../../utils/db'
import { writeAuditLog } from '../../../utils/audit'

export default defineEventHandler(async(event)=>{
 const admin=await requireAdmin(event); const id=getRouterParam(event,'id'); if(!id) throw createError({statusCode:400,statusMessage:'CAR_NOT_FOUND'})
 const db=getDb()
 const active=await db`SELECT 1 FROM bookings WHERE car_id=${id} AND status IN ('pending','confirmed') LIMIT 1`
 if(active.length) throw createError({statusCode:409,statusMessage:'CAR_HAS_ACTIVE_BOOKING',data:{code:'CAR_HAS_ACTIVE_BOOKING'}})
 const rows=await db`DELETE FROM cars WHERE id=${id} RETURNING id`
 if(!rows.length) throw createError({statusCode:404,statusMessage:'CAR_NOT_FOUND'})
 await writeAuditLog({actorId:admin.id,action:'car.deleted',targetId:id})
 return {ok:true}
})
