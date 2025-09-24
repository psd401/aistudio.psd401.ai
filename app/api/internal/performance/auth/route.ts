/**
 * Authentication Performance Monitoring API
 * Internal endpoint for monitoring auth system performance
 */

import { NextRequest } from 'next/server';
import { authPerformanceMonitor } from '@/lib/monitoring/auth-performance-monitor';
import { getAuthCacheStats } from '@/lib/auth/optimized-polling-auth';
import { createLogger, generateRequestId } from '@/lib/logger';

const log = createLogger({ route: 'api.internal.performance.auth' });

/**
 * GET /api/internal/performance/auth
 * Returns comprehensive authentication performance metrics
 */
export async function GET(request: NextRequest) {
  const requestId = generateRequestId();
  try {
    const searchParams = request.nextUrl.searchParams;
    const format = searchParams.get('format') || 'summary';

    log.debug('Auth performance metrics requested', { format, requestId });

    switch (format) {
      case 'detailed':
        const detailedMetrics = {
          summary: authPerformanceMonitor.getPerformanceSummary(),
          metrics: authPerformanceMonitor.getMetrics(),
          cacheStats: getAuthCacheStats(),
          alerts: authPerformanceMonitor.getAlerts(20),
          timestamp: Date.now()
        };

        return Response.json(detailedMetrics, {
          headers: {
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Content-Type': 'application/json'
          }
        });

      case 'alerts':
        const alerts = authPerformanceMonitor.getAlerts(50);
        return Response.json({ alerts, count: alerts.length }, {
          headers: {
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Content-Type': 'application/json'
          }
        });

      default: // 'summary'
        const summary = authPerformanceMonitor.getPerformanceSummary();
        return Response.json(summary, {
          headers: {
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Content-Type': 'application/json'
          }
        });
    }

  } catch (error) {
    log.error('Failed to retrieve auth performance metrics', {
      error: error instanceof Error ? error.message : String(error)
    });

    return Response.json(
      { error: 'Failed to retrieve performance metrics' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/internal/performance/auth
 * Reset performance metrics (for testing or maintenance)
 */
export async function POST(request: NextRequest) {
  const requestId = generateRequestId();
  try {
    const body = await request.json();
    const action = body.action;

    log.info('Auth performance action requested', { action, requestId });

    switch (action) {
      case 'reset':
        authPerformanceMonitor.reset();
        return Response.json({ message: 'Auth performance metrics reset successfully' });

      default:
        return Response.json(
          { error: 'Unknown action. Supported actions: reset' },
          { status: 400 }
        );
    }

  } catch (error) {
    log.error('Failed to perform auth performance action', {
      error: error instanceof Error ? error.message : String(error)
    });

    return Response.json(
      { error: 'Failed to perform action' },
      { status: 500 }
    );
  }
}