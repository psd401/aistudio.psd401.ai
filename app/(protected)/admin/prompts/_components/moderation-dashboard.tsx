"use client"

import { useEffect, useState, useCallback } from 'react'
import { getModerationQueue, getModerationStats } from '@/actions/admin/moderate-prompt.actions'
import type { ModerationQueueItem } from '@/actions/admin/moderate-prompt.actions'
import { ModerationStats } from './moderation-stats'
import { ModerationQueue } from './moderation-queue'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useToast } from '@/components/ui/use-toast'

export function ModerationDashboard() {
  const [stats, setStats] = useState({
    pending: 0,
    approved: 0,
    rejected: 0,
    totalToday: 0
  })
  const [queueItems, setQueueItems] = useState<ModerationQueueItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('pending')
  const { toast } = useToast()

  const loadData = useCallback(async (status: string = 'pending') => {
    setIsLoading(true)
    try {
      const [statsResult, queueResult] = await Promise.all([
        getModerationStats(),
        getModerationQueue({ status, limit: 50, offset: 0 })
      ])

      if (statsResult.isSuccess && statsResult.data) {
        setStats(statsResult.data)
      }

      if (queueResult.isSuccess && queueResult.data) {
        setQueueItems(queueResult.data.items)
      } else if (!queueResult.isSuccess) {
        toast({
          title: 'Error loading queue',
          description: queueResult.message,
          variant: 'destructive'
        })
      }
    } catch {
      toast({
        title: 'Error',
        description: 'Failed to load moderation data',
        variant: 'destructive'
      })
    } finally {
      setIsLoading(false)
    }
  }, [toast])

  useEffect(() => {
    void loadData(activeTab)
  }, [activeTab, loadData])

  const handleRefresh = () => {
    void loadData(activeTab)
  }

  return (
    <div className="space-y-6">
      <ModerationStats stats={stats} />

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList>
          <TabsTrigger value="pending">
            Pending ({stats.pending})
          </TabsTrigger>
          <TabsTrigger value="approved">
            Approved ({stats.approved})
          </TabsTrigger>
          <TabsTrigger value="rejected">
            Rejected ({stats.rejected})
          </TabsTrigger>
          <TabsTrigger value="all">
            All
          </TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab} className="mt-6">
          <ModerationQueue
            items={queueItems}
            isLoading={isLoading}
            onRefresh={handleRefresh}
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}
