// src/app/checkout/[id]/page.tsx
'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'

type Reservation = {
  id: string
  status: 'pending' | 'confirmed' | 'released'
  quantity: number
  expiresAt: string
  product: {
    name: string
    price: number
    imageUrl: string
    description: string
  }
  warehouse: {
    name: string
    location: string
  }
}

function useCountdown(expiresAt: string | null) {
  const [secondsLeft, setSecondsLeft] = useState<number>(0)

  useEffect(() => {
    if (!expiresAt) return

    const tick = () => {
      const diff = Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000))
      setSecondsLeft(diff)
    }

    tick()
    const interval = setInterval(tick, 1000)
    return () => clearInterval(interval)
  }, [expiresAt])

  return secondsLeft
}

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0')
  const s = (seconds % 60).toString().padStart(2, '0')
  return `${m}:${s}`
}

export default function CheckoutPage({ params }: { params: { id: string } }) {
  const router = useRouter()
  const [reservation, setReservation] = useState<Reservation | null>(null)
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const secondsLeft = useCountdown(reservation?.expiresAt ?? null)
  const isExpired = secondsLeft === 0 && reservation?.status === 'pending'
  const isUrgent = secondsLeft <= 60 && secondsLeft > 0

  const fetchReservation = useCallback(async () => {
    try {
      // We fetch current reservation status from a dedicated endpoint
      const res = await fetch(`/api/reservations/${params.id}`)
      if (!res.ok) throw new Error('Reservation not found')
      const data = await res.json()
      setReservation(data)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [params.id])

  useEffect(() => {
    fetchReservation()
  }, [fetchReservation])

  const handleConfirm = async () => {
    setActionLoading(true)
    setActionError(null)

    try {
      const res = await fetch(`/api/reservations/${params.id}/confirm`, {
        method: 'POST',
      })
      const data = await res.json()

      if (res.status === 410) {
        // 410 Gone — reservation expired
        setActionError('Your reservation has expired. The stock has been released. Please start over.')
        setReservation((prev) => prev ? { ...prev, status: 'released' } : null)
        return
      }

      if (!res.ok) {
        setActionError(data.error || 'Could not confirm. Please try again.')
        return
      }

      // Update state immediately — no page refresh needed (spec requirement)
      setReservation((prev) => prev ? { ...prev, status: 'confirmed' } : null)
    } catch {
      setActionError('Network error. Please try again.')
    } finally {
      setActionLoading(false)
    }
  }

  const handleCancel = async () => {
    setActionLoading(true)
    setActionError(null)

    try {
      const res = await fetch(`/api/reservations/${params.id}/release`, {
        method: 'POST',
      })

      if (!res.ok) {
        const data = await res.json()
        setActionError(data.error || 'Could not cancel. Please try again.')
        return
      }

      // Update state immediately — no page refresh (spec requirement)
      setReservation((prev) => prev ? { ...prev, status: 'released' } : null)
    } catch {
      setActionError('Network error. Please try again.')
    } finally {
      setActionLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <div className="text-[#c8f542] font-mono text-sm tracking-widest animate-pulse">
          LOADING RESERVATION...
        </div>
      </div>
    )
  }

  if (error || !reservation) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex flex-col items-center justify-center gap-4">
        <div className="text-red-400 font-mono text-sm">{error || 'Reservation not found'}</div>
        <button
          onClick={() => router.push('/')}
          className="text-xs font-mono text-neutral-500 hover:text-white border border-neutral-800 px-4 py-2 rounded"
        >
          ← BACK TO PRODUCTS
        </button>
      </div>
    )
  }

  const isConfirmed = reservation.status === 'confirmed'
  const isReleased = reservation.status === 'released'

  return (
    <main className="min-h-screen bg-[#0a0a0a] text-white flex flex-col">
      {/* Header */}
      <header className="border-b border-[#1e1e1e] px-8 py-6 flex items-center gap-4">
        <button
          onClick={() => router.push('/')}
          className="text-neutral-600 hover:text-white transition-colors text-sm font-mono"
        >
          ← BACK
        </button>
        <div className="h-4 w-px bg-[#1e1e1e]" />
        <span className="text-neutral-400 text-sm font-mono tracking-wide">
          {isConfirmed ? 'ORDER CONFIRMED' : isReleased ? 'RESERVATION ENDED' : 'CHECKOUT'}
        </span>
      </header>

      <div className="flex-1 px-8 py-10 max-w-2xl mx-auto w-full">

        {/* SUCCESS STATE */}
        {isConfirmed && (
          <div className="mb-8 p-6 bg-[#0f1a00] border border-[#2d4a00] rounded-lg text-center">
            <div className="text-[#c8f542] text-3xl mb-3">✓</div>
            <div className="text-[#c8f542] font-mono font-bold text-lg tracking-wider mb-2">
              ORDER CONFIRMED
            </div>
            <p className="text-neutral-400 text-sm">
              Payment received. Your order is being prepared for dispatch.
            </p>
          </div>
        )}

        {/* RELEASED / EXPIRED STATE */}
        {isReleased && (
          <div className="mb-8 p-6 bg-neutral-950 border border-neutral-800 rounded-lg text-center">
            <div className="text-neutral-500 text-3xl mb-3">○</div>
            <div className="text-neutral-400 font-mono font-bold text-lg tracking-wider mb-2">
              RESERVATION ENDED
            </div>
            <p className="text-neutral-600 text-sm mb-4">
              This reservation has been cancelled and the stock returned to inventory.
            </p>
            <button
              onClick={() => router.push('/')}
              className="text-xs font-mono text-[#c8f542] border border-[#c8f542] px-5 py-2.5 rounded hover:bg-[#c8f542] hover:text-black transition-colors"
            >
              START OVER
            </button>
          </div>
        )}

        {/* COUNTDOWN TIMER — only show for active pending reservations */}
        {reservation.status === 'pending' && (
          <div className={`mb-8 p-6 rounded-lg border text-center transition-colors ${
            isExpired
              ? 'bg-red-950 border-red-800'
              : isUrgent
              ? 'bg-amber-950 border-amber-800'
              : 'bg-[#0f1a00] border-[#1e3300]'
          }`}>
            <div className="text-xs font-mono tracking-[0.3em] uppercase mb-2 text-neutral-500">
              RESERVATION EXPIRES IN
            </div>
            <div className={`font-mono text-5xl font-bold tabular-nums transition-colors ${
              isExpired ? 'text-red-400' :
              isUrgent ? 'text-amber-400' :
              'text-[#c8f542]'
            }`}>
              {formatTime(secondsLeft)}
            </div>
            {isExpired && (
              <p className="text-red-400 text-xs font-mono mt-3">
                ⚠ EXPIRED — Complete your purchase or go back to products
              </p>
            )}
            {isUrgent && !isExpired && (
              <p className="text-amber-400 text-xs font-mono mt-3">
                ⚡ Hurry — this reservation expires soon!
              </p>
            )}
          </div>
        )}

        {/* Product card */}
        <div className="bg-[#111] border border-[#1e1e1e] rounded-lg overflow-hidden mb-6">
          <div className="flex gap-0">
            {reservation.product.imageUrl && (
              <div className="w-32 h-32 flex-shrink-0 bg-[#161616] overflow-hidden">
                <img
                  src={reservation.product.imageUrl}
                  alt={reservation.product.name}
                  className="w-full h-full object-cover"
                />
              </div>
            )}
            <div className="p-5 flex-1">
              <h2 className="font-medium text-white text-lg mb-1">
                {reservation.product.name}
              </h2>
              <p className="text-neutral-500 text-xs mb-3 line-clamp-2">
                {reservation.product.description}
              </p>
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs text-neutral-600 font-mono mb-0.5">WAREHOUSE</div>
                  <div className="text-xs text-neutral-400">{reservation.warehouse.name}</div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-neutral-600 font-mono mb-0.5">QTY</div>
                  <div className="text-neutral-400 text-sm">×{reservation.quantity}</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Order total */}
        <div className="bg-[#111] border border-[#1e1e1e] rounded-lg p-5 mb-6">
          <div className="flex items-center justify-between mb-3">
            <span className="text-neutral-500 text-sm">Subtotal</span>
            <span className="text-neutral-300 font-mono">
              ₹{(reservation.product.price * reservation.quantity).toLocaleString('en-IN')}
            </span>
          </div>
          <div className="flex items-center justify-between mb-3">
            <span className="text-neutral-500 text-sm">Shipping</span>
            <span className="text-[#c8f542] font-mono text-sm">FREE</span>
          </div>
          <div className="border-t border-[#1e1e1e] pt-3 flex items-center justify-between">
            <span className="text-white font-medium">Total</span>
            <span className="text-[#c8f542] font-mono font-bold text-xl">
              ₹{(reservation.product.price * reservation.quantity).toLocaleString('en-IN')}
            </span>
          </div>
        </div>

        {/* Action error */}
        {actionError && (
          <div className="mb-4 p-4 bg-red-950 border border-red-800 rounded text-red-300 text-sm font-mono flex items-start gap-3">
            <span className="text-red-500 mt-0.5">⚠</span>
            <span>{actionError}</span>
            <button
              onClick={() => setActionError(null)}
              className="ml-auto text-red-700 hover:text-red-400"
            >✕</button>
          </div>
        )}

        {/* Action buttons — only show when pending */}
        {reservation.status === 'pending' && (
          <div className="flex gap-3">
            <button
              onClick={handleConfirm}
              disabled={actionLoading || isExpired}
              className="flex-1 py-4 bg-[#c8f542] text-black font-mono font-bold text-sm tracking-widest rounded hover:bg-[#d4f75a] disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
            >
              {actionLoading ? (
                <span className="animate-spin font-normal">⟳</span>
              ) : (
                'CONFIRM PURCHASE'
              )}
            </button>
            <button
              onClick={handleCancel}
              disabled={actionLoading}
              className="py-4 px-6 border border-neutral-700 text-neutral-400 font-mono font-bold text-sm tracking-widest rounded hover:border-red-700 hover:text-red-400 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              CANCEL
            </button>
          </div>
        )}

        {/* Reservation ID for debugging */}
        <div className="mt-8 text-neutral-800 font-mono text-xs">
          ID: {reservation.id}
        </div>
      </div>
    </main>
  )
}
