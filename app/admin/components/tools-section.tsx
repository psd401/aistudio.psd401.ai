"use client"

import { Card } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { AudienceManagerClientWrapper } from "@/components/features/communication-analysis/audience-manager-client-wrapper"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"
import { useState } from "react"
import { AccessControlManagerClientWrapper } from "@/components/features/communication-analysis/access-control-manager-client-wrapper"
import { ModelsManagerClientWrapper } from "@/components/features/communication-analysis/models-manager-client-wrapper"
import { TechniquesManagerClientWrapper } from "@/components/features/meta-prompting/techniques-manager-client-wrapper"
import { TemplatesManagerClientWrapper } from "@/components/features/meta-prompting/templates-manager-client-wrapper"

interface ToolSection {
  id: string
  name: string
  component: () => React.ReactNode
}

interface Tool {
  id: string
  name: string
  description: string
  sections: ToolSection[]
}

const tools: Tool[] = [
  {
    id: "communication-analysis",
    name: "Communication Analysis",
    description: "Configure audiences, AI models, and prompts for communication analysis",
    sections: [
      {
        id: "audiences",
        name: "Audiences",
        component: () => <AudienceManagerClientWrapper />
      },
      {
        id: "models",
        name: "Models & Prompts",
        component: () => <ModelsManagerClientWrapper />
      },
      {
        id: "access",
        name: "Access Control",
        component: () => <AccessControlManagerClientWrapper />
      }
    ]
  },
  {
    id: "meta-prompting",
    name: "Meta-Prompting",
    description: "Configure meta-prompting techniques and templates",
    sections: [
      {
        id: "techniques",
        name: "Techniques",
        component: () => <TechniquesManagerClientWrapper />
      },
      {
        id: "templates",
        name: "Templates",
        component: () => <TemplatesManagerClientWrapper />
      }
    ]
  }
]

export function ToolsSection() {
  const [selectedTool, setSelectedTool] = useState(tools[0].id)
  const [selectedSection, setSelectedSection] = useState(tools[0].sections[0].id)
  const currentTool = tools.find(t => t.id === selectedTool)!
  const currentSection = currentTool.sections.find(s => s.id === selectedSection)!

  return (
    <div className="flex gap-6">
      {/* Tools Sidebar */}
      <Card className="w-64 p-2">
        <ScrollArea className="h-[calc(100vh-12rem)]">
          <div className="space-y-2 p-2">
            {tools.map(tool => (
              <button
                key={tool.id}
                onClick={() => {
                  setSelectedTool(tool.id)
                  setSelectedSection(tool.sections[0].id)
                }}
                className={cn(
                  "w-full rounded-lg p-3 text-left text-sm transition-colors hover:bg-accent",
                  tool.id === selectedTool ? "bg-accent" : "transparent"
                )}
              >
                <div className="font-medium">{tool.name}</div>
                <div className="text-xs text-muted-foreground line-clamp-2">
                  {tool.description}
                </div>
              </button>
            ))}
          </div>
        </ScrollArea>
      </Card>

      {/* Main Content */}
      <Card className="flex-1 p-6">
        <div className="space-y-6">
          <div>
            <h2 className="text-2xl font-semibold">{currentTool.name}</h2>
            <p className="text-muted-foreground">{currentTool.description}</p>
          </div>

          <Tabs value={selectedSection} onValueChange={setSelectedSection} className="space-y-4">
            <TabsList>
              {currentTool.sections.map(section => (
                <TabsTrigger key={section.id} value={section.id}>
                  {section.name}
                </TabsTrigger>
              ))}
            </TabsList>

            <TabsContent value={selectedSection}>
              {currentSection.component()}
            </TabsContent>
          </Tabs>
        </div>
      </Card>
    </div>
  )
} 