import { executeSQL } from "@/lib/db/data-api-adapter"
import { generateEmbedding } from "@/lib/ai-helpers"

export interface SearchResult {
  chunkId: number
  itemId: number
  itemName: string
  content: string
  similarity: number
  chunkIndex: number
  metadata: Record<string, unknown>
}

export interface SearchOptions {
  limit?: number
  threshold?: number
  repositoryId?: number
}

/**
 * Calculate cosine similarity between two vectors in PostgreSQL
 */
function getCosineSimilaritySQL(): string {
  return `
    (
      (SELECT SUM(a * b) FROM UNNEST(c.embedding_vector, query_vec.embedding) AS t(a, b))
      /
      (
        SQRT((SELECT SUM(a * a) FROM UNNEST(c.embedding_vector) AS a)) *
        SQRT((SELECT SUM(b * b) FROM UNNEST(query_vec.embedding) AS b))
      )
    )
  `
}

/**
 * Perform vector similarity search using cosine similarity
 */
export async function vectorSearch(
  query: string,
  options: SearchOptions = {}
): Promise<SearchResult[]> {
  const { limit = 10, threshold = 0.7, repositoryId } = options
  
  // Generate embedding for the query
  const queryEmbedding = await generateEmbedding(query)
  
  // Convert to PostgreSQL array format
  const embeddingStr = `{${queryEmbedding.join(',')}}`
  
  // Build the SQL query
  let sql = `
    WITH query_vec AS (
      SELECT ARRAY[${queryEmbedding.join(',')}]::real[] AS embedding
    )
    SELECT 
      c.id as chunk_id,
      c.item_id,
      i.name as item_name,
      c.content,
      c.chunk_index,
      c.metadata,
      ${getCosineSimilaritySQL()} as similarity
    FROM repository_item_chunks c
    CROSS JOIN query_vec
    JOIN repository_items i ON i.id = c.item_id
    WHERE c.embedding_vector IS NOT NULL
  `
  
  const params = []
  
  if (repositoryId) {
    sql += ' AND i.repository_id = :repositoryId'
    params.push({ name: 'repositoryId', value: { longValue: repositoryId } })
  }
  
  sql += `
    AND ${getCosineSimilaritySQL()} >= :threshold
    ORDER BY similarity DESC
    LIMIT :limit
  `
  
  params.push(
    { name: 'threshold', value: { doubleValue: threshold } },
    { name: 'limit', value: { longValue: limit } }
  )
  
  const results = await executeSQL(sql, params)
  
  return results.map(row => ({
    chunkId: Number(row.chunk_id) || 0,
    itemId: Number(row.item_id) || 0,
    itemName: String(row.item_name || ''),
    content: String(row.content || ''),
    similarity: Number(row.similarity) || 0,
    chunkIndex: Number(row.chunk_index) || 0,
    metadata: row.metadata ? JSON.parse(row.metadata as string) : {}
  }))
}

/**
 * Perform keyword search using PostgreSQL full-text search
 */
export async function keywordSearch(
  query: string,
  options: SearchOptions = {}
): Promise<SearchResult[]> {
  const { limit = 10, repositoryId } = options
  
  const sql = `
    SELECT 
      c.id as chunk_id,
      c.item_id,
      i.name as item_name,
      c.content,
      c.chunk_index,
      c.metadata,
      ts_rank(to_tsvector('english', c.content), plainto_tsquery('english', :query)) as rank
    FROM repository_item_chunks c
    JOIN repository_items i ON i.id = c.item_id
    WHERE to_tsvector('english', c.content) @@ plainto_tsquery('english', :query)
      ${repositoryId ? 'AND i.repository_id = :repositoryId' : ''}
    ORDER BY rank DESC
    LIMIT :limit
  `
  
  const params = [
    { name: 'query', value: { stringValue: query } },
    { name: 'limit', value: { longValue: limit } }
  ]
  
  if (repositoryId) {
    params.push({ name: 'repositoryId', value: { longValue: repositoryId } })
  }
  
  const results = await executeSQL(sql, params)
  
  return results.map(row => ({
    chunkId: Number(row.chunk_id) || 0,
    itemId: Number(row.item_id) || 0,
    itemName: String(row.item_name || ''),
    content: String(row.content || ''),
    similarity: Number(row.rank) || 0, // Use rank as similarity score
    chunkIndex: Number(row.chunk_index) || 0,
    metadata: row.metadata ? JSON.parse(row.metadata as string) : {}
  }))
}

/**
 * Perform hybrid search combining vector and keyword search
 */
export async function hybridSearch(
  query: string,
  options: SearchOptions & { vectorWeight?: number } = {}
): Promise<SearchResult[]> {
  const { limit = 10, vectorWeight = 0.7 } = options
  const keywordWeight = 1 - vectorWeight
  
  // Perform both searches in parallel
  const [vectorResults, keywordResults] = await Promise.all([
    vectorSearch(query, { ...options, limit: limit * 2 }), // Get more results for merging
    keywordSearch(query, { ...options, limit: limit * 2 })
  ])
  
  // Create a map to merge results by chunk ID
  const resultMap = new Map<number, SearchResult>()
  
  // Add vector results with weighted scores
  vectorResults.forEach(result => {
    resultMap.set(result.chunkId, {
      ...result,
      similarity: result.similarity * vectorWeight
    })
  })
  
  // Merge keyword results
  keywordResults.forEach(result => {
    const existing = resultMap.get(result.chunkId)
    if (existing) {
      // Combine scores if chunk appears in both results
      existing.similarity += result.similarity * keywordWeight
    } else {
      // Add new result with weighted score
      resultMap.set(result.chunkId, {
        ...result,
        similarity: result.similarity * keywordWeight
      })
    }
  })
  
  // Sort by combined score and return top results
  return Array.from(resultMap.values())
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit)
}

/**
 * Get surrounding context for a chunk
 */
export async function getChunkContext(
  itemId: number,
  chunkIndex: number,
  contextSize: number = 1
): Promise<string> {
  const sql = `
    SELECT content
    FROM repository_item_chunks
    WHERE item_id = :itemId
      AND chunk_index BETWEEN :startIndex AND :endIndex
    ORDER BY chunk_index
  `
  
  const results = await executeSQL(sql, [
    { name: 'itemId', value: { longValue: itemId } },
    { name: 'startIndex', value: { longValue: Math.max(0, chunkIndex - contextSize) } },
    { name: 'endIndex', value: { longValue: chunkIndex + contextSize } }
  ])
  
  return results.map(row => row.content).join('\n\n')
}