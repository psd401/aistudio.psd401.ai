import { NextResponse } from "next/server";

// Minimal health check endpoint with no dependencies
export async function GET() {
  return NextResponse.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    env: {
      NODE_ENV: process.env.NODE_ENV || "not set",
      // Check if basic AWS environment variables are present
      hasAwsRegion: !!(process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION),
      hasAwsExecution: !!process.env.AWS_EXECUTION_ENV,
      // Check if our custom env vars are present
      hasRdsArn: !!process.env.RDS_RESOURCE_ARN,
      hasSecretArn: !!process.env.RDS_SECRET_ARN,
    }
  });
}