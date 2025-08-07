"use client"

import { useMemo } from "react"
import type { 
  UseFilteredModelsOptions, 
  UseFilteredModelsResult, 
  FilteredModel 
} from "./model-selector-types"

export function useFilteredModels({
  models,
  requiredCapabilities = [],
  allowedRoles = [],
  userRoles = [],
  searchQuery = "",
  hideRoleRestricted = false,
  hideCapabilityMissing = false
}: UseFilteredModelsOptions): UseFilteredModelsResult {
  
  const result = useMemo(() => {
    let filteredModels: FilteredModel[] = models.map(model => {
      // Parse capabilities if it's a string
      let modelCapabilities: string[] = []
      if (model.capabilities) {
        try {
          if (typeof model.capabilities === 'string') {
            modelCapabilities = JSON.parse(model.capabilities)
          } else if (Array.isArray(model.capabilities)) {
            modelCapabilities = model.capabilities
          }
        } catch {
          // If parsing fails, treat as comma-separated string
          modelCapabilities = model.capabilities.split(',').map(c => c.trim())
        }
      }

      // Check capability requirements
      const missingCapabilities = requiredCapabilities.filter(
        cap => !modelCapabilities.includes(cap)
      )
      const matchesCapabilities = missingCapabilities.length === 0

      // Parse allowed roles for the model
      let modelAllowedRoles: string[] = []
      if (model.allowedRoles) {
        try {
          if (typeof model.allowedRoles === 'string') {
            modelAllowedRoles = JSON.parse(model.allowedRoles)
          } else if (Array.isArray(model.allowedRoles)) {
            modelAllowedRoles = model.allowedRoles
          }
        } catch {
          modelAllowedRoles = []
        }
      }

      // Check role-based access
      // If modelAllowedRoles is empty or null, model is accessible to all
      const hasRoleAccess = modelAllowedRoles.length === 0 || 
        modelAllowedRoles.some(role => userRoles.includes(role))
      
      // Check if user's allowed roles match (for component-level filtering)
      const meetsAllowedRoles = allowedRoles.length === 0 ||
        allowedRoles.some(role => userRoles.includes(role))

      const isAccessible = matchesCapabilities && hasRoleAccess && meetsAllowedRoles

      let accessDeniedReason: string | undefined
      if (!matchesCapabilities) {
        accessDeniedReason = `Missing capabilities: ${missingCapabilities.join(', ')}`
      } else if (!hasRoleAccess) {
        accessDeniedReason = `Requires role: ${modelAllowedRoles.join(' or ')}`
      } else if (!meetsAllowedRoles) {
        accessDeniedReason = `Your role doesn't have access to this feature`
      }

      return {
        ...model,
        isAccessible,
        accessDeniedReason,
        matchesCapabilities,
        hasRoleAccess,
        missingCapabilities: missingCapabilities.length > 0 ? missingCapabilities : undefined
      } as FilteredModel
    })

    // Filter out role-restricted models if hideRoleRestricted is true
    if (hideRoleRestricted) {
      filteredModels = filteredModels.filter(model => model.hasRoleAccess)
    }
    
    // Filter out models missing capabilities if hideCapabilityMissing is true
    if (hideCapabilityMissing) {
      filteredModels = filteredModels.filter(model => model.matchesCapabilities)
    }

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      filteredModels = filteredModels.filter(model => 
        model.name.toLowerCase().includes(query) ||
        model.modelId.toLowerCase().includes(query) ||
        (model.provider && model.provider.toLowerCase().includes(query)) ||
        (model.description && model.description.toLowerCase().includes(query))
      )
    }

    // Group models by provider
    const groupedModels: Record<string, FilteredModel[]> = {}
    filteredModels.forEach(model => {
      const provider = model.provider || 'Other'
      if (!groupedModels[provider]) {
        groupedModels[provider] = []
      }
      groupedModels[provider].push(model)
    })

    // Sort models within each group
    Object.keys(groupedModels).forEach(provider => {
      groupedModels[provider].sort((a, b) => {
        // Accessible models first
        if (a.isAccessible !== b.isAccessible) {
          return a.isAccessible ? -1 : 1
        }
        // Then by name
        return a.name.localeCompare(b.name)
      })
    })

    const totalCount = filteredModels.length
    const accessibleCount = filteredModels.filter(m => m.isAccessible).length

    return {
      filteredModels,
      groupedModels,
      totalCount,
      accessibleCount
    }
  }, [models, requiredCapabilities, allowedRoles, userRoles, searchQuery, hideRoleRestricted, hideCapabilityMissing])

  return result
}