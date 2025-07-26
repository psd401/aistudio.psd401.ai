"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { type Repository } from "@/actions/repositories/repository.actions"
import { RepositoryItemList } from "./repository-item-list"
import { FileUploadModal } from "./file-upload-modal"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ArrowLeft, Edit, Globe, Lock, Search, Settings } from "lucide-react"
import { format } from "date-fns"
import { RepositorySearch } from "./repository-search"

interface RepositoryDetailProps {
  repository: Repository
}

export function RepositoryDetail({ repository }: RepositoryDetailProps) {
  const router = useRouter()
  const [uploadModalOpen, setUploadModalOpen] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)

  return (
    <>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => router.push("/admin/repositories")}
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h1 className="text-3xl font-bold">{repository.name}</h1>
              {repository.description && (
                <p className="text-muted-foreground mt-1">
                  {repository.description}
                </p>
              )}
            </div>
          </div>
          <Button
            variant="outline"
            onClick={() => router.push(`/admin/repositories/${repository.id}/edit`)}
          >
            <Edit className="mr-2 h-4 w-4" />
            Edit
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Repository Information</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <dt className="text-sm font-medium text-muted-foreground">
                  Owner
                </dt>
                <dd className="mt-1 text-sm">{repository.owner_name}</dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-muted-foreground">
                  Visibility
                </dt>
                <dd className="mt-1">
                  {repository.is_public ? (
                    <Badge variant="outline" className="gap-1">
                      <Globe className="h-3 w-3" />
                      Public
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="gap-1">
                      <Lock className="h-3 w-3" />
                      Private
                    </Badge>
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-muted-foreground">
                  Created
                </dt>
                <dd className="mt-1 text-sm">
                  {repository.created_at ? format(new Date(repository.created_at), "PPP") : "-"}
                </dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-muted-foreground">
                  Last Updated
                </dt>
                <dd className="mt-1 text-sm">
                  {repository.updated_at ? format(new Date(repository.updated_at), "PPP") : "-"}
                </dd>
              </div>
            </dl>
          </CardContent>
        </Card>

        <Tabs defaultValue="items" className="space-y-4">
          <TabsList>
            <TabsTrigger value="items">Items</TabsTrigger>
            <TabsTrigger value="search">
              <Search className="mr-2 h-4 w-4" />
              Search
            </TabsTrigger>
            <TabsTrigger value="access">
              <Settings className="mr-2 h-4 w-4" />
              Access Control
            </TabsTrigger>
          </TabsList>

          <TabsContent value="items">
            <RepositoryItemList
              key={refreshKey}
              repositoryId={repository.id}
              onAddItem={() => setUploadModalOpen(true)}
            />
          </TabsContent>

          <TabsContent value="search">
            <RepositorySearch repositoryId={repository.id} />
          </TabsContent>

          <TabsContent value="access">
            <Card>
              <CardHeader>
                <CardTitle>Access Control</CardTitle>
                <CardDescription>
                  Manage who can access this repository
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">
                  Access control management coming soon...
                </p>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      <FileUploadModal
        repositoryId={repository.id}
        open={uploadModalOpen}
        onOpenChange={setUploadModalOpen}
        onSuccess={() => setRefreshKey(prev => prev + 1)}
      />
    </>
  )
}