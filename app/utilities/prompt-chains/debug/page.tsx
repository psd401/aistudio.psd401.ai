"use server"

import { db } from "@/db/query"
import { promptChainToolsTable } from "@/db/schema"

export default async function PromptChainDebugPage() {
  // Get all tools directly from the database
  const tools = await db.select().from(promptChainToolsTable)
  
  return (
    <div className="container py-8">
      <h1 className="text-2xl font-bold mb-4">Debug: All Prompt Chain Tools</h1>
      
      <div className="overflow-x-auto">
        <table className="w-full border-collapse border">
          <thead>
            <tr className="bg-gray-100">
              <th className="border p-2 text-left">ID</th>
              <th className="border p-2 text-left">Name</th>
              <th className="border p-2 text-left">Status</th>
              <th className="border p-2 text-left">Creator ID</th>
              <th className="border p-2 text-left">Created At</th>
            </tr>
          </thead>
          <tbody>
            {tools.map(tool => (
              <tr key={tool.id} className="hover:bg-gray-50">
                <td className="border p-2">{tool.id}</td>
                <td className="border p-2">{tool.name}</td>
                <td className="border p-2">{tool.status}</td>
                <td className="border p-2">{tool.creatorId}</td>
                <td className="border p-2">{new Date(tool.createdAt).toLocaleString()}</td>
              </tr>
            ))}
            {tools.length === 0 && (
              <tr>
                <td colSpan={5} className="border p-4 text-center">
                  No tools found in the database
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
} 