// src/app/api/reservations/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

// Zod schema for request validation (shared validation = less bugs)
const ReserveSchema = z.object({
  productId: z.string().min(1),
  warehouseId: z.string().min(1),
  quantity: z.number().int().positive().max(100),
})

export async function POST(request: NextRequest) {
  try {
    // Bonus: Idempotency key support
    // If the client retries with the same key, return the original response
    const idempotencyKey = request.headers.get('Idempotency-Key')

    if (idempotencyKey) {
      const existing = await prisma.reservation.findUnique({
        where: { idempotencyKey },
        include: { product: true, warehouse: true },
      })
      if (existing) {
        // Return original response — safe to retry
        return NextResponse.json(existing, { status: 200 })
      }
    }

    const body = await request.json()
    const parsed = ReserveSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const { productId, warehouseId, quantity } = parsed.data

    // ============================================================
    // THE CORE CONCURRENCY-SAFE RESERVATION LOGIC
    // ============================================================
    //
    // PROBLEM: Two customers simultaneously try to reserve the last unit.
    // If we do:
    //   1. SELECT stock WHERE product=X → sees 1 unit available ✓
    //   2. SELECT stock WHERE product=X → sees 1 unit available ✓ (race!)
    //   3. UPDATE reservedUnits += 1   → reservedUnits = 1
    //   4. UPDATE reservedUnits += 1   → reservedUnits = 2 (WRONG! overbooked!)
    //
    // SOLUTION: Atomic conditional UPDATE
    // We update reservedUnits only if enough stock exists, in ONE SQL statement.
    // Postgres guarantees this is atomic — no two transactions can both succeed
    // for the same row simultaneously (row-level locking).
    //
    // If 0 rows are updated → not enough stock → return 409
    // If 1 row updated → reservation created → return 201
    // ============================================================

    const result = await prisma.$transaction(async (tx) => {
      // Atomic update: only succeeds if (totalUnits - reservedUnits) >= quantity
      // This is a single SQL operation — safe under any concurrency
      const updated = await tx.$executeRaw`
        UPDATE "StockLevel"
        SET "reservedUnits" = "reservedUnits" + ${quantity}
        WHERE "productId" = ${productId}
          AND "warehouseId" = ${warehouseId}
          AND ("totalUnits" - "reservedUnits") >= ${quantity}
      `

      if (updated === 0) {
        // 0 rows affected means the condition failed → not enough stock
        return { success: false }
      }

      // Stock successfully held — now create the reservation record
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000) // 10 minutes from now

      const reservation = await tx.reservation.create({
        data: {
          productId,
          warehouseId,
          quantity,
          status: 'pending',
          expiresAt,
          ...(idempotencyKey ? { idempotencyKey } : {}),
        },
        include: {
          product: true,
          warehouse: true,
        },
      })

      return { success: true, reservation }
    })

    if (!result.success) {
      return NextResponse.json(
        { error: 'Not enough stock available for this product in the selected warehouse.' },
        { status: 409 }  // 409 Conflict — spec requirement
      )
    }

    return NextResponse.json(result.reservation, { status: 201 })
  } catch (error) {
    console.error('[POST /api/reservations]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
