// src/app/page.tsx
'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

type StockEntry = {
  warehouseId: string
  warehouseName: string
  warehouseLocation: string
  totalUnits: number
  reservedUnits: number
  availableUnits: number
}

type Product = {
  id: string
  name: string
  description: string
  price: number
  imageUrl: string
  stock: StockEntry[]
}

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reserving, setReserving] = useState<string | null>(null) // productId+warehouseId
  const [reserveError, setReserveError] = useState<string | null>(null)
  const router = useRouter()

  const fetchProducts = async () => {
    try {
      const res = await fetch('/api/products')
      if (!res.ok) throw new Error('Failed to load products')
      const data = await res.json()
      setProducts(data)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchProducts()
  }, [])

  const handleReserve = async (productId: string, warehouseId: string) => {
    const key = `${productId}-${warehouseId}`
    setReserving(key)
    setReserveError(null)

    try {
      const res = await fetch('/api/reservations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId, warehouseId, quantity: 1 }),
      })

      const data = await res.json()

      if (res.status === 409) {
        // Show the 409 error visibly — spec says don't swallow errors
        setReserveError('Sorry, not enough stock available. Someone may have just reserved the last unit.')
        return
      }

      if (!res.ok) {
        setReserveError(data.error || 'Failed to reserve. Please try again.')
        return
      }

      // Success — go to checkout with the reservation id
      router.push(`/checkout/${data.id}`)
    } catch (e) {
      setReserveError('Network error. Please try again.')
    } finally {
      setReserving(null)
    }
  }

  const totalAvailable = (stock: StockEntry[]) =>
    stock.reduce((sum, s) => sum + s.availableUnits, 0)

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <div className="text-[#c8f542] font-mono text-sm tracking-widest animate-pulse">
          LOADING INVENTORY...
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <div className="text-red-400 font-mono text-sm">{error}</div>
      </div>
    )
  }

  return (
    <main className="min-h-screen bg-[#0a0a0a] text-white">
      {/* Header */}
      <header className="border-b border-[#1e1e1e] px-8 py-6 flex items-center justify-between">
        <div>
          <span className="text-[#c8f542] font-mono text-xs tracking-[0.3em] uppercase">
            Allo Health
          </span>
          <h1 className="text-2xl font-light tracking-tight mt-1">
            Inventory
          </h1>
        </div>
        <button
          onClick={fetchProducts}
          className="text-xs font-mono text-neutral-500 hover:text-[#c8f542] transition-colors border border-neutral-800 hover:border-[#c8f542] px-4 py-2 rounded"
        >
          ↻ REFRESH
        </button>
      </header>

      {/* Error banner */}
      {reserveError && (
        <div className="mx-8 mt-6 p-4 bg-red-950 border border-red-700 rounded text-red-300 text-sm font-mono flex items-start gap-3">
          <span className="text-red-500 mt-0.5">⚠</span>
          <div>
            <div className="font-semibold text-red-400 mb-1">RESERVATION FAILED</div>
            {reserveError}
          </div>
          <button
            onClick={() => setReserveError(null)}
            className="ml-auto text-red-600 hover:text-red-400"
          >✕</button>
        </div>
      )}

      {/* Product grid */}
      <div className="px-8 py-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {products.map((product) => {
          const available = totalAvailable(product.stock)
          const isOutOfStock = available === 0
          const isLowStock = available > 0 && available <= 3

          return (
            <div
              key={product.id}
              className="bg-[#111] border border-[#1e1e1e] rounded-lg overflow-hidden hover:border-[#333] transition-colors group"
            >
              {/* Product image */}
              <div className="h-48 bg-[#161616] overflow-hidden relative">
                {product.imageUrl ? (
                  <img
                    src={product.imageUrl}
                    alt={product.name}
                    className="w-full h-full object-cover opacity-80 group-hover:opacity-100 group-hover:scale-105 transition-all duration-500"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-neutral-700">
                    <span className="text-4xl">⬡</span>
                  </div>
                )}
                {/* Stock badge */}
                <div className={`absolute top-3 right-3 text-xs font-mono px-2 py-1 rounded ${
                  isOutOfStock
                    ? 'bg-red-950 text-red-400 border border-red-800'
                    : isLowStock
                    ? 'bg-amber-950 text-amber-400 border border-amber-800'
                    : 'bg-[#1a2a00] text-[#c8f542] border border-[#2d4a00]'
                }`}>
                  {isOutOfStock ? 'OUT OF STOCK' : isLowStock ? `ONLY ${available} LEFT` : `${available} AVAILABLE`}
                </div>
              </div>

              {/* Product info */}
              <div className="p-5">
                <h2 className="font-medium text-white text-base mb-1 leading-tight">
                  {product.name}
                </h2>
                <p className="text-neutral-500 text-xs leading-relaxed mb-4 line-clamp-2">
                  {product.description}
                </p>

                {/* Price */}
                <div className="text-[#c8f542] font-mono text-lg font-semibold mb-4">
                  ₹{product.price.toLocaleString('en-IN')}
                </div>

                {/* Warehouse stock breakdown */}
                <div className="space-y-1.5 mb-5">
                  {product.stock.map((s) => (
                    <div key={s.warehouseId} className="flex items-center justify-between">
                      <span className="text-xs text-neutral-600 truncate">{s.warehouseName}</span>
                      <span className={`text-xs font-mono ${
                        s.availableUnits === 0 ? 'text-neutral-700' :
                        s.availableUnits <= 2 ? 'text-amber-500' : 'text-neutral-400'
                      }`}>
                        {s.availableUnits === 0 ? '—' : `${s.availableUnits} units`}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Reserve buttons per warehouse */}
                <div className="space-y-2">
                  {product.stock
                    .filter((s) => s.availableUnits > 0)
                    .map((s) => {
                      const btnKey = `${product.id}-${s.warehouseId}`
                      const isLoading = reserving === btnKey
                      return (
                        <button
                          key={s.warehouseId}
                          onClick={() => handleReserve(product.id, s.warehouseId)}
                          disabled={isLoading || reserving !== null}
                          className="w-full py-2.5 px-4 bg-[#c8f542] text-black text-xs font-mono font-bold tracking-widest rounded hover:bg-[#d4f75a] disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
                        >
                          {isLoading ? (
                            <span className="animate-spin">⟳</span>
                          ) : (
                            <>RESERVE · {s.warehouseName.split(' ')[0].toUpperCase()}</>
                          )}
                        </button>
                      )
                    })}
                  {isOutOfStock && (
                    <div className="w-full py-2.5 px-4 border border-neutral-800 text-neutral-700 text-xs font-mono text-center rounded">
                      OUT OF STOCK
                    </div>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </main>
  )
}
