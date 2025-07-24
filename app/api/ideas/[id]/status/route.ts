import { getServerSession } from '@/lib/auth/server-session';
import { NextResponse } from 'next/server';
import { executeSQL } from '@/lib/db/data-api-adapter';
import { hasRole } from '@/utils/roles';
import logger from '@/lib/logger';
import { SqlParameter } from 'aws-sdk/clients/rdsdataservice';
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getServerSession();
  if (!session?.sub) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  const isAdmin = await hasRole('administrator');
  if (!isAdmin) {
    return new NextResponse('Forbidden', { status: 403 });
  }

  try {
    const resolvedParams = await context.params;
    const { id } = resolvedParams;
    const ideaId = parseInt(id);
    if (isNaN(ideaId)) {
      return new NextResponse('Invalid idea ID', { status: 400 });
    }

    const { status } = await request.json();
    if (!status) {
      return new NextResponse('Missing status', { status: 400 });
    }

    let sql = 'UPDATE ideas SET status = :status, updated_at = NOW()';
    const params: SqlParameter[] = [
      { name: 'status', value: { stringValue: status } },
      { name: 'ideaId', value: { longValue: ideaId } },
    ];

    if (status === 'completed') {
      // Get the user's numeric ID from their cognito_sub
      const userSql = 'SELECT id FROM users WHERE cognito_sub = :cognitoSub';
      const userResult = await executeSQL(userSql, [{ name: 'cognitoSub', value: { stringValue: session.sub } }]);
      
      if (!userResult || userResult.length === 0) {
        return new NextResponse('User not found', { status: 404 });
      }
      
      const userId = userResult[0].id;
      sql += ', completed_by = :completedBy, completed_at = NOW()';
      params.push({ name: 'completedBy', value: { stringValue: userId.toString() } });
    }

    sql += ' WHERE id = :ideaId RETURNING *';
    
    const result = await executeSQL(sql, params);

    return NextResponse.json(result[0]);
  } catch (error) {
    logger.error('Error updating idea status:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
} 