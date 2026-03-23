import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth-helpers"

// GET /api/jobs - List generation jobs with pagination
export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAuth()
    if (authResult.error) return authResult.error
    const { user } = authResult

    const { searchParams } = new URL(request.url)
    const status = searchParams.get("status")
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"))
    const limit = Math.min(50, Math.max(1, parseInt(searchParams.get("limit") || "10")))
    const skip = (page - 1) * limit

    const where: any = {}
    if (status) {
      where.status = status
    }

    const [jobs, total] = await Promise.all([
      prisma.generationJob.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit
      }),
      prisma.generationJob.count({ where })
    ])

    // Resolve product names, image type names, and template names for each job
    const allProductIds = [...new Set(jobs.flatMap(j => j.productIds))]
    const allImageTypeIds = [...new Set(jobs.flatMap(j => j.imageTypeIds))]
    const allTemplateIds = [...new Set(jobs.flatMap(j => j.templateIds || []))]

    const [products, imageTypes, templates] = await Promise.all([
      prisma.product.findMany({
        where: { id: { in: allProductIds } },
        select: { id: true, title: true, asin: true }
      }),
      prisma.imageType.findMany({
        where: { id: { in: allImageTypeIds } },
        select: { id: true, name: true }
      }),
      allTemplateIds.length > 0
        ? prisma.promptTemplate.findMany({
            where: { id: { in: allTemplateIds } },
            select: { id: true, name: true }
          })
        : Promise.resolve([])
    ])

    const productMap = new Map(products.map(p => [p.id, p]))
    const imageTypeMap = new Map(imageTypes.map(t => [t.id, t]))
    const templateMap = new Map(templates.map(t => [t.id, t]))

    const enrichedJobs = jobs.map(job => {
      const templateNames = (job.templateIds || [])
        .map(id => templateMap.get(id))
        .filter(Boolean)
        .map(t => t!.name)
      const imageTypeNames = job.imageTypeIds
        .map(id => imageTypeMap.get(id))
        .filter(Boolean)
        .map(t => t!.name)

      return {
        ...job,
        productNames: job.productIds
          .map(id => productMap.get(id))
          .filter(Boolean)
          .map(p => p!.title),
        imageTypeNames: templateNames.length > 0 ? templateNames : imageTypeNames,
        templateNames
      }
    })

    return NextResponse.json({
      jobs: enrichedJobs,
      total,
      page,
      totalPages: Math.ceil(total / limit)
    })
  } catch (error) {
    console.error("Error fetching jobs:", error)
    return NextResponse.json(
      { error: "Failed to fetch jobs" },
      { status: 500 }
    )
  }
}
