import { SQSEvent, SQSRecord } from 'aws-lambda'
import { RDSData } from '@aws-sdk/client-rds-data'
import OpenAI from 'openai'
import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime'

const rdsClient = new RDSData({})

// Get settings from environment or database
async function getEmbeddingSettings() {
  const result = await rdsClient.executeStatement({
    resourceArn: process.env.DB_CLUSTER_ARN!,
    secretArn: process.env.DB_SECRET_ARN!,
    database: process.env.DB_NAME || 'aistudio',
    sql: `SELECT key, value FROM settings WHERE category = 'embeddings' OR key IN ('OPENAI_API_KEY', 'BEDROCK_ACCESS_KEY_ID', 'BEDROCK_SECRET_ACCESS_KEY', 'BEDROCK_REGION', 'AZURE_OPENAI_KEY', 'AZURE_OPENAI_ENDPOINT')`
  })

  const settings: Record<string, string> = {}
  for (const record of result.records || []) {
    if (record[0]?.stringValue && record[1]?.stringValue) {
      settings[record[0].stringValue] = record[1].stringValue
    }
  }

  return {
    provider: settings.EMBEDDING_MODEL_PROVIDER || 'openai',
    modelId: settings.EMBEDDING_MODEL_ID || 'text-embedding-3-small',
    dimensions: parseInt(settings.EMBEDDING_DIMENSIONS || '1536', 10),
    batchSize: parseInt(settings.EMBEDDING_BATCH_SIZE || '100', 10),
    openAIKey: settings.OPENAI_API_KEY,
    bedrockAccessKey: settings.BEDROCK_ACCESS_KEY_ID,
    bedrockSecretKey: settings.BEDROCK_SECRET_ACCESS_KEY,
    bedrockRegion: settings.BEDROCK_REGION,
    azureKey: settings.AZURE_OPENAI_KEY,
    azureEndpoint: settings.AZURE_OPENAI_ENDPOINT
  }
}

// Generate embeddings based on provider
async function generateEmbeddings(texts: string[], settings: any): Promise<number[][]> {
  switch (settings.provider) {
    case 'openai': {
      if (!settings.openAIKey) {
        throw new Error('OpenAI API key not configured')
      }

      const openai = new OpenAI({ apiKey: settings.openAIKey })
      const embeddings: number[][] = []

      // Process in batches
      for (let i = 0; i < texts.length; i += settings.batchSize) {
        const batch = texts.slice(i, i + settings.batchSize)
        const response = await openai.embeddings.create({
          model: settings.modelId,
          input: batch
        })

        embeddings.push(...response.data.map((item: any) => item.embedding))
      }

      return embeddings
    }

    case 'bedrock': {
      if (!settings.bedrockAccessKey || !settings.bedrockSecretKey) {
        throw new Error('Bedrock credentials not configured')
      }

      const client = new BedrockRuntimeClient({
        region: settings.bedrockRegion || 'us-east-1',
        credentials: {
          accessKeyId: settings.bedrockAccessKey,
          secretAccessKey: settings.bedrockSecretKey
        }
      })

      const embeddings: number[][] = []

      // Bedrock requires individual requests
      for (const text of texts) {
        const command = new InvokeModelCommand({
          modelId: settings.modelId,
          contentType: 'application/json',
          accept: 'application/json',
          body: JSON.stringify({
            inputText: text
          })
        })

        const response = await client.send(command)
        const result = JSON.parse(new TextDecoder().decode(response.body))
        embeddings.push(result.embedding)
      }

      return embeddings
    }

    case 'azure': {
      if (!settings.azureKey || !settings.azureEndpoint) {
        throw new Error('Azure OpenAI not configured')
      }

      // Azure OpenAI uses the same API as OpenAI
      const openai = new OpenAI({
        apiKey: settings.azureKey,
        baseURL: `${settings.azureEndpoint}/openai/deployments/${settings.modelId}`,
        defaultHeaders: {
          'api-key': settings.azureKey
        },
        defaultQuery: {
          'api-version': '2024-02-15-preview'
        }
      })

      const embeddings: number[][] = []

      for (let i = 0; i < texts.length; i += settings.batchSize) {
        const batch = texts.slice(i, i + settings.batchSize)
        const response = await openai.embeddings.create({
          model: settings.modelId,
          input: batch
        })

        embeddings.push(...response.data.map((item: any) => item.embedding))
      }

      return embeddings
    }

    default:
      throw new Error(`Unsupported embedding provider: ${settings.provider}`)
  }
}

interface EmbeddingMessage {
  itemId: number
  chunkIds: number[]
  texts: string[]
}

export async function handler(event: SQSEvent) {
  console.log('Processing embedding requests:', event.Records.length)

  const settings = await getEmbeddingSettings()

  for (const record of event.Records) {
    try {
      await processRecord(record, settings)
    } catch (error) {
      console.error('Error processing record:', error)
      // Re-throw to let SQS retry
      throw error
    }
  }
}

async function processRecord(record: SQSRecord, settings: any) {
  const message: EmbeddingMessage = JSON.parse(record.body)
  console.log(`Processing embeddings for item ${message.itemId} with ${message.chunkIds.length} chunks`)

  try {
    // Generate embeddings
    const embeddings = await generateEmbeddings(message.texts, settings)

    // Update chunks with embeddings
    for (let i = 0; i < message.chunkIds.length; i++) {
      const chunkId = message.chunkIds[i]
      const embedding = embeddings[i]

      // Store embedding as PostgreSQL array
      const embeddingStr = `{${embedding.join(',')}}`

      await rdsClient.executeStatement({
        resourceArn: process.env.DB_CLUSTER_ARN!,
        secretArn: process.env.DB_SECRET_ARN!,
        database: process.env.DB_NAME || 'aistudio',
        sql: 'UPDATE repository_item_chunks SET embedding_vector = :embedding::real[] WHERE id = :id',
        parameters: [
          {
            name: 'embedding',
            value: { stringValue: embeddingStr }
          },
          {
            name: 'id',
            value: { longValue: chunkId }
          }
        ]
      })
    }

    // Update item status
    await rdsClient.executeStatement({
      resourceArn: process.env.DB_CLUSTER_ARN!,
      secretArn: process.env.DB_SECRET_ARN!,
      database: process.env.DB_NAME || 'aistudio',
      sql: `UPDATE repository_items 
            SET processing_status = 'embedded', 
                updated_at = CURRENT_TIMESTAMP 
            WHERE id = :id`,
      parameters: [
        {
          name: 'id',
          value: { longValue: message.itemId }
        }
      ]
    })

    console.log(`Successfully generated embeddings for item ${message.itemId}`)
  } catch (error) {
    console.error(`Failed to generate embeddings for item ${message.itemId}:`, error)

    // Update item with error
    await rdsClient.executeStatement({
      resourceArn: process.env.DB_CLUSTER_ARN!,
      secretArn: process.env.DB_SECRET_ARN!,
      database: process.env.DB_NAME || 'aistudio',
      sql: `UPDATE repository_items 
            SET processing_status = 'embedding_failed', 
                processing_error = :error,
                updated_at = CURRENT_TIMESTAMP 
            WHERE id = :id`,
      parameters: [
        {
          name: 'id',
          value: { longValue: message.itemId }
        },
        {
          name: 'error',
          value: { stringValue: (error as Error).message }
        }
      ]
    })

    throw error
  }
}