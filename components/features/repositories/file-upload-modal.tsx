"use client"

import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useAction } from "@/lib/hooks/use-action"
import {
  addDocumentItem,
  addUrlItem,
  addTextItem,
} from "@/actions/repositories/repository-items.actions"
import { FileText, Link, Type, Upload, Loader2 } from "lucide-react"
import { useToast } from "@/components/ui/use-toast"

const MAX_FILE_SIZE = 25 * 1024 * 1024 // 25MB
const ACCEPTED_FILE_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain",
  "text/markdown",
  "text/csv",
]

const documentSchema = z.object({
  name: z.string().min(1, "Name is required"),
  file: z
    .custom<FileList>()
    .refine((files) => files?.length === 1, "File is required")
    .refine(
      (files) => files?.[0]?.size <= MAX_FILE_SIZE,
      `File size must be less than ${MAX_FILE_SIZE / 1024 / 1024}MB`
    )
    .refine(
      (files) => ACCEPTED_FILE_TYPES.includes(files?.[0]?.type),
      "File type not supported"
    ),
})

const urlSchema = z.object({
  name: z.string().min(1, "Name is required"),
  url: z.string().url("Must be a valid URL"),
})

const textSchema = z.object({
  name: z.string().min(1, "Name is required"),
  content: z.string().min(1, "Content is required"),
})

interface FileUploadModalProps {
  repositoryId: number
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
}

export function FileUploadModal({
  repositoryId,
  open,
  onOpenChange,
  onSuccess,
}: FileUploadModalProps) {
  const { toast } = useToast()
  const [activeTab, setActiveTab] = useState("document")

  const documentForm = useForm<z.infer<typeof documentSchema>>({
    resolver: zodResolver(documentSchema),
    defaultValues: {
      name: "",
    },
  })

  const urlForm = useForm<z.infer<typeof urlSchema>>({
    resolver: zodResolver(urlSchema),
    defaultValues: {
      name: "",
      url: "",
    },
  })

  const textForm = useForm<z.infer<typeof textSchema>>({
    resolver: zodResolver(textSchema),
    defaultValues: {
      name: "",
      content: "",
    },
  })

  const { execute: executeAddDocument, isPending: isAddingDocument } =
    useAction(addDocumentItem)
  const { execute: executeAddUrl, isPending: isAddingUrl } = useAction(addUrlItem)
  const { execute: executeAddText, isPending: isAddingText } = useAction(addTextItem)

  const isLoading = isAddingDocument || isAddingUrl || isAddingText

  async function onDocumentSubmit(data: z.infer<typeof documentSchema>) {
    const file = data.file[0]
    const buffer = await file.arrayBuffer()

    const result = await executeAddDocument({
      repository_id: repositoryId,
      name: data.name,
      file: {
        content: Buffer.from(buffer),
        contentType: file.type,
        size: file.size,
      },
    })

    if (result.isSuccess) {
      toast({
        title: "Document uploaded",
        description: "The document has been added to the repository.",
      })
      documentForm.reset()
      onSuccess()
      onOpenChange(false)
    } else {
      toast({
        title: "Error",
        description: result.message || "Failed to upload document",
        variant: "destructive",
      })
    }
  }

  async function onUrlSubmit(data: z.infer<typeof urlSchema>) {
    const result = await executeAddUrl({
      repository_id: repositoryId,
      name: data.name,
      url: data.url,
    })

    if (result.isSuccess) {
      toast({
        title: "URL added",
        description: "The URL has been added to the repository.",
      })
      urlForm.reset()
      onSuccess()
      onOpenChange(false)
    } else {
      toast({
        title: "Error",
        description: result.message || "Failed to add URL",
        variant: "destructive",
      })
    }
  }

  async function onTextSubmit(data: z.infer<typeof textSchema>) {
    const result = await executeAddText({
      repository_id: repositoryId,
      name: data.name,
      content: data.content,
    })

    if (result.isSuccess) {
      toast({
        title: "Text added",
        description: "The text has been added to the repository.",
      })
      textForm.reset()
      onSuccess()
      onOpenChange(false)
    } else {
      toast({
        title: "Error",
        description: result.message || "Failed to add text",
        variant: "destructive",
      })
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Add Item to Repository</DialogTitle>
          <DialogDescription>
            Add documents, URLs, or text content to your knowledge repository.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="document">
              <FileText className="mr-2 h-4 w-4" />
              Document
            </TabsTrigger>
            <TabsTrigger value="url">
              <Link className="mr-2 h-4 w-4" />
              URL
            </TabsTrigger>
            <TabsTrigger value="text">
              <Type className="mr-2 h-4 w-4" />
              Text
            </TabsTrigger>
          </TabsList>

          <TabsContent value="document">
            <Form {...documentForm}>
              <form
                onSubmit={documentForm.handleSubmit(onDocumentSubmit)}
                className="space-y-4"
              >
                <FormField
                  control={documentForm.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Name</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="e.g., User Manual" />
                      </FormControl>
                      <FormDescription>
                        A descriptive name for the document
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={documentForm.control}
                  name="file"
                  render={({ field: { onChange, value, ...field } }) => (
                    <FormItem>
                      <FormLabel>File</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          type="file"
                          accept=".pdf,.docx,.xlsx,.pptx,.txt,.md,.csv"
                          onChange={(e) => onChange(e.target.files)}
                        />
                      </FormControl>
                      <FormDescription>
                        Supported: PDF, Word, Excel, PowerPoint, Text, Markdown,
                        CSV (max 25MB)
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => onOpenChange(false)}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" disabled={isLoading}>
                    {isAddingDocument && (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    )}
                    <Upload className="mr-2 h-4 w-4" />
                    Upload Document
                  </Button>
                </div>
              </form>
            </Form>
          </TabsContent>

          <TabsContent value="url">
            <Form {...urlForm}>
              <form
                onSubmit={urlForm.handleSubmit(onUrlSubmit)}
                className="space-y-4"
              >
                <FormField
                  control={urlForm.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Name</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          placeholder="e.g., API Documentation"
                        />
                      </FormControl>
                      <FormDescription>
                        A descriptive name for the URL content
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={urlForm.control}
                  name="url"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>URL</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          type="url"
                          placeholder="https://example.com/docs"
                        />
                      </FormControl>
                      <FormDescription>
                        The URL to fetch content from
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => onOpenChange(false)}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" disabled={isLoading}>
                    {isAddingUrl && (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    )}
                    Add URL
                  </Button>
                </div>
              </form>
            </Form>
          </TabsContent>

          <TabsContent value="text">
            <Form {...textForm}>
              <form
                onSubmit={textForm.handleSubmit(onTextSubmit)}
                className="space-y-4"
              >
                <FormField
                  control={textForm.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Name</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="e.g., Quick Reference" />
                      </FormControl>
                      <FormDescription>
                        A descriptive name for the text content
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={textForm.control}
                  name="content"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Content</FormLabel>
                      <FormControl>
                        <Textarea
                          {...field}
                          placeholder="Enter your text content here..."
                          rows={6}
                        />
                      </FormControl>
                      <FormDescription>
                        The text content to add to the repository
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => onOpenChange(false)}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" disabled={isLoading}>
                    {isAddingText && (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    )}
                    Add Text
                  </Button>
                </div>
              </form>
            </Form>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}