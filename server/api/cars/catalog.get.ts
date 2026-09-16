import { getDb } from '../../utils/db'

export default defineEventHandler(async () => {
  const db = getDb()
  const makes = await db`
    SELECT m.id, m.name,
      COALESCE(json_agg(json_build_object('id', v.id, 'name', v.name, 'category', v.category) ORDER BY v.name) FILTER (WHERE v.id IS NOT NULL), '[]'::json) AS models
    FROM vehicle_makes m
    LEFT JOIN vehicle_models v ON v.make_id = m.id AND v.active = TRUE
    WHERE m.active = TRUE
    GROUP BY m.id, m.name
    ORDER BY m.name
  `
  return { makes }
})
