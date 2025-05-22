"use client"

import { useState, useCallback, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"
import { addChainPromptAction, deletePromptAction, updatePromptAction, updatePromptPositionAction, getAssistantArchitectByIdAction, setPromptPositionsAction } from "@/actions/db/assistant-architect-actions"
import { PlusIcon, ArrowUp, ArrowDown, Pencil, Trash2, Plus, X, Play } from "lucide-react"
import {
  ReactFlow,
  MiniMap,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  addEdge,
  Node,
  Edge,
  Connection,
  NodeChange,
  EdgeChange,
  Handle,
  Position,
  NodeProps,
  useReactFlow,
  ReactFlowProvider,
  Panel
} from '@xyflow/react'
import "@xyflow/react/dist/style.css"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import type { SelectAiModel, SelectChainPrompt, SelectToolInputField } from "@/types"
import React from "react"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter
} from "@/components/ui/sheet"
import dynamic from "next/dynamic"
import {
  toolbarPlugin,
  markdownShortcutPlugin,
  listsPlugin,
  headingsPlugin,
  quotePlugin,
  thematicBreakPlugin,
  linkPlugin,
  linkDialogPlugin,
  UndoRedo,
  BoldItalicUnderlineToggles,
  BlockTypeSelect,
  ListsToggle,
  Separator,
  CreateLink
} from "@mdxeditor/editor"
const MDXEditor = dynamic(() => import("@mdxeditor/editor").then(mod => mod.MDXEditor), { ssr: false })

interface InputMapping {
  variableName: string
  source: "input" | "prompt"
  sourceId: string
}

interface PromptsPageClientProps {
  assistantId: string
  prompts: SelectChainPrompt[]
  models: SelectAiModel[]
  inputFields: SelectToolInputField[]
}

// Start Node Component
function StartNode() {
  return (
    <div className="px-4 py-2 rounded-lg bg-primary text-primary-foreground font-medium flex items-center gap-2">
      <Play className="h-4 w-4" />
      Start
      <Handle type="source" position={Position.Bottom} className="w-2 h-2 !bg-primary-foreground" />
    </div>
  )
}

// Custom Node Component
function PromptNode({ data, id }: NodeProps) {
  const handleEdit = () => {
    (data.onEdit as any)(data.prompt)
  }

  const handleDelete = () => {
    (data.onDelete as any)(id)
  }

  const d = data as any
  return (
    <div className="min-w-[200px] shadow-lg rounded-lg bg-background border">
      <div className="p-3">
        <div className="flex items-center justify-between mb-2">
          <div className="font-semibold text-base">{d.name as string}</div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={handleEdit}
            >
              <Pencil className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={handleDelete}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <Badge variant="secondary" className="text-xs">
          {d.modelName as string}
        </Badge>
      </div>

      <Handle type="target" position={Position.Top} className="w-2 h-2 !bg-primary" />
      <Handle type="source" position={Position.Bottom} className="w-2 h-2 !bg-primary" />
    </div>
  )
}

const nodeTypes = {
  prompt: PromptNode,
  start: StartNode
}

// Convert Flow to a forwardRef component
const Flow = React.forwardRef(({ 
  assistantId,
  prompts, 
  models, 
  onEdit, 
  onDelete
}: { 
  assistantId: string,
  prompts: SelectChainPrompt[]
  models: SelectAiModel[]
  onEdit: (prompt: SelectChainPrompt) => void
  onDelete: (id: string) => void
}, ref: React.Ref<any>) => {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([])
  const [edges, setEdges, _onEdgesChange] = useEdgesState<Edge>([])
  const [isSaving, setIsSaving] = useState(false)
  const reactFlowInstance = useReactFlow()
  const isInitialRender = useRef(true)
  const initialPositionsSet = useRef(false)

  // Expose methods to parent via ref
  React.useImperativeHandle(ref, () => ({
    getNodes: () => reactFlowInstance.getNodes(),
    getEdges: () => reactFlowInstance.getEdges(),
    setNodes: (nodes: Node[]) => reactFlowInstance.setNodes(nodes),
    setEdges: (edges: Edge[]) => reactFlowInstance.setEdges(edges),
    savePositions: () => savePositions()
  }));

  // Calculate execution order based on graph structure
  const calculateExecutionOrder = useCallback((): { id: string; position: number }[] => {
    const nodes = reactFlowInstance.getNodes();
    const edges = reactFlowInstance.getEdges();
    const startNode = nodes.find(n => n.type === 'start');
    if (!startNode) return [];

    // Track nodes and their levels
    const nodeLevels = new Map<string, number>();
    const visited = new Set<string>();
    
    // Helper function to get incoming edges to a node
    const getIncomingEdges = (nodeId: string) => 
      edges.filter(e => e.target === nodeId);

    // Helper function to get outgoing edges from a node
    const getOutgoingEdges = (nodeId: string) =>
      edges.filter(e => e.source === nodeId);

    // First, calculate levels for all nodes using BFS
    const queue = [{ id: 'start', level: -1 }]; // Start node at level -1 so first real nodes are at 0
    while (queue.length > 0) {
      const { id, level } = queue.shift()!;
      
      if (visited.has(id)) {
        // If we've seen this node before, update its level to be the maximum
        nodeLevels.set(id, Math.max(level, nodeLevels.get(id) || 0));
        continue;
      }
      
      visited.add(id);
      nodeLevels.set(id, level);
      
      // Add all target nodes of outgoing edges to queue
      const outgoingEdges = getOutgoingEdges(id);
      for (const edge of outgoingEdges) {
        queue.push({ id: edge.target, level: level + 1 });
      }
    }

    // Build array of {id, position}
    const result = Array.from(nodeLevels.entries())
      .filter(([id]) => id !== 'start')
      .map(([id, level]) => ({ id, position: level }));

    console.log('Node levels:', Object.fromEntries(nodeLevels));
    console.log('Execution mapping:', result);

    return result;
  }, [reactFlowInstance]);

  // Save positions to database
  const savePositions = useCallback(async () => {
    setIsSaving(true);
    try {
      const order = calculateExecutionOrder();
      if (order.length === 0) { setIsSaving(false); return; }
      console.log('Saving execution order:', order);
      // Transaction update
      await setPromptPositionsAction(assistantId, order);
      toast.success("Graph structure saved");
    } catch(e){ console.error("Failed to save positions",e); toast.error("Failed to save graph structure"); }
    finally { setIsSaving(false);} 
  }, [calculateExecutionOrder, assistantId]);

  // Handle edge changes and update positions
  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    _onEdgesChange(changes)
    
    // Only save when edges are added or removed
    const hasStructuralChanges = changes.some(change => 
      change.type === 'remove' || change.type === 'add'
    )
    if (hasStructuralChanges && !isInitialRender.current) {
      savePositions()
    }
  }, [_onEdgesChange, savePositions])

  // Handle new connections
  const onConnect = useCallback((params: Connection) => {
    setEdges(eds => addEdge(params, eds))
    if (!isInitialRender.current) {
      savePositions()
    }
  }, [setEdges, savePositions])

  // Initialize nodes and edges on first load only
  useEffect(() => {
    if (initialPositionsSet.current) return
    
    // If no prompts, just set up the start node
    if (prompts.length === 0) {
      const startNode: Node = {
        id: 'start',
        type: 'start',
        position: { x: 250, y: 0 },
        data: {}
      }
      setNodes([startNode])
      setEdges([])
      initialPositionsSet.current = true
      return
    }

    // Create the prompt nodes with their initial positions
    const startNode: Node = {
      id: 'start',
      type: 'start',
      position: { x: 250, y: 0 },
      data: {}
    }

    // Group prompts by position to identify parallel execution paths
    const promptsByPosition = prompts.reduce((acc, prompt) => {
      const position = prompt.position || 0;
      if (!acc[position]) acc[position] = [];
      acc[position].push(prompt);
      return acc;
    }, {} as Record<number, SelectChainPrompt[]>);
    
    // Sort positions to ensure deterministic layout
    const positions = Object.keys(promptsByPosition).map(Number).sort((a, b) => a - b);
    
    // Create nodes with proper positioning based on execution paths
    const promptNodes: Node[] = [];
    const horizontalSpacing = 300;
    const verticalSpacing = 150;
    
    positions.forEach((position, rowIndex) => {
      const promptsAtPosition = promptsByPosition[position];
      const rowY = (rowIndex + 1) * verticalSpacing;
      
      // For parallel nodes (more than one at the same position)
      // arrange them horizontally
      promptsAtPosition.forEach((prompt, colIndex) => {
        const centerOffset = ((promptsAtPosition.length - 1) * horizontalSpacing) / 2;
        const xPos = 250 + (colIndex * horizontalSpacing) - centerOffset;
        
        promptNodes.push({
          id: prompt.id,
          type: 'prompt' as const,
          position: { x: xPos, y: rowY },
          data: {
            name: prompt.name,
            content: prompt.content,
            modelName: models.find(m => m.id === prompt.modelId)?.name || 'None',
            systemContext: prompt.systemContext,
            modelId: prompt.modelId,
            inputMapping: prompt.inputMapping,
            prompt,
            onEdit,
            onDelete
          }
        });
      });
    });

    // Create edges based on positions and execution flow
    const newEdges: Edge[] = [];
    
    // First, connect start node to all position 0 prompts
    if (promptsByPosition[0]) {
      promptsByPosition[0].forEach(prompt => {
        newEdges.push({
          id: `e-start-${prompt.id}`,
          source: 'start',
          target: prompt.id,
          type: 'smoothstep'
        });
      });
    }
    
    // Then connect each prompt to the next position's prompts
    for (let i = 0; i < positions.length - 1; i++) {
      const currentPosition = positions[i];
      const nextPosition = positions[i + 1];
      
      const currentPrompts = promptsByPosition[currentPosition];
      const nextPrompts = promptsByPosition[nextPosition];
      
      // If there's one prompt at current position and multiple at next position,
      // connect the current to each of the next (branching)
      if (currentPrompts.length === 1 && nextPrompts.length > 1) {
        const sourceId = currentPrompts[0].id;
        nextPrompts.forEach(targetPrompt => {
          newEdges.push({
            id: `e-${sourceId}-${targetPrompt.id}`,
            source: sourceId,
            target: targetPrompt.id,
            type: 'smoothstep'
          });
        });
      }
      // If there are multiple prompts at current position and one at next position,
      // connect each current to the next (merging)
      else if (currentPrompts.length > 1 && nextPrompts.length === 1) {
        const targetId = nextPrompts[0].id;
        currentPrompts.forEach(sourcePrompt => {
          newEdges.push({
            id: `e-${sourcePrompt.id}-${targetId}`,
            source: sourcePrompt.id,
            target: targetId,
            type: 'smoothstep'
          });
        });
      }
      // Otherwise, connect each current to each next
      else {
        // Default behavior: connect each node to all nodes in the next position
        // This is a simplification - you might want to improve this logic
        currentPrompts.forEach(sourcePrompt => {
          nextPrompts.forEach(targetPrompt => {
            newEdges.push({
              id: `e-${sourcePrompt.id}-${targetPrompt.id}`,
              source: sourcePrompt.id,
              target: targetPrompt.id,
              type: 'smoothstep'
            });
          });
        });
      }
    }

    setNodes([startNode, ...promptNodes])
    setEdges(newEdges)
    initialPositionsSet.current = true
    
    // After a short delay, we're no longer in initial render state
    setTimeout(() => {
      isInitialRender.current = false
    }, 500)
  }, [prompts, models, onEdit, onDelete, setNodes, setEdges])

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onConnect={onConnect}
      nodeTypes={nodeTypes}
      fitView
    >
      <Background />
      <Controls />
      <MiniMap />
      <Panel position="bottom-center" className="bg-background/80 p-2 rounded-lg shadow-lg">
        <div className="text-sm text-muted-foreground flex items-center gap-2">
          {isSaving ? (
            <>
              <div className="h-2 w-2 rounded-full bg-primary animate-pulse" />
              Saving changes...
            </>
          ) : (
            'Drag between nodes to create connections. The execution order follows the graph structure.'
          )}
        </div>
      </Panel>
    </ReactFlow>
  )
});

// Simple heuristic: 1 token ~ 4 characters (OpenAI guideline)
function estimateTokens(text: string): number {
  if (!text) return 0
  return Math.ceil(text.length / 4)
}

export function PromptsPageClient({ assistantId, prompts: initialPrompts, models, inputFields }: PromptsPageClientProps) {
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [promptName, setPromptName] = useState("")
  const [promptContent, setPromptContent] = useState("")
  const [systemContext, setSystemContext] = useState("")
  const [modelId, setModelId] = useState<string | null>(null)
  const [editingPrompt, setEditingPrompt] = useState<SelectChainPrompt | null>(null)
  const [inputMappings, setInputMappings] = useState<InputMapping[]>([])
  const [isUpdatingPositions, setIsUpdatingPositions] = useState(false)
  const [prompts, setPrompts] = useState<SelectChainPrompt[]>(initialPrompts)
  const router = useRouter()
  const reactFlowInstanceRef = useRef<any>(null);
  const [contextTokens, setContextTokens] = useState(0)
  const [promptTokens, setPromptTokens] = useState(0)

  // When initialPrompts changes (from server), update our local state
  useEffect(() => {
    setPrompts(initialPrompts);
  }, [initialPrompts]);

  useEffect(() => {
    setContextTokens(estimateTokens(systemContext))
  }, [systemContext])

  useEffect(() => {
    setPromptTokens(estimateTokens(promptContent))
  }, [promptContent])

  const handleAddPrompt = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)

    try {
      if (!modelId) {
        toast.error("You must select a model for the prompt.");
        setIsLoading(false);
        return;
      }
      // Create the new prompt
      const result = await addChainPromptAction(
        assistantId,
        {
          name: promptName,
          content: promptContent,
          systemContext: systemContext || undefined,
          modelId: parseInt(modelId),
          position: typeof prompts.length === 'number' ? prompts.length : 0,
          inputMapping: inputMappings.length > 0 ? Object.fromEntries(
            inputMappings.map(mapping => [
              mapping.variableName,
              `${mapping.source}.${mapping.sourceId}`
            ])
          ) : undefined
        }
      )

      if (result.isSuccess) {
        toast.success("Prompt added successfully")
        setIsAddDialogOpen(false)
        setPromptName("")
        setPromptContent("")
        setSystemContext("")
        setModelId(null)
        setInputMappings([])
        
        // Get the updated prompts
        const updatedResult = await getAssistantArchitectByIdAction(assistantId);
        if (updatedResult.isSuccess && updatedResult.data?.prompts) {
          // Update our local state with the new prompts
          setPrompts(updatedResult.data.prompts as SelectChainPrompt[]);
          
          // Reset the initialPositionsSet flag to force a re-render of the graph
          if (reactFlowInstanceRef.current && reactFlowInstanceRef.current.initialPositionsSet) {
            reactFlowInstanceRef.current.initialPositionsSet = false;
          }
        }
      } else {
        toast.error(result.message)
      }
    } catch (error) {
      toast.error("Failed to add prompt")
      console.error(error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleAddInputMapping = useCallback(() => {
    setInputMappings(prev => [
      ...prev,
      { variableName: "", source: "input", sourceId: "" }
    ])
  }, [])

  const handleUpdateMapping = useCallback((index: number, field: keyof InputMapping, value: string) => {
    setInputMappings(prev => {
      const newMappings = [...prev]
      newMappings[index] = {
        ...newMappings[index],
        [field]: value
      }
      return newMappings
    })
  }, [])

  const handleRemoveMapping = useCallback((index: number) => {
    setInputMappings(prev => prev.filter((_, i) => i !== index))
  }, [])

  const handleEditPrompt = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingPrompt) return
    
    setIsLoading(true)

    try {
      if (!modelId) {
        toast.error("You must select a model for the prompt.");
        setIsLoading(false);
        return;
      }
      const result = await updatePromptAction(editingPrompt.id, {
        name: promptName,
        content: promptContent,
        systemContext: systemContext || undefined,
        modelId: parseInt(modelId),
        inputMapping: inputMappings.length > 0 ? Object.fromEntries(
          inputMappings.map(mapping => [
            mapping.variableName,
            `${mapping.source}.${mapping.sourceId}`
          ])
        ) : undefined
      })

      if (result.isSuccess) {
        toast.success("Prompt updated successfully")
        setIsEditDialogOpen(false)
        setEditingPrompt(null)
        
        // Update the prompts in our local state
        setPrompts(currentPrompts =>
          currentPrompts.map(p =>
            p.id === editingPrompt.id && result.data ? (result.data as SelectChainPrompt) : p
          )
        )
      } else {
        toast.error(result.message)
      }
    } catch (error) {
      toast.error("Failed to update prompt")
      console.error(error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleDeletePrompt = async (promptId: string) => {
    if (!window.confirm("Are you sure you want to delete this prompt?")) {
      return;
    }
    
    try {
      const result = await deletePromptAction(promptId)

      if (result.isSuccess) {
        toast.success("Prompt deleted successfully")
        
        // Remove the deleted prompt from our local state
        setPrompts(current => current.filter(p => p.id !== promptId))
        
        // Update the graph with the latest execution order
        if (reactFlowInstanceRef.current) {
          const graphInstance = reactFlowInstanceRef.current;
          setTimeout(() => {
            // Remove the node
            const updatedNodes = graphInstance.getNodes().filter((n: any) => n.id !== promptId);
            graphInstance.setNodes(updatedNodes);
            
            // Remove edges connected to this node
            const updatedEdges = graphInstance.getEdges().filter(
              (e: any) => e.source !== promptId && e.target !== promptId
            );
            graphInstance.setEdges(updatedEdges);
            
            // Save the new structure
            const savePositionsFunc = reactFlowInstanceRef.current?.savePositions;
            if (typeof savePositionsFunc === 'function') {
              setTimeout(savePositionsFunc, 100);
            }
          }, 100);
        }
      } else {
        toast.error(result.message)
      }
    } catch (error) {
      toast.error("Failed to delete prompt")
      console.error(error)
    }
  }

  const openEditDialog = async (prompt: SelectChainPrompt) => {
    setIsLoading(true)
    try {
      const result = await getAssistantArchitectByIdAction(assistantId)
      let latestPrompt = prompt
      if (result.isSuccess && result.data?.prompts) {
        const found = result.data.prompts.find((p: SelectChainPrompt) => p.id === prompt.id)
        if (found) latestPrompt = found
      }
      setEditingPrompt(latestPrompt)
      setPromptName(latestPrompt.name)
      setPromptContent(latestPrompt.content)
      setSystemContext(latestPrompt.systemContext || "")
      setModelId(latestPrompt.modelId ? latestPrompt.modelId.toString() : null)
      setInputMappings(
        latestPrompt.inputMapping
          ? Object.entries(latestPrompt.inputMapping).map(([variableName, mapping]) => {
              const [source, sourceId] = mapping.split('.')
              return {
                variableName,
                source: source as "input" | "prompt",
                sourceId
              }
            })
          : []
      )
      setIsEditDialogOpen(true)
    } catch (error) {
      toast.error("Failed to fetch latest prompt data")
      setIsEditDialogOpen(true)
    } finally {
      setIsLoading(false)
    }
  }

  const handleUpdatePositions = async (order: string[]) => {
    if (isUpdatingPositions) return
    setIsUpdatingPositions(true)

    try {
      // Get the current execution order from the graph
      let executionOrder = order;
      
      // If we have access to the reactFlowInstance through the ref, use that to calculate the order
      if (reactFlowInstanceRef.current) {
        executionOrder = reactFlowInstanceRef.current.calculateExecutionOrder() || order;
      }
      
      console.log('Updating execution order:', executionOrder);
      
      // Update each prompt's position
      const updatePromises = executionOrder.map((promptId, index) => 
        updatePromptPositionAction(promptId, index)
      );
      
      // Wait for all position updates to complete
      await Promise.all(updatePromises);

      toast.success("Execution order updated")
      
      // Update our local state with the new order
      setPrompts(current => {
        const updatedPrompts = [...current];
        executionOrder.forEach((id, index) => {
          const promptIndex = updatedPrompts.findIndex(p => p.id === id);
          if (promptIndex >= 0) {
            updatedPrompts[promptIndex] = {
              ...updatedPrompts[promptIndex],
              position: index
            };
          }
        });
        return updatedPrompts;
      });
    } catch (error) {
      console.error("Failed to update positions:", error)
      toast.error("Failed to update execution order")
    } finally {
      setIsUpdatingPositions(false)
    }
  }

  return (
    <div className="space-y-8">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
          </div>
        </div>
      </div>

      <div className="h-[600px] border rounded-lg">
        <ReactFlowProvider>
          <Flow
            assistantId={assistantId}
            prompts={prompts}
            models={models}
            onEdit={openEditDialog}
            onDelete={handleDeletePrompt}
            ref={reactFlowInstanceRef}
          />
        </ReactFlowProvider>
      </div>

      <Button onClick={() => {
        setPromptName("");
        setPromptContent("");
        setSystemContext("");
        setModelId("");
        setInputMappings([]);
        setIsAddDialogOpen(true);
      }}>
        <PlusIcon className="h-4 w-4 mr-2" />
        Add Prompt
      </Button>
      <Sheet open={isAddDialogOpen} onOpenChange={open => { if (!open) setIsAddDialogOpen(false) }}>
        <SheetContent
          position="right"
          size="content"
          className="w-[60vw] max-w-none h-screen p-0 flex flex-col"
          onInteractOutside={e => e.preventDefault()} // Prevent closing by clicking outside
          onEscapeKeyDown={e => e.preventDefault()} // Prevent closing by escape
        >
          <form onSubmit={handleAddPrompt} className="flex flex-col h-full">
            <SheetHeader className="p-6 pb-0">
              <SheetTitle>Add Prompt</SheetTitle>
              <SheetDescription>
                Create a new prompt for your Assistant Architect.
              </SheetDescription>
            </SheetHeader>
            <div className="flex-1 overflow-y-auto p-6 pt-2 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Prompt Name</Label>
                <Input
                  id="name"
                  value={promptName}
                  onChange={(e) => setPromptName(e.target.value)}
                  placeholder="Enter a prompt name"
                  required
                  className="bg-muted"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="model">AI Model</Label>
                <Select
                  value={modelId ?? ""}
                  onValueChange={(value) => setModelId(value)}
                  required
                >
                  <SelectTrigger className="bg-muted">
                    <SelectValue placeholder="Select an AI model" />
                  </SelectTrigger>
                  <SelectContent>
                    {models.map(model => (
                      <SelectItem key={model.id} value={model.id.toString()}>
                        {model.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label>Variable Mappings</Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleAddInputMapping}
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Add Mapping
                  </Button>
                </div>
                {inputMappings.map((mapping, index) => (
                  <div key={index} className="flex gap-2 items-start">
                    <div className="flex-1">
                      <Input
                        placeholder="Variable name (e.g. userInput)"
                        value={mapping.variableName}
                        onChange={(e) => handleUpdateMapping(index, "variableName", e.target.value)}
                        className="bg-muted mb-2"
                      />
                      <div className="flex gap-2">
                        <Select
                          value={mapping.source}
                          onValueChange={(value) => handleUpdateMapping(index, "source", value as "input" | "prompt")}
                        >
                          <SelectTrigger className="bg-muted flex-1">
                            <SelectValue placeholder="Select source" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="input">Input Field</SelectItem>
                            <SelectItem value="prompt">Previous Prompt</SelectItem>
                          </SelectContent>
                        </Select>
                        <Select
                          value={mapping.sourceId}
                          onValueChange={(value) => handleUpdateMapping(index, "sourceId", value)}
                        >
                          <SelectTrigger className="bg-muted flex-1">
                            <SelectValue placeholder="Select source" />
                          </SelectTrigger>
                          <SelectContent>
                            {mapping.source === "input" ? (
                              inputFields.map(field => (
                                <SelectItem key={field.id} value={field.id}>
                                  {field.name}
                                </SelectItem>
                              ))
                            ) : (
                              prompts.map(prompt => (
                                <SelectItem key={prompt.id} value={prompt.id}>
                                  {prompt.name}
                                </SelectItem>
                              ))
                            )}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => handleRemoveMapping(index)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                {inputMappings.length > 0 && (
                  <div className="text-sm text-muted-foreground mt-2">
                    Use these variables in your prompt with ${"{"}variableName{"}"}
                  </div>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="systemContext">System Context & Knowledge (Optional)</Label>
                <div className="rounded-md border bg-muted h-[320px] overflow-y-auto">
                  <MDXEditor
                    markdown={systemContext}
                    onChange={v => setSystemContext(v ?? "")}
                    className="min-h-full bg-[#e5e1d6]"
                    contentEditableClassName="prose"
                    placeholder="Enter system instructions, persona, or background knowledge for the AI model."
                    plugins={[
                      toolbarPlugin({
                        toolbarContents: () => (
                          <>
                            <UndoRedo />
                            <Separator />
                            <BoldItalicUnderlineToggles />
                            <Separator />
                            <BlockTypeSelect />
                            <Separator />
                            <ListsToggle />
                            <Separator />
                            <CreateLink />
                          </>
                        )
                      }),
                      markdownShortcutPlugin(),
                      listsPlugin(),
                      headingsPlugin(),
                      quotePlugin(),
                      thematicBreakPlugin(),
                      linkPlugin(),
                      linkDialogPlugin()
                    ]}
                  />
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  {contextTokens} tokens
                </div>
                <div className="text-xs text-muted-foreground mt-2">
                  You can reference the system context in your prompt content by saying things like "Given the above context" or "Knowing the persona of this community..."
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="content">Prompt Content</Label>
                <div className="rounded-md border bg-muted h-[320px] overflow-y-auto">
                  <MDXEditor
                    markdown={promptContent}
                    onChange={v => setPromptContent(v ?? "")}
                    className="min-h-full bg-[#e5e1d6]"
                    contentEditableClassName="prose"
                    placeholder="Enter your prompt content. Use ${variableName} for dynamic values."
                    plugins={[
                      toolbarPlugin({
                        toolbarContents: () => (
                          <>
                            <UndoRedo />
                            <Separator />
                            <BoldItalicUnderlineToggles />
                            <Separator />
                            <BlockTypeSelect />
                            <Separator />
                            <ListsToggle />
                            <Separator />
                            <CreateLink />
                          </>
                        )
                      }),
                      markdownShortcutPlugin(),
                      listsPlugin(),
                      headingsPlugin(),
                      quotePlugin(),
                      thematicBreakPlugin(),
                      linkPlugin(),
                      linkDialogPlugin()
                    ]}
                  />
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  {promptTokens} tokens
                </div>
              </div>
            </div>
            <SheetFooter className="p-6 pt-4 bg-[#f6f5ee] border-t flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsAddDialogOpen(false)}
                disabled={isLoading}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isLoading}>
                {isLoading ? "Adding..." : "Add Prompt"}
              </Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>

      {editingPrompt && (
        <Sheet open={isEditDialogOpen} onOpenChange={open => { if (!open) setIsEditDialogOpen(false) }}>
          <SheetContent
            position="right"
            size="content"
            className="w-[60vw] max-w-none h-screen p-0 flex flex-col"
            onInteractOutside={e => e.preventDefault()} // Prevent closing by clicking outside
            onEscapeKeyDown={e => e.preventDefault()} // Prevent closing by escape
          >
            <form onSubmit={handleEditPrompt} className="flex flex-col h-full">
              <SheetHeader className="p-6 pb-0">
                <SheetTitle>Edit Prompt</SheetTitle>
                <SheetDescription>Update the prompt configuration.</SheetDescription>
              </SheetHeader>
              <div className="flex-1 overflow-y-auto p-6 pt-2 space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-name">Prompt Name</Label>
                  <Input
                    id="edit-name"
                    value={promptName}
                    onChange={(e) => setPromptName(e.target.value)}
                    placeholder="Enter a prompt name"
                    required
                    className="bg-muted"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-model">AI Model</Label>
                  <Select
                    value={modelId ?? ""}
                    onValueChange={(value) => setModelId(value)}
                    required
                  >
                    <SelectTrigger className="bg-muted">
                      <SelectValue placeholder="Select an AI model" />
                    </SelectTrigger>
                    <SelectContent>
                      {models.map(model => (
                        <SelectItem key={model.id} value={model.id.toString()}>
                          {model.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <Label>Variable Mappings</Label>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleAddInputMapping}
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Add Mapping
                    </Button>
                  </div>
                  {inputMappings.map((mapping, index) => (
                    <div key={index} className="flex gap-2 items-start">
                      <div className="flex-1">
                        <Input
                          placeholder="Variable name (e.g. userInput)"
                          value={mapping.variableName}
                          onChange={(e) => handleUpdateMapping(index, "variableName", e.target.value)}
                          className="bg-muted mb-2"
                        />
                        <div className="flex gap-2">
                          <Select
                            value={mapping.source}
                            onValueChange={(value) => handleUpdateMapping(index, "source", value as "input" | "prompt")}
                          >
                            <SelectTrigger className="bg-muted flex-1">
                              <SelectValue placeholder="Select source" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="input">Input Field</SelectItem>
                              <SelectItem value="prompt">Previous Prompt</SelectItem>
                            </SelectContent>
                          </Select>
                          <Select
                            value={mapping.sourceId}
                            onValueChange={(value) => handleUpdateMapping(index, "sourceId", value)}
                          >
                            <SelectTrigger className="bg-muted flex-1">
                              <SelectValue placeholder="Select source" />
                            </SelectTrigger>
                            <SelectContent>
                              {mapping.source === "input" ? (
                                inputFields.map(field => (
                                  <SelectItem key={field.id} value={field.id}>
                                    {field.name}
                                  </SelectItem>
                                ))
                              ) : (
                                prompts
                                  .filter(p => p.position < (editingPrompt?.position || 0))
                                  .map(prompt => (
                                    <SelectItem key={prompt.id} value={prompt.id}>
                                      {prompt.name}
                                    </SelectItem>
                                  ))
                              )}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => handleRemoveMapping(index)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                  {inputMappings.length > 0 && (
                    <div className="text-sm text-muted-foreground mt-2">
                      Use these variables in your prompt with ${"{"}variableName{"}"}
                    </div>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-systemContext">System Context & Knowledge (Optional)</Label>
                  <div className="rounded-md border bg-muted h-[320px] overflow-y-auto">
                    <MDXEditor
                      markdown={systemContext}
                      onChange={v => setSystemContext(v ?? "")}
                      className="min-h-full bg-[#e5e1d6]"
                      contentEditableClassName="prose"
                      placeholder="Enter system instructions, persona, or background knowledge for the AI model."
                      plugins={[
                        toolbarPlugin({
                          toolbarContents: () => (
                            <>
                              <UndoRedo />
                              <Separator />
                              <BoldItalicUnderlineToggles />
                              <Separator />
                              <BlockTypeSelect />
                              <Separator />
                              <ListsToggle />
                              <Separator />
                              <CreateLink />
                            </>
                          )
                        }),
                        markdownShortcutPlugin(),
                        listsPlugin(),
                        headingsPlugin(),
                        quotePlugin(),
                        thematicBreakPlugin(),
                        linkPlugin(),
                        linkDialogPlugin()
                      ]}
                    />
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {contextTokens} tokens
                  </div>
                  <div className="text-xs text-muted-foreground mt-2">
                    You can reference the system context in your prompt content by saying things like "Given the above context" or "Knowing the persona of this community..."
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-content">Prompt Content</Label>
                  <div className="rounded-md border bg-muted h-[320px] overflow-y-auto">
                    <MDXEditor
                      markdown={promptContent}
                      onChange={v => setPromptContent(v ?? "")}
                      className="min-h-full bg-[#e5e1d6]"
                      contentEditableClassName="prose"
                      placeholder="Enter your prompt content. Use ${variableName} for dynamic values."
                      plugins={[
                        toolbarPlugin({
                          toolbarContents: () => (
                            <>
                              <UndoRedo />
                              <Separator />
                              <BoldItalicUnderlineToggles />
                              <Separator />
                              <BlockTypeSelect />
                              <Separator />
                              <ListsToggle />
                              <Separator />
                              <CreateLink />
                            </>
                          )
                        }),
                        markdownShortcutPlugin(),
                        listsPlugin(),
                        headingsPlugin(),
                        quotePlugin(),
                        thematicBreakPlugin(),
                        linkPlugin(),
                        linkDialogPlugin()
                      ]}
                    />
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {promptTokens} tokens
                  </div>
                </div>
              </div>
              <SheetFooter className="p-6 pt-4 bg-[#f6f5ee] border-t flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsEditDialogOpen(false)}
                  disabled={isLoading}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={isLoading} onClick={() => {}}>
                  {isLoading ? "Saving..." : "Save Changes"}
                </Button>
              </SheetFooter>
            </form>
          </SheetContent>
        </Sheet>
      )}
    </div>
  )
} 