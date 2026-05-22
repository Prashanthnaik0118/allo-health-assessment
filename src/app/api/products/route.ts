// src/app/api/products/route.ts
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
  try {
    const products = await prisma.product.findMany({
      include: {
        stockLevels: {
          include: {
            warehouse: true,
          },
        },
      },
    })

    // Transform: compute availableUnits = totalUnits - reservedUnits
    // Also lazy-cleanup expired reservations on read (one valid expiry strategy)
    const now = new Date()

    // Release expired reservations and free their stock
    // This is the "lazy cleanup on read" approach mentioned in the spec
    const expiredReservations = await prisma.reservation.findMany({
      where: {
        status: 'pending',
        expiresAt: { lt: now },
      },
    })

    if (expiredReservations.length > 0) {
      // Use a transaction to atomically release each expired reservation
      await prisma.$transaction(
        expiredReservations.map((res) =>
          prisma.$executeRaw`
            UPDATE "StockLevel"
            SET "reservedUnits" = GREATEST(0, "reservedUnits" - ${res.quantity})
            WHERE "productId" = ${res.productId}
              AND "warehouseId" = ${res.warehouseId}
          `
        ).concat(
          expiredReservations.map((res) =>
            prisma.reservation.update({
              where: { id: res.id },
              data: { status: 'released' },
            })
          ) as any
        )
      )
    }

    // Re-fetch after cleanup
    const freshProducts = await prisma.product.findMany({
      include: {
        stockLevels: {
          include: { warehouse: true },
        },
      },
    })

    const response = freshProducts.map((product) => ({
      id: product.id,
      name: product.name,
      description: product.description,
      price: product.price,
      imageUrl: product.imageUrl,
      stock: product.stockLevels.map((sl) => ({
        warehouseId: sl.warehouseId,
        warehouseName: sl.warehouse.name,
        warehouseLocation: sl.warehouse.location,
        totalUnits: sl.totalUnits,
        reservedUnits: sl.reservedUnits,
        availableUnits: sl.totalUnits - sl.reservedUnits,  // The key derived field
      })),
    }))

    return NextResponse.json(response)
  } catch (error) {
    console.error('[GET /api/products]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
