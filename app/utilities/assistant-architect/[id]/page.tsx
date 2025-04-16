"use client"

import { useRouter } from "next/navigation"
import { getAssistantArchitectAction, deleteInputFieldAction, deletePromptAction, submitAssistantArchitectForApprovalAction } from "@/actions/db/assistant-architect-actions"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Separator } from "@/components/ui/separator"
import { AlertCircle, CheckCircle, Clock, XCircle } from "lucide-react"
import { useEffect, useState } from "react"
import { toast } from "@/components/ui/use-toast"
import { useParams } from "next/navigation"
import { Button } from "@/components/ui/button"

// Tool statuses and their display info
type ToolStatus = 'draft' | 'pending_approval' | 'approved' | 'rejected';

// Tool interface
interface Tool {
  id: string;
  name: string;
  description: string | null;
  identifier?: string;
  userId?: string;
  creatorId: string;
  status: ToolStatus;
  createdAt: string | Date;
  updatedAt: string | Date;
  promptChain?: any; // Adjust this to proper type if needed
  inputFields?: any[]; // Adjust this to proper type if needed
  isActive?: boolean;
  isParallel: boolean;
  [key: string]: any; // For any other properties
}

const statusInfo = {
  draft: {
    icon: <AlertCircle className="h-4 w-4 mr-2" />,
    text: "Draft - Not yet submitted for approval.",
    color: "text-yellow-600"
  },
  pending_approval: {
    icon: <Clock className="h-4 w-4 mr-2" />,
    text: "Pending Approval - Submitted, awaiting review.",
    color: "text-blue-600"
  },
  approved: {
    icon: <CheckCircle className="h-4 w-4 mr-2" />,
    text: "Approved - This tool is available for use.",
    color: "text-green-600"
  },
  rejected: {
    icon: <XCircle className="h-4 w-4 mr-2" />,
    text: "Rejected - Needs revision before resubmission.",
    color: "text-red-600"
  }
};

interface AssistantArchitectPageProps {
  params: { id: string }
}

export default function AssistantArchitectPage({ params }: AssistantArchitectPageProps) {
  // Use the useParams hook to safely get the ID
  const routeParams = useParams<{ id: string }>();
  const id = routeParams.id as string;
  
  const router = useRouter();
  const [tool, setTool] = useState<Tool | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [canEditContent, setCanEditContent] = useState(false);
  const [showSubmitButton, setShowSubmitButton] = useState(false);
  const [showEditButton, setShowEditButton] = useState(false);
  const [currentStatus, setCurrentStatus] = useState<typeof statusInfo[ToolStatus] | null>(null);

  // Handle delete input field
  const handleDeleteInputField = async (fieldId: string) => {
    if (!confirm("Are you sure you want to delete this input field? This action cannot be undone.")) {
      return;
    }
    
    try {
      const result = await deleteInputFieldAction(fieldId);
      
      if (result.isSuccess) {
        toast({
          title: "Success",
          description: "Input field deleted successfully"
        });
        
        // Refresh the data
        fetchData();
      } else {
        toast({
          title: "Error",
          description: result.message,
          variant: "destructive"
        });
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to delete input field";
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive"
      });
    }
  };
  
  // Handle delete prompt
  const handleDeletePrompt = async (promptId: string) => {
    if (!confirm("Are you sure you want to delete this prompt? This action cannot be undone.")) {
      return;
    }
    
    try {
      const result = await deletePromptAction(promptId);
      
      if (result.isSuccess) {
        toast({
          title: "Success",
          description: "Prompt deleted successfully"
        });
        
        // Refresh the data
        fetchData();
      } else {
        toast({
          title: "Error",
          description: result.message,
          variant: "destructive"
        });
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to delete prompt";
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive"
      });
    }
  };

  // Add handler for submitting for approval
  const handleSubmitForApproval = async () => {
    try {
      const result = await submitAssistantArchitectForApprovalAction(id);
      
      if (result.isSuccess) {
        toast({
          title: "Success",
          description: "Tool submitted for approval successfully"
        });
        
        // Refresh the data
        fetchData();
      } else {
        toast({
          title: "Error",
          description: result.message,
          variant: "destructive"
        });
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to submit tool for approval";
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive"
      });
    }
  };

  const fetchData = async () => {
    try {
      setIsLoading(true);
      
      // Get the tool data
      const result = await getAssistantArchitectAction(id);
      
      if (!result.isSuccess) {
        setError("Failed to load tool data");
        return;
      }
      
      // Cast the result data to Tool type
      setTool(result.data as unknown as Tool);
      setCurrentStatus(statusInfo[result.data.status as ToolStatus]);
      
      // Check user permissions
      const isCreator = userId === result.data.creatorId;
      const isDraft = result.data.status === "draft";
      const isRejected = result.data.status === "rejected";
      
      // FORCE BUTTONS TO SHOW
      setShowSubmitButton(true);
      setShowEditButton(true);
      setCanEditContent(true);
      
    } catch (err) {
      setError("An error occurred while loading data");
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const checkAuth = async () => {
      try {
        // Use fetch to get the user ID since we're in a client component
        const response = await fetch('/api/auth/me');
        const data = await response.json();
        
        if (!response.ok || !data.userId) {
          router.push('/sign-in');
          return;
        }
        
        setUserId(data.userId);
        
        // Check tool access
        const accessResponse = await fetch(`/api/debug/tool-access?toolId=assistant-architect`);
        const accessData = await accessResponse.json();
        
        if (!accessResponse.ok || !accessData.hasAccess) {
          router.push('/dashboard');
          return;
        }
        
        // Fetch tool data if user has access
        fetchData();
        
      } catch (err) {
        console.error('Auth check failed:', err);
        router.push('/sign-in');
      }
    };
    
    checkAuth();
  }, [id, router]);

  if (isLoading) {
    return <div className="container py-8">Loading...</div>;
  }
  
  if (error || !tool) {
    return (
      <div className="container py-8">
        <div className="p-4 bg-red-50 text-red-600 rounded-md">
          {error || "Failed to load tool data"}
        </div>
      </div>
    );
  }

  return (
    <div className="container py-8 space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">{tool.name}</h1>
        <div className="flex items-center space-x-2">
          {showEditButton && (
            <Button 
              onClick={() => router.push(`/utilities/assistant-architect/${id}/edit`)}
              className="bg-primary text-primary-foreground shadow hover:bg-primary/90"
            >
              Edit Tool
            </Button>
          )}
          {showSubmitButton && (
            <Button 
              onClick={handleSubmitForApproval}
              className="bg-primary text-primary-foreground shadow hover:bg-primary/90"
            >
              Submit for Approval
            </Button>
          )}
        </div>
      </div>
      <CardDescription>{tool.description || "No description provided."}</CardDescription>

      <div className={`flex items-center p-3 rounded-md bg-muted/50 ${currentStatus?.color}`}>
         {currentStatus?.icon}
         <span className="text-sm font-medium">{currentStatus?.text}</span>
      </div>

      <Separator />

      <Tabs defaultValue="inputFields" className="space-y-4">
        <TabsList>
          <TabsTrigger value="inputFields">Input Fields</TabsTrigger>
          <TabsTrigger value="prompts">Prompts</TabsTrigger>
        </TabsList>
               
        <TabsContent value="inputFields">
          <Card>
             <CardHeader>
                <CardTitle>Input Fields</CardTitle>
                <CardDescription>Define the inputs users will provide when running this Assistant Architect.</CardDescription>
             </CardHeader>
             <CardContent>
                <div className="space-y-4">
                  {tool.inputFields && tool.inputFields.length > 0 ? (
                    <div className="grid gap-4">
                      {[...tool.inputFields].sort((a, b) => a.position - b.position).map((field) => (
                        <div key={field.id} className="border rounded-md p-4">
                          <div className="font-medium">{field.name}</div>
                          <div className="text-sm text-muted-foreground">Type: {field.fieldType}</div>
                          {canEditContent && (
                            <div className="mt-2 flex gap-2">
                              <a href={`/utilities/assistant-architect/${id}/edit-input-field/${field.id}`} className="text-sm text-blue-600 hover:underline">Edit</a>
                              <button 
                                className="text-sm text-red-600 hover:underline"
                                onClick={() => handleDeleteInputField(field.id)}
                              >
                                Delete
                              </button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-6 text-muted-foreground">
                      No input fields defined yet.
                    </div>
                  )}
                  
                  {canEditContent && (
                    <div className="mt-4">
                      <a href={`/utilities/assistant-architect/${id}/add-input-field`} className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 bg-secondary text-secondary-foreground hover:bg-secondary/80 h-9 px-4 py-2">
                        Add Input Field
                      </a>
                    </div>
                  )}
                </div>
             </CardContent>
           </Card>
        </TabsContent>
        
        <TabsContent value="prompts">
           <Card>
             <CardHeader>
                <CardTitle>Prompts</CardTitle>
                <CardDescription>Configure the sequence of prompts and their settings.</CardDescription>
             </CardHeader>
             <CardContent>
                <div className="space-y-4">
                  {tool.prompts && tool.prompts.length > 0 ? (
                    <div className="grid gap-4">
                      {[...tool.prompts].sort((a, b) => a.position - b.position).map((prompt) => (
                        <div key={prompt.id} className="border rounded-md p-4">
                          <div className="font-medium">{prompt.name}</div>
                          <div className="text-sm text-muted-foreground">Position: {prompt.position + 1}</div>
                          {canEditContent && (
                            <div className="mt-2 flex gap-2">
                              <a href={`/utilities/assistant-architect/${id}/edit-prompt/${prompt.id}`} className="text-sm text-blue-600 hover:underline">Edit</a>
                              <button 
                                className="text-sm text-red-600 hover:underline"
                                onClick={() => handleDeletePrompt(prompt.id)}
                              >
                                Delete
                              </button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-6 text-muted-foreground">
                      No prompts defined yet.
                    </div>
                  )}
                  
                  {canEditContent && (
                    <div className="mt-4">
                      <a href={`/utilities/assistant-architect/${id}/add-prompt`} className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 bg-secondary text-secondary-foreground hover:bg-secondary/80 h-9 px-4 py-2">
                        Add Prompt
                      </a>
                    </div>
                  )}
                </div>
             </CardContent>
            </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
} 