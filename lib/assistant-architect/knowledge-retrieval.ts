import { vectorSearch, hybridSearch } from "@/lib/repositories/search-service"
import { executeSQL } from "@/lib/db/data-api-adapter"
import logger from "@/lib/logger"

interface KnowledgeChunk {
  chunkId: number
  itemId: number
  itemName: string
  content: string
  similarity: number
  repositoryId: number
  repositoryName: string
}

interface KnowledgeRetrievalOptions {
  maxChunks?: number
  maxTokens?: number
  similarityThreshold?: number
  searchType?: "semantic" | "hybrid"
  vectorWeight?: number
}

const DEFAULT_OPTIONS: KnowledgeRetrievalOptions = {
  maxChunks: 10,
  maxTokens: 4000,
  similarityThreshold: 0.7,
  searchType: "hybrid",
  vectorWeight: 0.8
}

/**
 * Count tokens in a string using approximation
 * Approximation: 1 token ≈ 4 characters
 */
function countTokens(text: string): number {
  if (!text) return 0
  return Math.ceil(text.length / 4)
}

/**
 * Retrieve relevant knowledge chunks from specified repositories
 */
export async function retrieveKnowledgeForPrompt(
  promptContent: string,
  repositoryIds: number[],
  userCognitoSub: string,
  options: KnowledgeRetrievalOptions = {}
): Promise<KnowledgeChunk[]> {
  const opts = { ...DEFAULT_OPTIONS, ...options }
  
  if (!repositoryIds || repositoryIds.length === 0) {
    return []
  }

  try {
    // First, verify user has access to all specified repositories
    // Since RDS Data API doesn't support array parameters directly, we'll use IN clause
    const placeholders = repositoryIds.map((_, index) => `:repoId${index}`).join(', ')
    const accessCheckQuery = `
      SELECT DISTINCT r.id, r.name
      FROM knowledge_repositories r
      WHERE r.id IN (${placeholders})
      AND (
        r.is_public = true
        OR r.owner_id = (SELECT id FROM users WHERE cognito_sub = :cognitoSub)
        OR EXISTS (
          SELECT 1 FROM repository_access ra
          JOIN users u ON u.id = ra.user_id
          WHERE ra.repository_id = r.id AND u.cognito_sub = :cognitoSub
        )
        OR EXISTS (
          SELECT 1 FROM repository_access ra
          JOIN user_roles ur ON ur.role_id = ra.role_id
          JOIN users u ON u.id = ur.user_id
          WHERE ra.repository_id = r.id AND u.cognito_sub = :cognitoSub
        )
      )
    `
    
    const parameters = [
      ...repositoryIds.map((id, index) => ({ 
        name: `repoId${index}`, 
        value: { longValue: id } 
      })),
      { name: 'cognitoSub', value: { stringValue: userCognitoSub } }
    ]
    
    const accessibleRepos = await executeSQL<{ id: number; name: string }>(
      accessCheckQuery,
      parameters
    )

    if (accessibleRepos.length !== repositoryIds.length) {
      const accessibleIds = accessibleRepos.map(r => r.id)
      const inaccessibleIds = repositoryIds.filter(id => !accessibleIds.includes(id))
      logger.warn(`User ${userCognitoSub} attempted to access repositories without permission: ${inaccessibleIds}`)
      // Continue with only accessible repositories
    }

    if (accessibleRepos.length === 0) {
      return []
    }

    // Perform search across all accessible repositories
    const searchPromises = accessibleRepos.map(async (repo) => {
      try {
        let results
        if (opts.searchType === "semantic") {
          results = await vectorSearch(promptContent, {
            repositoryId: repo.id,
            limit: opts.maxChunks,
            threshold: opts.similarityThreshold
          })
        } else {
          results = await hybridSearch(promptContent, {
            repositoryId: repo.id,
            limit: opts.maxChunks,
            threshold: opts.similarityThreshold,
            vectorWeight: opts.vectorWeight
          })
        }
        
        // Add repository info to results
        return results.map(result => ({
          ...result,
          repositoryId: repo.id,
          repositoryName: repo.name
        }))
      } catch (error) {
        logger.error(`Error searching repository ${repo.id}:`, error)
        return []
      }
    })

    const allResults = await Promise.all(searchPromises)
    const flatResults = allResults.flat()

    // Sort by similarity score and take top results
    flatResults.sort((a, b) => b.similarity - a.similarity)
    const topResults = flatResults.slice(0, opts.maxChunks)

    // Apply token limit if specified
    if (opts.maxTokens) {
      const limitedResults: KnowledgeChunk[] = []
      let totalTokens = 0

      for (const chunk of topResults) {
        const chunkTokens = countTokens(chunk.content)
        if (totalTokens + chunkTokens <= opts.maxTokens) {
          limitedResults.push(chunk)
          totalTokens += chunkTokens
        } else {
          // If we can't fit the whole chunk, see if we can fit a truncated version
          const remainingTokens = opts.maxTokens - totalTokens
          if (remainingTokens > 100) { // Only include if we have reasonable space
            const truncatedContent = truncateToTokenLimit(chunk.content, remainingTokens)
            limitedResults.push({
              ...chunk,
              content: truncatedContent + "\n[... truncated for token limit]"
            })
          }
          break
        }
      }

      return limitedResults
    }

    return topResults
  } catch (error) {
    logger.error("Error retrieving knowledge for prompt:", error)
    return []
  }
}

/**
 * Format retrieved knowledge chunks into a context string
 */
export function formatKnowledgeContext(chunks: KnowledgeChunk[]): string {
  if (chunks.length === 0) {
    return ""
  }

  const sections = chunks.map((chunk, index) => {
    return `## Knowledge Source ${index + 1}: ${chunk.itemName} (${chunk.repositoryName})
Relevance Score: ${(chunk.similarity * 100).toFixed(1)}%

${chunk.content}`
  })

  return `# Retrieved Knowledge Context

The following information was retrieved from your knowledge repositories based on relevance to the prompt:

${sections.join('\n\n---\n\n')}

---
End of retrieved knowledge context.`
}

/**
 * Truncate text to approximate token limit
 */
function truncateToTokenLimit(text: string, maxTokens: number): string {
  // Rough approximation: 1 token ≈ 4 characters
  const maxChars = maxTokens * 4
  if (text.length <= maxChars) {
    return text
  }
  
  // Try to break at a sentence boundary
  const truncated = text.slice(0, maxChars)
  const lastPeriod = truncated.lastIndexOf('.')
  const lastNewline = truncated.lastIndexOf('\n')
  
  const breakPoint = Math.max(lastPeriod, lastNewline)
  if (breakPoint > maxChars * 0.8) {
    return truncated.slice(0, breakPoint + 1)
  }
  
  // Otherwise, break at word boundary
  const lastSpace = truncated.lastIndexOf(' ')
  if (lastSpace > maxChars * 0.8) {
    return truncated.slice(0, lastSpace)
  }
  
  return truncated
}