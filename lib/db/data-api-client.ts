import { RDSDataClient, ExecuteStatementCommand } from "@aws-sdk/client-rds-data";

// Initialize the RDS Data API client
const client = new RDSDataClient({ 
  region: process.env.NEXT_PUBLIC_AWS_REGION || 'us-east-1' 
});

export interface DataApiConfig {
  resourceArn: string;  // The Aurora cluster ARN
  secretArn: string;    // The Secrets Manager secret ARN
  database: string;     // Database name
}

/**
 * Execute SQL using RDS Data API
 * This works without VPC connectivity - great for local development!
 */
export async function executeStatement(
  sql: string, 
  parameters?: any[],
  config?: DataApiConfig
) {
  const defaultConfig = {
    resourceArn: process.env.RDS_RESOURCE_ARN!,
    secretArn: process.env.RDS_SECRET_ARN!,
    database: process.env.RDS_DATABASE_NAME || 'aistudio'
  };

  const command = new ExecuteStatementCommand({
    ...defaultConfig,
    ...config,
    sql,
    parameters,
    includeResultMetadata: true
  });

  try {
    const response = await client.send(command);
    return response;
  } catch (error) {
    console.error('Data API Error:', error);
    throw error;
  }
}

// Example usage:
// const result = await executeStatement('SELECT * FROM users WHERE id = :id', [
//   { name: 'id', value: { stringValue: '123' } }
// ]); 