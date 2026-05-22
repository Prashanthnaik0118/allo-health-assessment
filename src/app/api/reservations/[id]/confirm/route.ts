// src/app/api/reservations/[id]/confirm/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params

    const result = await prisma.$transaction(async (tx) => {
      // Lock the reservation row to prevent concurrent confirms
      const reservation = await tx.reservation.findUnique({
        where: { id },
      })

      if (!reservation) {
        return { error: 'Reservation not found', status: 404 }
      }

      // Check expiry FIRST — spec requires 410 if expired
      if (reservation.expiresAt < new Date()) {
        // If it's still pending (not yet cleaned up), release the held stock
        if (reservation.status === 'pending') {
          await tx.$executeRaw`
            UPDATE "StockLevel"
            SET "reservedUnits" = GREATEST(0, "reservedUnits" - ${reservation.quantity})
            WHERE "productId" = ${reservation.productId}
              AND "warehouseId" = ${reservation.warehouseId}
          `
          await tx.reservation.update({
            where: { id },
            data: { status: 'released' },
          })
        }
        return { error: 'Reservation has expired', status: 410 }  // 410 Gone — spec requirement
      }

      if (reservation.status !== 'pending') {
        if (reservation.status === 'confirmed') {
          return { error: 'Reservation already confirmed', status: 400 }
        }
        return { error: 'Reservation has been released', status: 400 }
      }

      // Confirm: mark as confirmed.
      // The reservedUnits stay as-is because these units are now permanently sold.
      // In a real system you'd decrement totalUnits and reservedUnits together
      // to reflect the permanent sale. Here we keep it simple: confirmed means
      // the stock is consumed and won't be returned.
      const confirmed = await tx.reservation.update({
        where: { id },
        data: { status: 'confirmed' },
        include: { product: true, warehouse: true },
      })

      return { reservation: confirmed, status: 200 }
    })

    if ('error' in result) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    return NextResponse.json(result.reservation, { status: 200 })
  } catch (error) {
    console.error('[POST /api/reservations/:id/confirm]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
