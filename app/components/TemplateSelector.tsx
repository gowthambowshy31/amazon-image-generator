"use client"

import { useEffect, useState, useCallback } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"

interface TemplateVariable {
  id: string
  name: string
  displayName: string
  type: "TEXT" | "DROPDOWN" | "AUTO"
  isRequired: boolean
  defaultValue: string | null
  options: string[]
  autoFillSource: string | null
  order: number
}

interface Template {
  id: string
  name: string
  description: string | null
  promptText: string
  category: string
  order: number
  variables: TemplateVariable[]
}

interface Product {
  id: string
  title: string
  category?: string | null
  asin?: string | null
  metadata?: any
}

export interface TemplateSelection {
  templateId: string
  templateName: string
  renderedPrompt: string
}

interface TemplateSelectorProps {
  category: "image" | "video" | "both"
  product?: Product
  initialTemplateId?: string | null
  mode: "single" | "multi"
  onSelectionChange: (selections: TemplateSelection[]) => void
}

export default function TemplateSelector({
  category,
  product,
  initialTemplateId,
  mode,
  onSelectionChange
}: TemplateSelectorProps) {
  const [templates, setTemplates] = useState<Template[]>([])
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [variableValues, setVariableValues] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => {
    loadTemplates()
  }, [category])

  // Pre-select template when initialTemplateId is provided
  useEffect(() => {
    if (initialTemplateId && templates.length > 0 && selectedIds.size === 0) {
      const template = templates.find(t => t.id === initialTemplateId)
      if (template) {
        setSelectedIds(new Set([template.id]))
        initializeDefaults([template])
      }
    }
  }, [initialTemplateId, templates])

  // Auto-fill product values for AUTO variables whenever selection or product changes
  useEffect(() => {
    if (!product) return
    const selectedTemplates = templates.filter(t => selectedIds.has(t.id))
    if (selectedTemplates.length === 0) return

    const autoValues: Record<string, string> = {}
    for (const tmpl of selectedTemplates) {
      for (const variable of tmpl.variables) {
        if (variable.type === "AUTO" && variable.autoFillSource) {
          const source = variable.autoFillSource
          if (source === "product.title") {
            autoValues[variable.name] = product.title
          } else if (source === "product.category" && product.category) {
            autoValues[variable.name] = product.category
          } else if (source === "product.asin" && product.asin) {
            autoValues[variable.name] = product.asin
          } else if (source === "metadata.brand" && product.metadata?.brand) {
            autoValues[variable.name] = product.metadata.brand
          } else if (source === "metadata.manufacturer" && product.metadata?.manufacturer) {
            autoValues[variable.name] = product.metadata.manufacturer
          } else if (source.startsWith("metadata.attributes.") && product.metadata?.attributes) {
            const attrKey = source.replace("metadata.attributes.", "")
            const attrValue = product.metadata.attributes[attrKey]
            if (Array.isArray(attrValue) && attrValue[0]?.value) {
              autoValues[variable.name] = attrValue[0].value
            } else if (typeof attrValue === "string") {
              autoValues[variable.name] = attrValue
            }
          }
        }
      }
    }
    setVariableValues(prev => ({ ...prev, ...autoValues }))
  }, [selectedIds, product, templates])

  // Emit selections whenever variableValues or selectedIds change
  const emitSelections = useCallback(() => {
    const selectedTemplates = templates.filter(t => selectedIds.has(t.id))
    if (selectedTemplates.length === 0) {
      onSelectionChange([])
      return
    }

    const selections: TemplateSelection[] = selectedTemplates.map(tmpl => {
      let prompt = tmpl.promptText
      for (const variable of tmpl.variables) {
        const value = variableValues[variable.name] || ""
        prompt = prompt.replace(new RegExp(`\\{\\{${variable.name}\\}\\}`, "g"), value)
      }
      return {
        templateId: tmpl.id,
        templateName: tmpl.name,
        renderedPrompt: prompt
      }
    })

    onSelectionChange(selections)
  }, [templates, selectedIds, variableValues, onSelectionChange])

  useEffect(() => {
    emitSelections()
  }, [variableValues, selectedIds, templates])

  const loadTemplates = async (showRefreshing = false) => {
    try {
      if (showRefreshing) {
        setRefreshing(true)
      } else {
        setLoading(true)
      }
      const categoryParam = category === "both" ? "" : `?category=${category}`
      const separator = categoryParam ? "&" : "?"
      const response = await fetch(`/api/templates${categoryParam}${separator}_t=${Date.now()}`)
      if (response.ok) {
        const data = await response.json()
        const filtered = data.filter((t: Template) =>
          t.category === "both" || t.category === category
        )
        setTemplates(filtered)

        // If we had selections, try to preserve them
        if (selectedIds.size > 0) {
          const stillValid = new Set(
            [...selectedIds].filter(id => filtered.some((t: Template) => t.id === id))
          )
          if (stillValid.size !== selectedIds.size) {
            setSelectedIds(stillValid)
          }
        }
      }
    } catch (error) {
      console.error("Error loading templates:", error)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  const initializeDefaults = (selectedTemplates: Template[]) => {
    const defaults: Record<string, string> = {}
    for (const tmpl of selectedTemplates) {
      for (const variable of tmpl.variables) {
        if (variable.defaultValue) {
          defaults[variable.name] = variable.defaultValue
        }
      }
    }
    setVariableValues(prev => ({ ...defaults, ...prev }))
  }

  const toggleTemplate = (templateId: string) => {
    const template = templates.find(t => t.id === templateId)
    if (!template) return

    if (mode === "single") {
      if (selectedIds.has(templateId)) {
        setSelectedIds(new Set())
        setVariableValues({})
      } else {
        setSelectedIds(new Set([templateId]))
        initializeDefaults([template])
      }
    } else {
      const newIds = new Set(selectedIds)
      if (newIds.has(templateId)) {
        newIds.delete(templateId)
      } else {
        newIds.add(templateId)
        initializeDefaults([template])
      }
      setSelectedIds(newIds)
    }
  }

  const selectAll = () => {
    const allIds = new Set(templates.map(t => t.id))
    setSelectedIds(allIds)
    initializeDefaults(templates)
  }

  const deselectAll = () => {
    setSelectedIds(new Set())
    setVariableValues({})
  }

  // Collect unique variables from all selected templates
  const getUniqueVariables = (): TemplateVariable[] => {
    const selectedTemplates = templates.filter(t => selectedIds.has(t.id))
    const seen = new Map<string, TemplateVariable>()
    for (const tmpl of selectedTemplates) {
      for (const variable of tmpl.variables) {
        if (!seen.has(variable.name)) {
          seen.set(variable.name, variable)
        }
      }
    }
    return Array.from(seen.values()).sort((a, b) => a.order - b.order)
  }

  const getMissingRequired = (): string[] => {
    const uniqueVars = getUniqueVariables()
    return uniqueVars
      .filter(v => v.isRequired && !variableValues[v.name])
      .map(v => v.displayName)
  }

  if (loading) {
    return (
      <Card className="shadow-sm mb-6">
        <CardContent className="p-6">
          <div className="animate-pulse">
            <div className="h-6 bg-accent rounded w-1/3 mb-4"></div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-24 bg-accent rounded"></div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (templates.length === 0) {
    return (
      <Card className="shadow-sm mb-6">
        <CardContent className="p-6">
          <div className="text-center py-6">
            <p className="text-muted-foreground mb-3">No templates available.</p>
            <Button asChild>
              <Link
                href="/templates/new"
                target="_blank"
              >
                Create Your First Template
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  const uniqueVariables = getUniqueVariables()
  const hasVariables = uniqueVariables.length > 0 && selectedIds.size > 0

  return (
    <Card className="shadow-sm mb-6">
      <CardContent className="p-6">
        {/* Header */}
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold text-foreground">
            Select Templates to Generate
          </h2>
          <div className="flex items-center gap-3">
            {mode === "multi" && (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={selectAll}
                  className="text-primary hover:bg-primary/10"
                >
                  Select All
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={deselectAll}
                  className="text-muted-foreground hover:bg-accent"
                >
                  Deselect All
                </Button>
              </>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => loadTemplates(true)}
              disabled={refreshing}
              className="text-muted-foreground hover:text-muted-foreground"
            >
              {refreshing ? "..." : "Refresh"}
            </Button>
            <Link
              href="/templates"
              target="_blank"
              className="text-sm text-primary hover:text-primary hover:underline font-medium"
            >
              Manage Templates
            </Link>
          </div>
        </div>

        {/* Template Card Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
          {templates.map((template) => {
            const isSelected = selectedIds.has(template.id)
            return (
              <div
                key={template.id}
                onClick={() => toggleTemplate(template.id)}
                className={`border-2 rounded-lg p-4 cursor-pointer transition ${
                  isSelected
                    ? "border-primary bg-primary/10"
                    : "border-border hover:border-input"
                }`}
              >
                <div className="flex items-start justify-between mb-2">
                  <h3 className="font-semibold text-foreground">{template.name}</h3>
                  <input
                    type={mode === "multi" ? "checkbox" : "radio"}
                    checked={isSelected}
                    onChange={() => {}}
                    name="template-selector"
                    className="mt-1 flex-shrink-0"
                  />
                </div>
                {template.description && (
                  <p className="text-sm text-muted-foreground line-clamp-2 mb-2">{template.description}</p>
                )}
                <div className="flex items-center gap-2">
                  {template.variables.length > 0 && (
                    <span className="text-xs text-muted-foreground">
                      {template.variables.length} variable{template.variables.length !== 1 ? "s" : ""}
                    </span>
                  )}
                  <Badge variant={
                    template.category === "image"
                      ? "default"
                      : template.category === "video"
                      ? "secondary"
                      : "outline"
                  } className={`text-xs ${
                    template.category === "image"
                      ? "bg-primary/20 text-primary"
                      : template.category === "video"
                      ? "bg-violet-500/20 text-violet-400"
                      : "bg-success/20 text-success"
                  }`}>
                    {template.category}
                  </Badge>
                </div>
              </div>
            )
          })}
        </div>

        {/* Variable Inputs — shown when templates are selected and have non-AUTO variables */}
        {hasVariables && uniqueVariables.some(v => v.type !== "AUTO") && (
          <div className="border-t border-border pt-4 mt-2">
            <h3 className="text-sm font-medium text-muted-foreground mb-3">
              Fill in Variables
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              {uniqueVariables.map((variable) => (
                <div key={variable.name}>
                  <Label className="block text-sm text-muted-foreground mb-1">
                    {variable.displayName}
                    {variable.isRequired && <span className="text-destructive ml-1">*</span>}
                    {variable.type === "AUTO" && (
                      <span className="text-cyan-400 ml-1 text-xs">(auto-filled)</span>
                    )}
                  </Label>

                  {variable.type === "DROPDOWN" && variable.options.length > 0 ? (
                    <select
                      value={variableValues[variable.name] || ""}
                      onChange={(e) => setVariableValues(prev => ({
                        ...prev,
                        [variable.name]: e.target.value
                      }))}
                      className="w-full bg-background border border-input rounded px-3 py-2 text-sm text-foreground focus:ring-2 focus:ring-ring focus:border-ring"
                    >
                      <option value="">Select {variable.displayName.toLowerCase()}...</option>
                      {variable.options.map((opt) => (
                        <option key={opt} value={opt}>{opt}</option>
                      ))}
                    </select>
                  ) : (
                    <Input
                      type="text"
                      value={variableValues[variable.name] || ""}
                      onChange={(e) => setVariableValues(prev => ({
                        ...prev,
                        [variable.name]: e.target.value
                      }))}
                      placeholder={variable.defaultValue || `Enter ${variable.displayName.toLowerCase()}`}
                      disabled={variable.type === "AUTO"}
                      className={variable.type === "AUTO" ? "bg-card text-muted-foreground" : "text-foreground"}
                    />
                  )}
                </div>
              ))}
            </div>

            {/* Missing Required Warning */}
            {getMissingRequired().length > 0 && (
              <div className="bg-warning/10 border border-warning/30 rounded px-3 py-2 mb-4">
                <p className="text-sm text-warning">
                  Missing required: {getMissingRequired().join(", ")}
                </p>
              </div>
            )}

            {/* Prompt Preview */}
            <details className="bg-background rounded-lg p-4">
              <summary className="text-xs text-muted-foreground cursor-pointer select-none">
                Prompt Preview ({selectedIds.size} template{selectedIds.size !== 1 ? "s" : ""})
              </summary>
              <div className="mt-3 space-y-3">
                {templates
                  .filter(t => selectedIds.has(t.id))
                  .map(tmpl => {
                    let prompt = tmpl.promptText
                    for (const variable of tmpl.variables) {
                      const value = variableValues[variable.name] || ""
                      prompt = prompt.replace(new RegExp(`\\{\\{${variable.name}\\}\\}`, "g"), value)
                    }
                    return (
                      <div key={tmpl.id}>
                        <p className="text-xs font-medium text-muted-foreground mb-1">{tmpl.name}:</p>
                        <p className="text-sm text-foreground whitespace-pre-wrap bg-secondary/30 rounded p-2 border border-border">
                          {prompt || <span className="text-muted-foreground italic">Fill in variables to see preview</span>}
                        </p>
                      </div>
                    )
                  })}
              </div>
            </details>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
