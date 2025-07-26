import { RDSDataClient, ExecuteStatementCommand } from '@aws-sdk/client-rds-data';

const rdsClient = new RDSDataClient({});

interface UsageTracker {
  canProcessPages(pageCount: number): Promise<boolean>;
  recordUsage(pageCount: number): Promise<void>;
  getMonthlyUsage(): Promise<number>;
}

export class TextractUsageTracker implements UsageTracker {
  private readonly dbArn: string;
  private readonly secretArn: string;
  private readonly dbName: string;
  private readonly monthlyLimit: number = 1000; // Free tier limit
  
  constructor(dbArn: string, secretArn: string, dbName: string = 'aistudio') {
    this.dbArn = dbArn;
    this.secretArn = secretArn;
    this.dbName = dbName;
  }
  
  async canProcessPages(pageCount: number): Promise<boolean> {
    const currentUsage = await this.getMonthlyUsage();
    return (currentUsage + pageCount) <= this.monthlyLimit;
  }
  
  async recordUsage(pageCount: number): Promise<void> {
    const sql = `
      INSERT INTO textract_usage (month, page_count, created_at)
      VALUES (DATE_TRUNC('month', CURRENT_DATE), :pageCount, CURRENT_TIMESTAMP)
      ON CONFLICT (month) 
      DO UPDATE SET 
        page_count = textract_usage.page_count + :pageCount,
        updated_at = CURRENT_TIMESTAMP
    `;
    
    await rdsClient.send(
      new ExecuteStatementCommand({
        resourceArn: this.dbArn,
        secretArn: this.secretArn,
        database: this.dbName,
        sql,
        parameters: [
          { name: 'pageCount', value: { longValue: pageCount } }
        ]
      })
    );
  }
  
  async getMonthlyUsage(): Promise<number> {
    const sql = `
      SELECT COALESCE(page_count, 0) as usage
      FROM textract_usage
      WHERE month = DATE_TRUNC('month', CURRENT_DATE)
    `;
    
    const result = await rdsClient.send(
      new ExecuteStatementCommand({
        resourceArn: this.dbArn,
        secretArn: this.secretArn,
        database: this.dbName,
        sql
      })
    );
    
    if (result.records && result.records.length > 0) {
      return result.records[0][0]?.longValue || 0;
    }
    
    return 0;
  }
  
  async getRemainingPages(): Promise<number> {
    const usage = await this.getMonthlyUsage();
    return Math.max(0, this.monthlyLimit - usage);
  }
}