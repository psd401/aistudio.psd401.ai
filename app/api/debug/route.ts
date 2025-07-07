import { NextResponse } from "next/server";
import { RDSDataClient, ExecuteStatementCommand } from "@aws-sdk/client-rds-data";
import { fromNodeProviderChain } from "@aws-sdk/credential-providers";

export async function GET() {
  const debug = {
    environment: {
      NODE_ENV: process.env.NODE_ENV,
      AWS_REGION: process.env.AWS_REGION || "not set",
      NEXT_PUBLIC_AWS_REGION: process.env.NEXT_PUBLIC_AWS_REGION || "not set",
      RDS_RESOURCE_ARN: process.env.RDS_RESOURCE_ARN ? "set" : "not set",
      RDS_SECRET_ARN: process.env.RDS_SECRET_ARN ? "set" : "not set",
      RDS_DATABASE_NAME: process.env.RDS_DATABASE_NAME || "not set",
      AWS_EXECUTION_ENV: process.env.AWS_EXECUTION_ENV || "not set",
      AWS_CONTAINER_CREDENTIALS_RELATIVE_URI: process.env.AWS_CONTAINER_CREDENTIALS_RELATIVE_URI ? "set" : "not set",
      AWS_CONTAINER_CREDENTIALS_FULL_URI: process.env.AWS_CONTAINER_CREDENTIALS_FULL_URI ? "set" : "not set",
      ECS_CONTAINER_METADATA_URI_V4: process.env.ECS_CONTAINER_METADATA_URI_V4 ? "set" : "not set",
    },
    credentialTest: {},
    rdsTest: {}
  };

  try {
    // Test credential provider
    const credentialProvider = fromNodeProviderChain();
    const credentials = await credentialProvider();
    debug.credentialTest = {
      success: true,
      hasAccessKeyId: !!credentials.accessKeyId,
      hasSecretAccessKey: !!credentials.secretAccessKey,
      hasSessionToken: !!credentials.sessionToken,
      expiration: credentials.expiration?.toISOString() || "no expiration"
    };
  } catch (error: any) {
    debug.credentialTest = {
      success: false,
      error: error.message,
      name: error.name,
      stack: error.stack?.split('\n').slice(0, 3).join('\n')
    };
  }

  // Only test RDS if we have the required environment variables
  if (process.env.RDS_RESOURCE_ARN && process.env.RDS_SECRET_ARN) {
    try {
      const client = new RDSDataClient({ 
        region: process.env.AWS_REGION || process.env.NEXT_PUBLIC_AWS_REGION || 'us-east-1',
        credentials: fromNodeProviderChain(),
        maxAttempts: 1
      });

      const command = new ExecuteStatementCommand({
        resourceArn: process.env.RDS_RESOURCE_ARN,
        secretArn: process.env.RDS_SECRET_ARN,
        database: process.env.RDS_DATABASE_NAME || 'aistudio',
        sql: 'SELECT 1 as test'
      });

      const response = await client.send(command);
      debug.rdsTest = {
        success: true,
        hasRecords: !!response.records,
        recordCount: response.records?.length || 0,
        metadata: !!response.columnMetadata
      };
    } catch (error: any) {
      debug.rdsTest = {
        success: false,
        error: error.message,
        name: error.name,
        code: error.Code || error.$metadata?.httpStatusCode,
        service: error.$service,
        fault: error.$fault,
        retryable: error.$retryable,
        metadata: error.$metadata
      };
    }
  } else {
    debug.rdsTest = {
      skipped: true,
      reason: "Missing RDS_RESOURCE_ARN or RDS_SECRET_ARN"
    };
  }

  return NextResponse.json(debug, { 
    status: 200,
    headers: {
      'Cache-Control': 'no-store'
    }
  });
}