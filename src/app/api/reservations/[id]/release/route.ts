// src/app/api/reservations/[id]/release/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params

    const result = await prisma.$transaction(async (tx) => {
      const reservation = await tx.reservation.findUnique({
        where: { id },
      })

      if (!reservation) {
        return { error: 'Reservation not found', status: 404 }
      }

      if (reservation.status !== 'pending') {
        // Idempotent: if already released, that's fine
        if (reservation.status === 'released') {
          return { message: 'Already released', status: 200 }
        }
        return { error: 'Cannot release a confirmed reservation', status: 400 }
      }

      // Give the units back to available pool
      await tx.$executeRaw`
        UPDATE "StockLevel"
        SET "reservedUnits" = GREATEST(0, "reservedUnits" - ${reservation.quantity})
        WHERE "productId" = ${reservation.productId}
          AND "warehouseId" = ${reservation.warehouseId}
      `

      const released = await tx.reservation.update({
        where: { id },
        data: { status: 'released' },
        include: { product: true, warehouse: true },
      })

      return { reservation: released, status: 200 }
    })

    if ('error' in result) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    return NextResponse.json(
      'reservation' in result ? result.reservation : { message: result.message },
      { status: 200 }
    )
  } catch (error) {
    console.error('[POST /api/reservations/:id/release]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
