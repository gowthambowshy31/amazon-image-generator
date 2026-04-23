"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { useParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Check, Download, Play, RefreshCw, Star, Timer } from "lucide-react"

interface Variant {
  index: number
  url?: string
  key?: string
  status: "ok" | "failed" | "queued"
  error?: string
  queuedAt?: string
}

interface Item {
  original: string
  originalUrl?: string
  variants: Variant[]
}

interface Manifest {
  batchId: string
  createdAt: string
  prompt: string
  variantsPerImage: number
  items: Item[]
}

type FavoriteKey = string

function favKey(original: string, variantIndex: number): FavoriteKey {
  return `${original}::v${variantIndex}`
}

export default function GalleryPage() {
  const params = useParams<{ batchId: string }>()
  const batchId = params.batchId

  const [manifest, setManifest] = useState<Manifest | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [favorites, setFavorites] = useState<Set<FavoriteKey>>(new Set())
  const [overrides, setOverrides] = useState<Record<FavoriteKey, string>>({})
  const [regenTarget, setRegenTarget] = useState<{ item: Item; variant: Variant } | null>(null)
  const [regenPrompt, setRegenPrompt] = useState("")
  const [regenBusy, setRegenBusy] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [quota, setQuota] = useState<{
    used: number
    limit: number
    remaining: number
    resetsAt: string
  } | null>(null)
  const [queueCounts, setQueueCounts] = useState<{
    queued: number
    running: number
    completed: number
    failed: number
  } | null>(null)
  const [drainBusy, setDrainBusy] = useState(false)
  const [countdown, setCountdown] = useState("")

  const reloadManifest = useCallback(async () => {
    const res = await fetch(`/api/batch/manifest?batch=${encodeURIComponent(batchId)}`)
    if (!res.ok) throw new Error(`Failed to load manifest (${res.status})`)
    const data: Manifest = await res.json()
    setManifest(data)
    return data
  }, [batchId])

  const reloadQueueStatus = useCallback(async () => {
    try {
      const res = await fetch(`/api/batch/drain?batch=${encodeURIComponent(batchId)}`)
      if (!res.ok) return
      const data = await res.json()
      setQuota(data.quota)
      setQueueCounts({
        queued: data.queued,
        running: data.running,
        completed: data.completed,
        failed: data.failed,
      })
    } catch {}
  }, [batchId])

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      try {
        await reloadManifest()
      } catch (err) {
        if (!cancelled) setError((err as Error).message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    reloadQueueStatus()
    return () => {
      cancelled = true
    }
  }, [batchId, reloadManifest, reloadQueueStatus])

  // Poll manifest + queue status while anything is queued or running.
  useEffect(() => {
    const hasQueued =
      (queueCounts && (queueCounts.queued > 0 || queueCounts.running > 0)) ||
      manifest?.items.some((it) => it.variants.some((v) => v.status === "queued"))
    if (!hasQueued) return
    const iv = setInterval(() => {
      reloadManifest().catch(() => {})
      reloadQueueStatus()
    }, 30_000)
    return () => clearInterval(iv)
  }, [queueCounts, manifest, reloadManifest, reloadQueueStatus])

  // Live countdown to PT midnight.
  useEffect(() => {
    if (!quota?.resetsAt) return
    const update = () => {
      const ms = new Date(quota.resetsAt).getTime() - Date.now()
      if (ms <= 0) {
        setCountdown("0m")
        return
      }
      const h = Math.floor(ms / 3_600_000)
      const m = Math.floor((ms % 3_600_000) / 60_000)
      setCountdown(h > 0 ? `${h}h ${m}m` : `${m}m`)
    }
    update()
    const iv = setInterval(update, 30_000)
    return () => clearInterval(iv)
  }, [quota?.resetsAt])

  const runDrain = useCallback(async () => {
    setDrainBusy(true)
    try {
      const res = await fetch("/api/batch/drain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      })
      if (!res.ok) throw new Error(`Drain failed (${res.status})`)
      await reloadManifest()
      await reloadQueueStatus()
    } catch (err) {
      alert((err as Error).message)
    } finally {
      setDrainBusy(false)
    }
  }, [reloadManifest, reloadQueueStatus])

  useEffect(() => {
    try {
      const stored = localStorage.getItem(`gallery-favs:${batchId}`)
      if (stored) setFavorites(new Set(JSON.parse(stored)))
      const storedOverrides = localStorage.getItem(`gallery-overrides:${batchId}`)
      if (storedOverrides) setOverrides(JSON.parse(storedOverrides))
    } catch {}
  }, [batchId])

  useEffect(() => {
    try {
      localStorage.setItem(`gallery-favs:${batchId}`, JSON.stringify(Array.from(favorites)))
    } catch {}
  }, [favorites, batchId])

  useEffect(() => {
    try {
      localStorage.setItem(`gallery-overrides:${batchId}`, JSON.stringify(overrides))
    } catch {}
  }, [overrides, batchId])

  const toggleFavorite = useCallback((original: string, variantIndex: number) => {
    setFavorites((prev) => {
      const next = new Set(prev)
      const k = favKey(original, variantIndex)
      if (next.has(k)) next.delete(k)
      else next.add(k)
      return next
    })
  }, [])

  const effectiveUrl = useCallback(
    (item: Item, v: Variant) => overrides[favKey(item.original, v.index)] || v.url,
    [overrides]
  )

  const stats = useMemo(() => {
    if (!manifest) return { ok: 0, failed: 0, queued: 0, total: 0 }
    let ok = 0
    let failed = 0
    let queued = 0
    for (const it of manifest.items) {
      for (const v of it.variants) {
        if (v.status === "ok") ok++
        else if (v.status === "queued") queued++
        else failed++
      }
    }
    return { ok, failed, queued, total: ok + failed + queued }
  }, [manifest])

  const downloadZip = useCallback(
    async (mode: "all" | "favorites") => {
      if (!manifest) return
      const items: { url: string; fileName: string }[] = []
      for (const it of manifest.items) {
        const stem = it.original.replace(/\.[^.]+$/, "")
        for (const v of it.variants) {
          const url = effectiveUrl(it, v)
          if (!url) continue
          if (mode === "favorites" && !favorites.has(favKey(it.original, v.index))) continue
          const ext = url.split(".").pop()?.split("?")[0] || "jpg"
          items.push({
            url,
            fileName: `${stem}_v${v.index}.${ext}`,
          })
        }
      }
      if (!items.length) {
        alert(mode === "favorites" ? "No favorites selected." : "No images to download.")
        return
      }

      setDownloading(true)
      try {
        const res = await fetch("/api/batch/download", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            batchId,
            items,
            zipName: `${batchId}-${mode}.zip`,
          }),
        })
        if (!res.ok) throw new Error(`Zip failed (${res.status})`)
        const blob = await res.blob()
        const a = document.createElement("a")
        const url = URL.createObjectURL(blob)
        a.href = url
        a.download = `${batchId}-${mode}.zip`
        document.body.appendChild(a)
        a.click()
        a.remove()
        URL.revokeObjectURL(url)
      } catch (err) {
        alert((err as Error).message)
      } finally {
        setDownloading(false)
      }
    },
    [manifest, favorites, batchId, effectiveUrl]
  )

  const openRegenerate = (item: Item, variant: Variant) => {
    setRegenTarget({ item, variant })
    setRegenPrompt(manifest?.prompt || "")
  }

  const runRegenerate = async () => {
    if (!regenTarget || !manifest) return
    const { item, variant } = regenTarget
    if (!item.originalUrl) {
      alert("Original source missing in manifest — cannot regenerate.")
      return
    }
    setRegenBusy(true)
    try {
      const res = await fetch("/api/batch/regenerate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          batchId,
          original: item.original,
          variantIndex: variant.index,
          prompt: regenPrompt,
          sourceUrl: item.originalUrl,
        }),
      })
      const data = await res.json()
      if (res.status === 429 && data?.queued) {
        // Out of quota — server has queued this slot for the next reset.
        await reloadManifest()
        await reloadQueueStatus()
        setRegenTarget(null)
        alert(
          `Daily image quota reached. This slot is queued and will regenerate automatically after the next reset (${new Date(
            data.quota?.resetsAt || Date.now()
          ).toLocaleString()}).`
        )
        return
      }
      if (!res.ok) throw new Error(data?.error || `Regenerate failed (${res.status})`)
      setOverrides((prev) => ({ ...prev, [favKey(item.original, variant.index)]: data.url }))
      await reloadQueueStatus()
      setRegenTarget(null)
    } catch (err) {
      alert((err as Error).message)
    } finally {
      setRegenBusy(false)
    }
  }

  if (loading) {
    return <div className="p-8 text-center text-muted-foreground">Loading gallery…</div>
  }
  if (error) {
    return <div className="p-8 text-center text-destructive">Error: {error}</div>
  }
  if (!manifest) return null

  const favCount = favorites.size

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b border-border/50 bg-background/95 backdrop-blur">
        <div className="mx-auto max-w-7xl px-6 py-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold">Enhanced Images</h1>
            <p className="text-xs text-muted-foreground">
              Batch <span className="font-mono">{manifest.batchId}</span> ·{" "}
              {manifest.items.length} originals · {stats.ok} variants
              {stats.queued > 0 && (
                <span className="text-amber-600 dark:text-amber-400"> · {stats.queued} queued</span>
              )}
              {stats.failed > 0 && (
                <span className="text-destructive"> · {stats.failed} failed</span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="gap-1">
              <Star className="h-3 w-3" /> {favCount} favorite{favCount === 1 ? "" : "s"}
            </Badge>
            <Button
              variant="outline"
              size="sm"
              disabled={downloading || favCount === 0}
              onClick={() => downloadZip("favorites")}
            >
              <Download className="h-4 w-4 mr-1" />
              Download favorites
            </Button>
            <Button size="sm" disabled={downloading} onClick={() => downloadZip("all")}>
              <Download className="h-4 w-4 mr-1" />
              Download all
            </Button>
          </div>
        </div>

        {quota && (
          <div className="border-t border-border/40 bg-muted/40">
            <div className="mx-auto max-w-7xl px-6 py-2 flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-4 text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <Timer className="h-3.5 w-3.5" />
                  <strong className="text-foreground font-semibold">
                    {quota.used} / {quota.limit}
                  </strong>{" "}
                  images used today
                  {countdown && <> · resets in <strong className="text-foreground">{countdown}</strong></>}
                </span>
                {queueCounts && queueCounts.queued > 0 && (
                  <span className="text-amber-600 dark:text-amber-400">
                    {queueCounts.queued} waiting for next reset
                  </span>
                )}
                {queueCounts && queueCounts.running > 0 && (
                  <span>{queueCounts.running} running…</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {queueCounts && queueCounts.queued > 0 && (
                  <Button size="sm" variant="outline" onClick={runDrain} disabled={drainBusy || quota.remaining === 0}>
                    <Play className="h-3.5 w-3.5 mr-1" />
                    {drainBusy ? "Running…" : "Run queued now"}
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}
      </header>

      <main className="mx-auto max-w-7xl px-6 py-6 space-y-6">
        {manifest.items.map((item) => (
          <Card key={item.original} className="p-4">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Original</div>
                <div className="font-mono text-sm">{item.original}</div>
                <div className="text-xs text-muted-foreground mt-1">
                  {item.variants.filter((v) => v.status === "ok").length}/
                  {item.variants.length} variants
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {item.originalUrl && (
                <div className="relative rounded-lg border border-border/60 overflow-hidden group">
                  <div className="aspect-square bg-muted flex items-center justify-center">
                    <img
                      src={item.originalUrl}
                      alt={item.original}
                      className="h-full w-full object-cover"
                      loading="lazy"
                    />
                  </div>
                  <div className="absolute top-2 left-2 flex gap-1">
                    <Badge variant="outline" className="text-[10px] bg-background/80">
                      original
                    </Badge>
                  </div>
                  <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition">
                    <a href={item.originalUrl} download={item.original} target="_blank" rel="noreferrer">
                      <Button size="icon" variant="secondary" className="h-8 w-8" title="Download original">
                        <Download className="h-4 w-4" />
                      </Button>
                    </a>
                  </div>
                </div>
              )}
              {item.variants.map((v) => {
                const k = favKey(item.original, v.index)
                const isFav = favorites.has(k)
                const url = effectiveUrl(item, v)
                const isQueued = v.status === "queued" && !overrides[k]
                const isFailed = !isQueued && (v.status === "failed" || !url)

                return (
                  <div
                    key={v.index}
                    className={`relative rounded-lg border overflow-hidden group ${
                      isFav ? "border-primary ring-2 ring-primary/40" : "border-border/60"
                    }`}
                  >
                    <div className="aspect-square bg-muted flex items-center justify-center">
                      {isQueued ? (
                        <div className="p-4 text-center">
                          <Timer className="h-6 w-6 mx-auto mb-2 text-amber-600 dark:text-amber-400" />
                          <div className="text-sm font-medium text-amber-700 dark:text-amber-400">
                            Waiting for next reset
                          </div>
                          <div className="text-xs text-muted-foreground mt-1">
                            Will auto-generate in {countdown || "a few hours"}
                          </div>
                        </div>
                      ) : isFailed ? (
                        <div className="p-4 text-center">
                          <div className="text-destructive text-sm font-medium">Failed</div>
                          <div className="text-xs text-muted-foreground mt-1 break-all">
                            {v.error || "no output"}
                          </div>
                        </div>
                      ) : (
                        <img
                          src={url}
                          alt={`${item.original} v${v.index}`}
                          className="h-full w-full object-cover"
                          loading="lazy"
                        />
                      )}
                    </div>

                    <div className="absolute top-2 left-2 flex gap-1">
                      <Badge variant="secondary" className="text-[10px]">
                        v{v.index}
                      </Badge>
                      {overrides[k] && (
                        <Badge variant="default" className="text-[10px]">
                          regenerated
                        </Badge>
                      )}
                      {isQueued && (
                        <Badge className="text-[10px] bg-amber-500 text-black hover:bg-amber-500">
                          queued
                        </Badge>
                      )}
                    </div>

                    {!isFailed && !isQueued && (
                      <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition">
                        <Button
                          size="icon"
                          variant={isFav ? "default" : "secondary"}
                          className="h-8 w-8"
                          onClick={() => toggleFavorite(item.original, v.index)}
                          title={isFav ? "Unfavorite" : "Favorite"}
                        >
                          {isFav ? <Check className="h-4 w-4" /> : <Star className="h-4 w-4" />}
                        </Button>
                        <Button
                          size="icon"
                          variant="secondary"
                          className="h-8 w-8"
                          onClick={() => openRegenerate(item, v)}
                          title="Regenerate with edited prompt"
                        >
                          <RefreshCw className="h-4 w-4" />
                        </Button>
                        <a href={url} download target="_blank" rel="noreferrer">
                          <Button size="icon" variant="secondary" className="h-8 w-8" title="Download">
                            <Download className="h-4 w-4" />
                          </Button>
                        </a>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </Card>
        ))}
      </main>

      <Dialog open={!!regenTarget} onOpenChange={(open) => !open && setRegenTarget(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              Regenerate {regenTarget?.item.original} (v{regenTarget?.variant.index})
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Edit the prompt and regenerate. The new image will replace this slot in your view.
            </p>
            <Textarea
              value={regenPrompt}
              onChange={(e) => setRegenPrompt(e.target.value)}
              rows={10}
              className="font-mono text-xs"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRegenTarget(null)} disabled={regenBusy}>
              Cancel
            </Button>
            <Button onClick={runRegenerate} disabled={regenBusy || !regenPrompt.trim()}>
              {regenBusy ? "Generating…" : "Regenerate"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
