import { Router } from 'express'
import { pool } from '../db.ts'
import { authenticate, requireHuman, requireRole } from '../auth/auth.ts'
import { sendError } from '../lib/http.ts'

export const analyticsRouter = Router()
export const operationsRouter = Router()

analyticsRouter.use(authenticate)

// Sales totals and the last seven days of daily revenue. Only recorded sales
// are counted; nothing is synthesised.
analyticsRouter.get('/sales', async (_req, res) => {
  try {
    const totals = await pool.query(`
      SELECT
        COUNT(*)::int AS total_sales,
        COALESCE(SUM(amount), 0)::numeric(12, 2)::text AS total_revenue,
        COALESCE(AVG(amount), 0)::numeric(12, 2)::text AS average_sale
      FROM sales_events
    `)

    const daily = await pool.query(`
      SELECT
        days.day::date::text AS date,
        COUNT(s.id)::int AS sales,
        COALESCE(SUM(s.amount), 0)::numeric(12, 2)::text AS revenue
      FROM generate_series(
        CURRENT_DATE - INTERVAL '6 days',
        CURRENT_DATE,
        INTERVAL '1 day'
      ) AS days(day)
      LEFT JOIN sales_events s
        ON s.sold_at >= days.day
       AND s.sold_at < days.day + INTERVAL '1 day'
      GROUP BY days.day
      ORDER BY days.day
    `)

    res.json({
      totalSales: totals.rows[0].total_sales,
      totalRevenue: Number(totals.rows[0].total_revenue),
      averageSale: Number(totals.rows[0].average_sale),
      daily: daily.rows.map((row) => ({
        date: row.date,
        sales: row.sales,
        revenue: Number(row.revenue),
      })),
      hasData: Number(totals.rows[0].total_sales) > 0,
    })
  } catch (error) {
    sendError(res, error, 'Failed to fetch sales analytics')
  }
})

// Service job counts per status, plus the ten most recent jobs.
analyticsRouter.get('/service', async (_req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE status = 'open')::int AS open,
        COUNT(*) FILTER (WHERE status = 'in_progress')::int AS in_progress,
        COUNT(*) FILTER (WHERE status = 'completed')::int AS completed,
        COUNT(*) FILTER (WHERE status = 'cancelled')::int AS cancelled
      FROM service_events
    `)

    const recent = await pool.query(`
      SELECT s.id, s.vehicle_id, v.vin, v.make, v.model, s.status,
             s.description, s.opened_at, s.completed_at
      FROM service_events s
      LEFT JOIN vehicles v ON v.id = s.vehicle_id
      ORDER BY s.opened_at DESC, s.id DESC
      LIMIT 10
    `)

    const counts = result.rows[0]

    res.json({
      ...counts,
      hasData: counts.total > 0,
      recent: recent.rows,
    })
  } catch (error) {
    sendError(res, error, 'Failed to fetch service analytics')
  }
})

// Recent machine-ingestion outcomes; operational logs are admin-only.
operationsRouter.get(
  '/nifi-logs',
  authenticate,
  requireHuman,
  requireRole('admin'),
  async (_req, res) => {
    try {
      const result = await pool.query(`
        SELECT id, flow_name, outcome, http_status, message, created_at
        FROM nifi_request_logs
        ORDER BY created_at DESC, id DESC
        LIMIT 100
      `)
      res.json(result.rows)
    } catch (error) {
      sendError(res, error, 'Failed to fetch NiFi request logs')
    }
  },
)
