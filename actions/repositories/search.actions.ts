"use server"

import { getServerSession } from "@/lib/auth/server-session"
import { type ActionState } from "@/types/actions-types"
import { handleError } from "@/lib/error-utils"
import { vectorSearch, keywordSearch, hybridSearch, SearchResult } from "@/lib/repositories/search-service"

export interface SearchRepositoryParams {
  query: string
  repositoryId: number
  searchType?: 'vector' | 'keyword' | 'hybrid'
  limit?: number
  vectorWeight?: number
}

export async function searchRepository(
  params: SearchRepositoryParams
): Promise<ActionState<SearchResult[]>> {
  try {
    const session = await getServerSession()
    if (!session) {
      return {
        isSuccess: false,
        message: "You must be logged in to search repositories",
      }
    }

    const { query, repositoryId, searchType = 'hybrid', limit = 10, vectorWeight = 0.7 } = params

    if (!query || query.trim().length === 0) {
      return {
        isSuccess: false,
        message: "Please enter a search query",
      }
    }

    let results: SearchResult[]

    switch (searchType) {
      case 'vector':
        results = await vectorSearch(query, { repositoryId, limit })
        break
      case 'keyword':
        results = await keywordSearch(query, { repositoryId, limit })
        break
      case 'hybrid':
      default:
        results = await hybridSearch(query, { repositoryId, limit, vectorWeight })
        break
    }

    return {
      isSuccess: true,
      message: `Found ${results.length} results`,
      data: results,
    }
  } catch (error) {
    return handleError(error, "Failed to search repository")
  }
}