"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import DashboardLayout from "@/app/components/DashboardLayout"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

interface Variable {
  id: string
  name: string
  displayName: string
  type: "TEXT" | "DROPDOWN" | "AUTO"
  isRequired: boolean
  defaultValue: string
  options: string[]
  autoFillSource: string
  order: number
}

const AUTO_FILL_OPTIONS = [
  { value: "product.title", label: "Product Title" },
  { value: "product.category", label: "Product Category" },
  { value: "product.asin", label: "Product ASIN" },
  { value: "metadata.brand", label: "Brand" },
  { value: "metadata.manufacturer", label: "Manufacturer" },
  { value: "metadata.attributes.color", label: "Color" },
  { value: "metadata.attributes.material", label: "Material" },
  { value: "metadata.attributes.item_weight", label: "Weight" },
  { value: "metadata.attributes.metal_type", label: "Metal Type" },
  { value: "metadata.attributes.gem_type", label: "Gem Type" },
  { value: "metadata.attributes.clarity", label: "Clarity" },
  { value: "metadata.attributes.carat_weight", label: "Carat Weight" },
  { value: "metadata.attributes.total_diamond_weight", label: "Total Diamond Weight" },
  { value: "metadata.attributes.item_shape", label: "Shape" },
  { value: "metadata.attributes.style", label: "Style" },
  { value: "metadata.attributes.finish_type", label: "Finish Type" },
  { value: "metadata.attributes.setting_type", label: "Setting Type" },
  { value: "metadata.attributes.stone_shape", label: "Stone Shape" },
  { value: "metadata.attributes.number_of_stones", label: "Number of Stones" },
  { value: "metadata.attributes.size", label: "Size" },
  { value: "metadata.attributes.pattern", label: "Pattern" },
  { value: "metadata.attributes.item_dimensions", label: "Dimensions" },
  { value: "metadata.attributes.chain_type", label: "Chain Type" },
  { value: "metadata.attributes.closure_type", label: "Closure Type" },
  { value: "metadata.attributes.department", label: "Department" }
]

export default function NewTemplatePage() {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  // Form state
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [promptText, setPromptText] = useState("")
  const [category, setCategory] = useState<"image" | "video" | "both">("both")
  const [order, setOrder] = useState(0)
  const [variables, setVariables] = useState<Variable[]>([])

  // Preview state
  const [previewValues, setPreviewValues] = useState<Record<string, string>>({})
  const [previewResult, setPreviewResult] = useState("")

  // Extract variables from prompt text
  const extractVariables = (text: string): string[] => {
    const matches = text.matchAll(/\{\{(\w+)\}\}/g)
    const vars = new Set<string>()
    for (const match of matches) {
      vars.add(match[1])
    }
    return Array.from(vars)
  }

  // Sync variables with prompt text
  const syncVariables = () => {
    const detectedVars = extractVariables(promptText)
    const existingVarMap = new Map(variables.map(v => [v.name, v]))

    const newVariables: Variable[] = detectedVars.map((varName, index) => {
      if (existingVarMap.has(varName)) {
        return existingVarMap.get(varName)!
      }
      // Check if it's likely an auto-fill variable
      const isAuto = ["product_title", "product_category", "product_asin", "item_name", "category", "asin"].includes(varName)
      const autoSource = varName === "product_title" || varName === "item_name" ? "product.title" :
                         varName === "product_category" || varName === "category" ? "product.category" :
                         varName === "product_asin" || varName === "asin" ? "product.asin" : ""

      return {
        id: `new-${Date.now()}-${index}`,
        name: varName,
        displayName: varName.split("_").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" "),
        type: (isAuto ? "AUTO" : "TEXT") as "TEXT" | "DROPDOWN" | "AUTO",
        isRequired: true,
        defaultValue: "",
        options: [] as string[],
        autoFillSource: autoSource,
        order: index
      }
    })

    setVariables(newVariables)
  }

  // Update a single variable
  const updateVariable = (id: string, updates: Partial<Variable>) => {
    setVariables(prev => prev.map(v => v.id === id ? { ...v, ...updates } : v))
  }

  // Add option to dropdown variable
  const addOption = (varId: string) => {
    setVariables(prev => prev.map(v => {
      if (v.id === varId) {
        return { ...v, options: [...v.options, ""] }
      }
      return v
    }))
  }

  // Update option value
  const updateOption = (varId: string, optionIndex: number, value: string) => {
    setVariables(prev => prev.map(v => {
      if (v.id === varId) {
        const newOptions = [...v.options]
        newOptions[optionIndex] = value
        return { ...v, options: newOptions }
      }
      return v
    }))
  }

  // Remove option
  const removeOption = (varId: string, optionIndex: number) => {
    setVariables(prev => prev.map(v => {
      if (v.id === varId) {
        return { ...v, options: v.options.filter((_, i) => i !== optionIndex) }
      }
      return v
    }))
  }

  // Insert variable at cursor
  const insertVariable = (varName: string) => {
    setPromptText(prev => prev + `{{${varName}}}`)
  }

  // Generate preview
  const generatePreview = () => {
    let result = promptText
    for (const variable of variables) {
      const value = previewValues[variable.name] || variable.defaultValue || `[${variable.displayName}]`
      result = result.replace(new RegExp(`\\{\\{${variable.name}\\}\\}`, "g"), value)
    }
    setPreviewResult(result)
  }

  // Save template
  const handleSave = async () => {
    if (!name.trim()) {
      setError("Template name is required")
      return
    }
    if (!promptText.trim()) {
      setError("Prompt text is required")
      return
    }

    setSaving(true)
    setError("")

    try {
      const response = await fetch("/api/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || null,
          promptText: promptText.trim(),
          category,
          order,
          variables: variables.map(v => ({
            name: v.name,
            displayName: v.displayName,
            type: v.type,
            isRequired: v.isRequired,
            defaultValue: v.defaultValue || null,
            options: v.options.filter(o => o.trim()),
            autoFillSource: v.type === "AUTO" ? v.autoFillSource : null,
            order: v.order
          }))
        })
      })

      if (response.ok) {
        router.push("/templates")
      } else {
        const data = await response.json()
        setError(data.error || "Failed to create template")
      }
    } catch (err) {
      setError("Failed to create template")
    } finally {
      setSaving(false)
    }
  }

  return (
    <DashboardLayout>
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 pb-2">
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-bold text-foreground">New Template</h1>
          <Button
            onClick={handleSave}
            disabled={saving}
            variant={saving ? "outline" : "default"}
          >
            {saving ? "Saving..." : "Save Template"}
          </Button>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {error && (
          <div className="bg-destructive/10 border border-destructive/30 text-destructive px-4 py-3 rounded-lg mb-6">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Form */}
          <div className="lg:col-span-2 space-y-6">
            {/* Basic Info */}
            <Card>
              <CardHeader>
                <CardTitle>Template Info</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div>
                    <Label className="mb-1">
                      Template Name *
                    </Label>
                    <Input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="e.g., Product Lifestyle Shot"
                    />
                  </div>

                  <div>
                    <Label className="mb-1">
                      Description
                    </Label>
                    <Input
                      type="text"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="Brief description of what this template creates"
                    />
                  </div>

                  <div>
                    <Label className="mb-1">
                      Category
                    </Label>
                    <div className="flex gap-4">
                      {(["image", "video", "both"] as const).map((cat) => (
                        <label key={cat} className="flex items-center gap-2">
                          <input
                            type="radio"
                            name="category"
                            checked={category === cat}
                            onChange={() => setCategory(cat)}
                            className="text-primary"
                          />
                          <span className="text-sm capitalize">{cat === "both" ? "Image & Video" : cat}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  <div>
                    <Label className="mb-1">
                      Display Order
                    </Label>
                    <Input
                      type="number"
                      value={order}
                      onChange={(e) => setOrder(parseInt(e.target.value) || 0)}
                      min={0}
                      className="w-32"
                    />
                    <p className="text-xs text-muted-foreground mt-1">Lower numbers appear first on the generate page</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Prompt Editor */}
            <Card>
              <CardHeader>
                <div className="flex justify-between items-center">
                  <CardTitle>Prompt Text</CardTitle>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={syncVariables}
                    className="bg-primary/20 text-primary hover:bg-primary/30"
                  >
                    Detect Variables
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground mb-3">
                  Use {"{{variable_name}}"} syntax for dynamic placeholders
                </p>

                <Textarea
                  value={promptText}
                  onChange={(e) => setPromptText(e.target.value)}
                  placeholder="A professional {{style}} photo of {{product_title}} with {{lighting}} lighting on a {{background}} background"
                  className="min-h-[150px] font-mono text-sm"
                />

                <div className="mt-3 flex flex-wrap gap-2">
                  <span className="text-xs text-muted-foreground">Quick insert:</span>
                  {["product_title", "style", "background", "lighting", "setting"].map((v) => (
                    <Button
                      key={v}
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => insertVariable(v)}
                      className="px-2 py-1 text-xs text-muted-foreground hover:bg-accent"
                    >
                      {`{{${v}}}`}
                    </Button>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Variables Configuration */}
            <Card>
              <CardHeader>
                <CardTitle>
                  Variables ({variables.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                {variables.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <p>No variables detected yet.</p>
                    <p className="text-sm">Add {"{{variable}}"} placeholders to your prompt and click &quot;Detect Variables&quot;</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {variables.map((variable) => (
                      <div key={variable.id} className="border border-border rounded-lg p-4 bg-card">
                        <div className="flex items-start justify-between mb-3">
                          <div>
                            <code className="text-sm bg-accent px-2 py-1 rounded text-primary">
                              {`{{${variable.name}}}`}
                            </code>
                          </div>
                          <label className="flex items-center gap-2 text-sm">
                            <input
                              type="checkbox"
                              checked={variable.isRequired}
                              onChange={(e) => updateVariable(variable.id, { isRequired: e.target.checked })}
                            />
                            Required
                          </label>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <Label className="text-xs mb-1">Display Name</Label>
                            <Input
                              type="text"
                              value={variable.displayName}
                              onChange={(e) => updateVariable(variable.id, { displayName: e.target.value })}
                              className="text-sm"
                            />
                          </div>

                          <div>
                            <Label className="text-xs mb-1">Type</Label>
                            <select
                              value={variable.type}
                              onChange={(e) => updateVariable(variable.id, {
                                type: e.target.value as Variable["type"],
                                options: e.target.value === "DROPDOWN" ? variable.options : [],
                                autoFillSource: e.target.value === "AUTO" ? variable.autoFillSource : ""
                              })}
                              className="w-full bg-background border border-input rounded px-3 py-1.5 text-sm text-foreground focus-visible:ring-1 focus-visible:ring-ring"
                            >
                              <option value="TEXT">Text Input</option>
                              <option value="DROPDOWN">Dropdown</option>
                              <option value="AUTO">Auto-fill</option>
                            </select>
                          </div>
                        </div>

                        {/* Type-specific options */}
                        {variable.type === "TEXT" && (
                          <div className="mt-3">
                            <Label className="text-xs mb-1">Default Value</Label>
                            <Input
                              type="text"
                              value={variable.defaultValue}
                              onChange={(e) => updateVariable(variable.id, { defaultValue: e.target.value })}
                              placeholder="Optional default value"
                              className="text-sm"
                            />
                          </div>
                        )}

                        {variable.type === "DROPDOWN" && (
                          <div className="mt-3">
                            <Label className="text-xs mb-1">Options</Label>
                            <div className="space-y-2">
                              {variable.options.map((option, index) => (
                                <div key={index} className="flex gap-2">
                                  <Input
                                    type="text"
                                    value={option}
                                    onChange={(e) => updateOption(variable.id, index, e.target.value)}
                                    placeholder={`Option ${index + 1}`}
                                    className="flex-1 text-sm"
                                  />
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    onClick={() => removeOption(variable.id, index)}
                                    className="px-2 text-destructive hover:text-destructive"
                                  >
                                    &times;
                                  </Button>
                                </div>
                              ))}
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => addOption(variable.id)}
                                className="text-sm text-primary hover:text-primary"
                              >
                                + Add Option
                              </Button>
                            </div>
                          </div>
                        )}

                        {variable.type === "AUTO" && (
                          <div className="mt-3">
                            <Label className="text-xs mb-1">Auto-fill Source</Label>
                            <select
                              value={variable.autoFillSource}
                              onChange={(e) => updateVariable(variable.id, { autoFillSource: e.target.value })}
                              className="w-full bg-background border border-input rounded px-3 py-1.5 text-sm text-foreground focus-visible:ring-1 focus-visible:ring-ring"
                            >
                              <option value="">Select source...</option>
                              {AUTO_FILL_OPTIONS.map((opt) => (
                                <option key={opt.value} value={opt.value}>{opt.label}</option>
                              ))}
                            </select>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Preview Panel */}
          <div className="lg:col-span-1">
            <Card className="sticky top-8">
              <CardHeader>
                <CardTitle>Preview</CardTitle>
              </CardHeader>
              <CardContent>
                {variables.length > 0 ? (
                  <>
                    <div className="space-y-3 mb-4">
                      {variables.filter(v => v.type !== "AUTO").map((variable) => (
                        <div key={variable.id}>
                          <Label className="text-xs mb-1">{variable.displayName}</Label>
                          {variable.type === "DROPDOWN" && variable.options.length > 0 ? (
                            <select
                              value={previewValues[variable.name] || ""}
                              onChange={(e) => setPreviewValues(prev => ({ ...prev, [variable.name]: e.target.value }))}
                              className="w-full bg-background border border-input rounded px-3 py-1.5 text-sm text-foreground focus-visible:ring-1 focus-visible:ring-ring"
                            >
                              <option value="">Select...</option>
                              {variable.options.filter(o => o.trim()).map((opt) => (
                                <option key={opt} value={opt}>{opt}</option>
                              ))}
                            </select>
                          ) : (
                            <Input
                              type="text"
                              value={previewValues[variable.name] || ""}
                              onChange={(e) => setPreviewValues(prev => ({ ...prev, [variable.name]: e.target.value }))}
                              placeholder={variable.defaultValue || `Enter ${variable.displayName.toLowerCase()}`}
                              className="text-sm"
                            />
                          )}
                        </div>
                      ))}
                      {variables.filter(v => v.type === "AUTO").map((variable) => (
                        <div key={variable.id}>
                          <Label className="text-xs mb-1">
                            {variable.displayName}
                            <span className="text-cyan-400 ml-1">(auto)</span>
                          </Label>
                          <Input
                            type="text"
                            value={AUTO_FILL_OPTIONS.find(o => o.value === variable.autoFillSource)?.label || "Not set"}
                            disabled
                            className="text-sm bg-card text-muted-foreground"
                          />
                        </div>
                      ))}
                    </div>

                    <Button
                      type="button"
                      variant="outline"
                      onClick={generatePreview}
                      className="w-full text-sm mb-4"
                    >
                      Generate Preview
                    </Button>

                    {previewResult && (
                      <div className="bg-background rounded p-3">
                        <p className="text-xs text-muted-foreground mb-2">Result:</p>
                        <p className="text-sm text-foreground">{previewResult}</p>
                      </div>
                    )}
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Add variables to your prompt to see the preview panel
                  </p>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </DashboardLayout>
  )
}
