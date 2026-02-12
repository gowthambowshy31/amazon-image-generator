"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"

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
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-4">
              <Link href="/templates" className="text-gray-600 hover:text-gray-900">
                &larr; Back
              </Link>
              <h1 className="text-2xl font-bold text-gray-900">Create New Template</h1>
            </div>
            <button
              onClick={handleSave}
              disabled={saving}
              className={`px-6 py-2 rounded-lg font-semibold text-white ${
                saving ? "bg-gray-400" : "bg-blue-600 hover:bg-blue-700"
              }`}
            >
              {saving ? "Saving..." : "Save Template"}
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Form */}
          <div className="lg:col-span-2 space-y-6">
            {/* Basic Info */}
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Template Info</h2>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Template Name *
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g., Product Lifestyle Shot"
                    className="w-full border border-gray-300 rounded-lg px-4 py-2 text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Description
                  </label>
                  <input
                    type="text"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Brief description of what this template creates"
                    className="w-full border border-gray-300 rounded-lg px-4 py-2 text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Category
                  </label>
                  <div className="flex gap-4">
                    {(["image", "video", "both"] as const).map((cat) => (
                      <label key={cat} className="flex items-center gap-2">
                        <input
                          type="radio"
                          name="category"
                          checked={category === cat}
                          onChange={() => setCategory(cat)}
                          className="text-blue-600"
                        />
                        <span className="text-sm capitalize">{cat === "both" ? "Image & Video" : cat}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Display Order
                  </label>
                  <input
                    type="number"
                    value={order}
                    onChange={(e) => setOrder(parseInt(e.target.value) || 0)}
                    min={0}
                    className="w-32 border border-gray-300 rounded-lg px-4 py-2 text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                  <p className="text-xs text-gray-500 mt-1">Lower numbers appear first on the generate page</p>
                </div>
              </div>
            </div>

            {/* Prompt Editor */}
            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-semibold text-gray-900">Prompt Text</h2>
                <button
                  type="button"
                  onClick={syncVariables}
                  className="px-3 py-1 text-sm bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
                >
                  Detect Variables
                </button>
              </div>

              <p className="text-sm text-gray-600 mb-3">
                Use {"{{variable_name}}"} syntax for dynamic placeholders
              </p>

              <textarea
                value={promptText}
                onChange={(e) => setPromptText(e.target.value)}
                placeholder="A professional {{style}} photo of {{product_title}} with {{lighting}} lighting on a {{background}} background"
                className="w-full border border-gray-300 rounded-lg px-4 py-3 min-h-[150px] font-mono text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />

              <div className="mt-3 flex flex-wrap gap-2">
                <span className="text-xs text-gray-500">Quick insert:</span>
                {["product_title", "style", "background", "lighting", "setting"].map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => insertVariable(v)}
                    className="px-2 py-1 text-xs bg-gray-100 text-gray-600 rounded hover:bg-gray-200"
                  >
                    {`{{${v}}}`}
                  </button>
                ))}
              </div>
            </div>

            {/* Variables Configuration */}
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">
                Variables ({variables.length})
              </h2>

              {variables.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <p>No variables detected yet.</p>
                  <p className="text-sm">Add {"{{variable}}"} placeholders to your prompt and click "Detect Variables"</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {variables.map((variable) => (
                    <div key={variable.id} className="border border-gray-200 rounded-lg p-4">
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <code className="text-sm bg-gray-100 px-2 py-1 rounded">
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
                          <label className="block text-xs text-gray-500 mb-1">Display Name</label>
                          <input
                            type="text"
                            value={variable.displayName}
                            onChange={(e) => updateVariable(variable.id, { displayName: e.target.value })}
                            className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm text-gray-900"
                          />
                        </div>

                        <div>
                          <label className="block text-xs text-gray-500 mb-1">Type</label>
                          <select
                            value={variable.type}
                            onChange={(e) => updateVariable(variable.id, {
                              type: e.target.value as Variable["type"],
                              options: e.target.value === "DROPDOWN" ? variable.options : [],
                              autoFillSource: e.target.value === "AUTO" ? variable.autoFillSource : ""
                            })}
                            className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm text-gray-900"
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
                          <label className="block text-xs text-gray-500 mb-1">Default Value</label>
                          <input
                            type="text"
                            value={variable.defaultValue}
                            onChange={(e) => updateVariable(variable.id, { defaultValue: e.target.value })}
                            placeholder="Optional default value"
                            className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm text-gray-900"
                          />
                        </div>
                      )}

                      {variable.type === "DROPDOWN" && (
                        <div className="mt-3">
                          <label className="block text-xs text-gray-500 mb-1">Options</label>
                          <div className="space-y-2">
                            {variable.options.map((option, index) => (
                              <div key={index} className="flex gap-2">
                                <input
                                  type="text"
                                  value={option}
                                  onChange={(e) => updateOption(variable.id, index, e.target.value)}
                                  placeholder={`Option ${index + 1}`}
                                  className="flex-1 border border-gray-300 rounded px-3 py-1.5 text-sm text-gray-900"
                                />
                                <button
                                  type="button"
                                  onClick={() => removeOption(variable.id, index)}
                                  className="px-2 text-red-500 hover:text-red-700"
                                >
                                  &times;
                                </button>
                              </div>
                            ))}
                            <button
                              type="button"
                              onClick={() => addOption(variable.id)}
                              className="text-sm text-blue-600 hover:text-blue-700"
                            >
                              + Add Option
                            </button>
                          </div>
                        </div>
                      )}

                      {variable.type === "AUTO" && (
                        <div className="mt-3">
                          <label className="block text-xs text-gray-500 mb-1">Auto-fill Source</label>
                          <select
                            value={variable.autoFillSource}
                            onChange={(e) => updateVariable(variable.id, { autoFillSource: e.target.value })}
                            className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm text-gray-900"
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
            </div>
          </div>

          {/* Preview Panel */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-lg shadow p-6 sticky top-8">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Preview</h2>

              {variables.length > 0 ? (
                <>
                  <div className="space-y-3 mb-4">
                    {variables.filter(v => v.type !== "AUTO").map((variable) => (
                      <div key={variable.id}>
                        <label className="block text-xs text-gray-500 mb-1">{variable.displayName}</label>
                        {variable.type === "DROPDOWN" && variable.options.length > 0 ? (
                          <select
                            value={previewValues[variable.name] || ""}
                            onChange={(e) => setPreviewValues(prev => ({ ...prev, [variable.name]: e.target.value }))}
                            className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm text-gray-900"
                          >
                            <option value="">Select...</option>
                            {variable.options.filter(o => o.trim()).map((opt) => (
                              <option key={opt} value={opt}>{opt}</option>
                            ))}
                          </select>
                        ) : (
                          <input
                            type="text"
                            value={previewValues[variable.name] || ""}
                            onChange={(e) => setPreviewValues(prev => ({ ...prev, [variable.name]: e.target.value }))}
                            placeholder={variable.defaultValue || `Enter ${variable.displayName.toLowerCase()}`}
                            className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm text-gray-900"
                          />
                        )}
                      </div>
                    ))}
                    {variables.filter(v => v.type === "AUTO").map((variable) => (
                      <div key={variable.id}>
                        <label className="block text-xs text-gray-500 mb-1">
                          {variable.displayName}
                          <span className="text-cyan-600 ml-1">(auto)</span>
                        </label>
                        <input
                          type="text"
                          value={AUTO_FILL_OPTIONS.find(o => o.value === variable.autoFillSource)?.label || "Not set"}
                          disabled
                          className="w-full border border-gray-200 rounded px-3 py-1.5 text-sm bg-gray-50 text-gray-500"
                        />
                      </div>
                    ))}
                  </div>

                  <button
                    type="button"
                    onClick={generatePreview}
                    className="w-full px-4 py-2 bg-gray-100 text-gray-700 rounded hover:bg-gray-200 text-sm mb-4"
                  >
                    Generate Preview
                  </button>

                  {previewResult && (
                    <div className="bg-gray-50 rounded p-3">
                      <p className="text-xs text-gray-500 mb-2">Result:</p>
                      <p className="text-sm text-gray-800">{previewResult}</p>
                    </div>
                  )}
                </>
              ) : (
                <p className="text-sm text-gray-500">
                  Add variables to your prompt to see the preview panel
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
