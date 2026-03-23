import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth-helpers"

// GET /api/analytics - Get analytics data
export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAuth()
    if (authResult.error) return authResult.error
    const { user } = authResult

    const { searchParams } = new URL(request.url)
    const days = parseInt(searchParams.get("days") || "30")

    const startDate = new Date()
    startDate.setDate(startDate.getDate() - days)
    startDate.setHours(0, 0, 0, 0)

    // Get aggregated analytics
    const analytics = await prisma.analytics.findMany({
      where: {
        date: {
          gte: startDate
        }
      },
      orderBy: {
        date: 'desc'
      }
    })

    // Calculate totals
    type AnalyticsTotals = { imagesGenerated: number; imagesApproved: number; imagesRejected: number; totalCost: number }
    const totals = analytics.reduce(
      (acc: AnalyticsTotals, curr: typeof analytics[0]) => ({
        imagesGenerated: acc.imagesGenerated + curr.imagesGenerated,
        imagesApproved: acc.imagesApproved + curr.imagesApproved,
        imagesRejected: acc.imagesRejected + curr.imagesRejected,
        totalCost: acc.totalCost + (curr.totalCost || 0)
      }),
      { imagesGenerated: 0, imagesApproved: 0, imagesRejected: 0, totalCost: 0 }
    )

    // Get product stats
    const productStats = await prisma.product.groupBy({
      by: ['status'],
      _count: true
    })

    // Get image status breakdown
    const imageStats = await prisma.generatedImage.groupBy({
      by: ['status'],
      _count: true
    })

    return NextResponse.json({
      totals,
      dailyAnalytics: analytics,
      productStats,
      imageStats
    })
  } catch (error) {
    console.error("Error fetching analytics:", error)
    return NextResponse.json(
      { error: "Failed to fetch analytics" },
      { status: 500 }
    )
  }
}
