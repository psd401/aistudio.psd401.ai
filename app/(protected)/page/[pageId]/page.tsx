"use server"

import { notFound } from "next/navigation"
import { db } from "@/db/db"
import { navigationItemsTable, toolsTable, assistantArchitectsTable } from "@/db/schema"
import { eq, inArray } from "drizzle-orm"
import { Suspense } from "react"
import Image from "next/image"
import Link from "next/link"

interface PageProps {
  params: { pageId: string }
}

export default async function PublicPage({ params }: PageProps) {
  const { pageId } = await params
  // Fetch the page navigation item
  const [pageItem] = await db
    .select()
    .from(navigationItemsTable)
    .where(eq(navigationItemsTable.id, pageId))

  if (!pageItem || pageItem.type !== "page") {
    notFound()
  }

  // Fetch all child links/tools of this page
  const childItems = await db
    .select()
    .from(navigationItemsTable)
    .where(eq(navigationItemsTable.parentId, pageId))
    .then(items => items.filter(i => i.type === "link" && i.isActive))

  // Helper to extract toolId from a link like /tools/assistant-architect/{toolId}
  function extractAssistantId(link: string | null | undefined): string | null {
    if (!link) return null
    const match = link.match(/\/tools\/assistant-architect\/([\w-]+)/)
    return match ? match[1] : null
  }

  // For each child, try to extract assistant/tool id from the link
  const childAssistantIds = childItems
    .map(child => extractAssistantId(child.link))
    .filter((id): id is string => Boolean(id))

  let assistants: Record<string, any> = {}
  if (childAssistantIds.length > 0) {
    const assistantRows = await db
      .select()
      .from(assistantArchitectsTable)
      .where(inArray(assistantArchitectsTable.id, childAssistantIds))
    assistants = Object.fromEntries(assistantRows.map(a => [a.id, a]))
  }

  return (
    <div className="container mx-auto py-8">
      <h1 className="text-3xl font-bold mb-4">{pageItem.label}</h1>
      {pageItem.description && (
        <p className="mb-6 text-muted-foreground">{pageItem.description}</p>
      )}
      <Suspense fallback={<div>Loading tools...</div>}>
        {childItems.length === 0 ? (
          <div className="text-muted-foreground text-center py-12">No tools assigned to this page.</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
            {childItems.map(child => {
              const assistantId = extractAssistantId(child.link)
              const assistant = assistantId ? assistants[assistantId] : null
              const href = child.link || "#"
              return (
                <Link
                  key={child.id}
                  href={href}
                  className="block rounded-lg border bg-card shadow-sm hover:shadow-md transition p-6 group focus-visible:ring-2 focus-visible:ring-primary"
                >
                  <div className="flex items-start">
                    {assistant && assistant.imagePath ? (
                      <Image
                        src={`/assistant_logos/${assistant.imagePath}`}
                        alt={assistant.name}
                        width={64}
                        height={64}
                        className="w-16 h-16 min-w-[64px] min-h-[64px] rounded-lg object-cover flex-shrink-0"
                      />
                    ) : (
                      <span className="text-3xl text-muted-foreground block">
                        <span className="i-lucide:{child.icon}" />
                      </span>
                    )}
                    <div className="ml-4">
                      <div className="font-semibold text-lg">
                        {assistant ? assistant.name : child.label}
                      </div>
                      <div className="text-muted-foreground text-sm mt-1">
                        {assistant ? assistant.description : child.description}
                      </div>
                    </div>
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </Suspense>
    </div>
  )
} 