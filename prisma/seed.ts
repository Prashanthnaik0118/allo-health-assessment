// prisma/seed.ts
// Run with: npx prisma db seed
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('🌱 Seeding database...')

  // Clean up existing data
  await prisma.reservation.deleteMany()
  await prisma.stockLevel.deleteMany()
  await prisma.product.deleteMany()
  await prisma.warehouse.deleteMany()

  // Create warehouses
  const mumbai = await prisma.warehouse.create({
    data: { name: 'Mumbai Central', location: 'Mumbai, MH' },
  })
  const delhi = await prisma.warehouse.create({
    data: { name: 'Delhi North', location: 'Delhi, DL' },
  })
  const bangalore = await prisma.warehouse.create({
    data: { name: 'Bangalore Hub', location: 'Bangalore, KA' },
  })

  // Create products
  const products = await Promise.all([
    prisma.product.create({
      data: {
        name: 'Allo Performance Kit',
        description: 'Complete wellness kit for peak performance. Clinically formulated.',
        price: 1299,
        imageUrl: 'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=400',
      },
    }),
    prisma.product.create({
      data: {
        name: 'Allo Daily Wellness Pack',
        description: 'Daily supplements for sustained energy and vitality.',
        price: 899,
        imageUrl: 'https://images.unsplash.com/photo-1550572017-edd951aa8f72?w=400',
      },
    }),
    prisma.product.create({
      data: {
        name: 'Allo Recovery Formula',
        description: 'Post-workout recovery blend with adaptogens.',
        price: 1599,
        imageUrl: 'https://images.unsplash.com/photo-1576671081837-49000212a370?w=400',
      },
    }),
    prisma.product.create({
      data: {
        name: 'Allo Sleep Support',
        description: 'Natural sleep aid with ashwagandha and melatonin.',
        price: 799,
        imageUrl: 'https://images.unsplash.com/photo-1512069772995-ec65ed45afd6?w=400',
      },
    }),
  ])

  // Create stock levels for each product in each warehouse
  const stockData = [
    // Mumbai
    { productId: products[0].id, warehouseId: mumbai.id, totalUnits: 50, reservedUnits: 0 },
    { productId: products[1].id, warehouseId: mumbai.id, totalUnits: 2, reservedUnits: 0 },  // Low stock!
    { productId: products[2].id, warehouseId: mumbai.id, totalUnits: 30, reservedUnits: 0 },
    { productId: products[3].id, warehouseId: mumbai.id, totalUnits: 0, reservedUnits: 0 },  // Out of stock

    // Delhi
    { productId: products[0].id, warehouseId: delhi.id, totalUnits: 20, reservedUnits: 0 },
    { productId: products[1].id, warehouseId: delhi.id, totalUnits: 45, reservedUnits: 0 },
    { productId: products[2].id, warehouseId: delhi.id, totalUnits: 1, reservedUnits: 0 },   // Very low!
    { productId: products[3].id, warehouseId: delhi.id, totalUnits: 60, reservedUnits: 0 },

    // Bangalore
    { productId: products[0].id, warehouseId: bangalore.id, totalUnits: 35, reservedUnits: 0 },
    { productId: products[1].id, warehouseId: bangalore.id, totalUnits: 25, reservedUnits: 0 },
    { productId: products[2].id, warehouseId: bangalore.id, totalUnits: 40, reservedUnits: 0 },
    { productId: products[3].id, warehouseId: bangalore.id, totalUnits: 15, reservedUnits: 0 },
  ]

  await prisma.stockLevel.createMany({ data: stockData })

  console.log('✅ Seed complete!')
  console.log(`   ${3} warehouses`)
  console.log(`   ${products.length} products`)
  console.log(`   ${stockData.length} stock levels`)
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
