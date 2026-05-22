// src/app/api/cron/expire-reservations/route.ts
// Vercel Cron job — runs every minute to release expired reservations
// Configure in vercel.json: { "crons": [{ "path": "/api/cron/expire-reservations", "schedule": "* * * * *" }] }
//
// This is the PRODUCTION expiry mechanism.
// The lazy cleanup in GET /api/products handles it in dev/low traffic,
// but this cron ensures timely cleanup even if nobody is browsing.

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  // Protect this endpoint — only Vercel's cron service should call it
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const now = new Date()

    // Find all expired pending reservations
    const expiredReservations = await prisma.reservation.findMany({
      where: {
        status: 'pending',
        expiresAt: { lt: now },
      },
    })

    if (expiredReservations.length === 0) {
      return NextResponse.json({ released: 0, message: 'No expired reservations' })
    }

    // Atomically release each one: return stock + update status
    let released = 0
    for (const res of expiredReservations) {
      await prisma.$transaction([
        prisma.$executeRaw`
          UPDATE "StockLevel"
          SET "reservedUnits" = GREATEST(0, "reservedUnits" - ${res.quantity})
          WHERE "productId" = ${res.productId}
            AND "warehouseId" = ${res.warehouseId}
        `,
        prisma.reservation.update({
          where: { id: res.id },
          data: { status: 'released' },
        }),
      ])
      released++
    }

    console.log(`[CRON] Released ${released} expired reservations`)
    return NextResponse.json({ released, message: `Released ${released} reservations` })
  } catch (error) {
    console.error('[CRON /expire-reservations]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
