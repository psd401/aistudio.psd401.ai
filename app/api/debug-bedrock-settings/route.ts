import { NextResponse } from 'next/server'
import { executeSQL } from '@/lib/db/data-api-adapter'
import { Settings } from '@/lib/settings-manager'

export async function GET() {
  const results = {
    timestamp: new Date().toISOString(),
    environment: {
      NODE_ENV: process.env.NODE_ENV,
      AWS_REGION: process.env.AWS_REGION,
      AWS_LAMBDA_FUNCTION_NAME: process.env.AWS_LAMBDA_FUNCTION_NAME,
    }
  }
  
  try {
    // 1. Direct database query
    const dbResults = await executeSQL(
      `SELECT key, value, category FROM settings WHERE key LIKE 'BEDROCK%' ORDER BY key`
    )
    
    // 2. Settings manager results
    const settingsManagerResults = await Settings.getBedrock()
    
    // 3. Check environment variables
    const envVars = {
      BEDROCK_ACCESS_KEY_ID: !!process.env.BEDROCK_ACCESS_KEY_ID,
      BEDROCK_SECRET_ACCESS_KEY: !!process.env.BEDROCK_SECRET_ACCESS_KEY,
      BEDROCK_REGION: process.env.BEDROCK_REGION
    }
    
    return NextResponse.json({
      ...results,
      database: {
        rowCount: dbResults.length,
        rows: dbResults
      },
      settingsManager: {
        hasAccessKeyId: !!settingsManagerResults.accessKeyId,
        hasSecretAccessKey: !!settingsManagerResults.secretAccessKey,
        region: settingsManagerResults.region,
        // Show first 4 chars of keys if they exist (for debugging)
        accessKeyIdPrefix: settingsManagerResults.accessKeyId?.substring(0, 4),
        secretAccessKeyPrefix: settingsManagerResults.secretAccessKey?.substring(0, 4)
      },
      environmentVariables: envVars,
      analysis: {
        dbHasKeys: dbResults.some(r => r.key === 'BEDROCK_ACCESS_KEY_ID' || r.key === 'BEDROCK_SECRET_ACCESS_KEY'),
        settingsManagerHasKeys: !!(settingsManagerResults.accessKeyId && settingsManagerResults.secretAccessKey),
        envHasKeys: !!(process.env.BEDROCK_ACCESS_KEY_ID && process.env.BEDROCK_SECRET_ACCESS_KEY)
      }
    })
  } catch (error) {
    return NextResponse.json({
      ...results,
      error: error instanceof Error ? {
        name: error.name,
        message: error.message,
        stack: error.stack
      } : String(error)
    }, { status: 500 })
  }
}