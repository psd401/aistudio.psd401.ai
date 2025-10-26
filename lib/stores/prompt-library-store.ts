import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type ViewMode = 'grid' | 'list'
export type SortBy = 'created' | 'usage' | 'views'
export type VisibilityFilter = 'all' | 'private' | 'public'

interface FilterState {
  searchQuery: string
  selectedTags: string[]
  visibilityFilter: VisibilityFilter
  sortBy: SortBy
}

interface PromptLibraryState {
  // View State
  viewMode: ViewMode
  selectedPrompts: Set<string>
  expandedCollections: Set<string>

  // Filter State
  searchQuery: string
  selectedTags: string[]
  visibilityFilter: VisibilityFilter
  sortBy: SortBy

  // Actions - View
  setViewMode: (mode: ViewMode) => void
  toggleSelection: (id: string) => void
  selectAll: (promptIds: string[]) => void
  clearSelection: () => void
  toggleCollection: (id: string) => void

  // Actions - Filters
  setSearchQuery: (query: string) => void
  setSelectedTags: (tags: string[]) => void
  addTag: (tag: string) => void
  removeTag: (tag: string) => void
  setVisibilityFilter: (filter: VisibilityFilter) => void
  setSortBy: (sort: SortBy) => void
  clearFilters: () => void
  updateFilters: (filters: Partial<FilterState>) => void
}

export const usePromptLibraryStore = create<PromptLibraryState>()(
  persist(
    (set) => ({
      // Initial State
      viewMode: 'grid',
      selectedPrompts: new Set(),
      expandedCollections: new Set(),
      searchQuery: '',
      selectedTags: [],
      visibilityFilter: 'all',
      sortBy: 'created',

      // View Actions
      setViewMode: (mode) => set({ viewMode: mode }),

      toggleSelection: (id) =>
        set((state) => {
          const newSelected = new Set(state.selectedPrompts)
          if (newSelected.has(id)) {
            newSelected.delete(id)
          } else {
            newSelected.add(id)
          }
          return { selectedPrompts: newSelected }
        }),

      selectAll: (promptIds) =>
        set({ selectedPrompts: new Set(promptIds) }),

      clearSelection: () =>
        set({ selectedPrompts: new Set() }),

      toggleCollection: (id) =>
        set((state) => {
          const newExpanded = new Set(state.expandedCollections)
          if (newExpanded.has(id)) {
            newExpanded.delete(id)
          } else {
            newExpanded.add(id)
          }
          return { expandedCollections: newExpanded }
        }),

      // Filter Actions
      setSearchQuery: (query) => set({ searchQuery: query }),

      setSelectedTags: (tags) => set({ selectedTags: tags }),

      addTag: (tag) =>
        set((state) => ({
          selectedTags: [...state.selectedTags, tag]
        })),

      removeTag: (tag) =>
        set((state) => ({
          selectedTags: state.selectedTags.filter((t) => t !== tag)
        })),

      setVisibilityFilter: (filter) => set({ visibilityFilter: filter }),

      setSortBy: (sort) => set({ sortBy: sort }),

      clearFilters: () =>
        set({
          searchQuery: '',
          selectedTags: [],
          visibilityFilter: 'all',
          sortBy: 'created'
        }),

      updateFilters: (filters) => set(filters)
    }),
    {
      name: 'prompt-library-preferences',
      partialize: (state) => ({
        viewMode: state.viewMode,
        sortBy: state.sortBy
      }),
      // Custom serializer for Sets
      storage: {
        getItem: (name) => {
          const str = localStorage.getItem(name)
          if (!str) return null
          return JSON.parse(str)
        },
        setItem: (name, value) => {
          localStorage.setItem(name, JSON.stringify(value))
        },
        removeItem: (name) => localStorage.removeItem(name)
      }
    }
  )
)
