"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { 
  MoreHorizontal, 
  Edit, 
  Trash, 
  Eye, 
  EyeOff, 
  Copy,
  TestTube 
} from "lucide-react"
import { useToast } from "@/components/ui/use-toast"
import type { Setting } from "@/actions/db/settings-actions"
import { getSettingActualValueAction } from "@/actions/db/settings-actions"

interface SettingsTableProps {
  settings: Setting[]
  onEdit: (setting: Setting) => void
  onDelete: (key: string) => void
}

export function SettingsTable({ settings, onEdit, onDelete }: SettingsTableProps) {
  const [visibleValues, setVisibleValues] = useState<Set<string>>(new Set())
  const [actualValues, setActualValues] = useState<Record<string, string>>({})
  const [loadingValues, setLoadingValues] = useState<Set<string>>(new Set())
  const [deleteKey, setDeleteKey] = useState<string | null>(null)
  const { toast } = useToast()

  const toggleValueVisibility = async (key: string) => {
    const newVisible = new Set(visibleValues)
    if (newVisible.has(key)) {
      // Hide the value
      newVisible.delete(key)
      setVisibleValues(newVisible)
    } else {
      // Show the value - fetch it if it's a secret and we don't have it yet
      const setting = settings.find(s => s.key === key)
      if (setting?.isSecret && !actualValues[key]) {
        // Fetch the actual value
        const newLoading = new Set(loadingValues)
        newLoading.add(key)
        setLoadingValues(newLoading)
        
        try {
          const result = await getSettingActualValueAction(key)
          if (result.isSuccess && result.data) {
            setActualValues(prev => ({ ...prev, [key]: result.data }))
          }
        } catch {
          toast({
            title: "Error",
            description: "Failed to fetch value",
            variant: "destructive"
          })
        } finally {
          const newLoading = new Set(loadingValues)
          newLoading.delete(key)
          setLoadingValues(newLoading)
        }
      }
      
      newVisible.add(key)
      setVisibleValues(newVisible)
    }
  }

  const copyToClipboard = async (setting: Setting) => {
    try {
      let valueToCopy = setting.value || ''
      
      // If it's a secret with a value, fetch the actual value
      if (setting.isSecret && setting.hasValue) {
        const result = await getSettingActualValueAction(setting.key)
        if (result.isSuccess && result.data) {
          valueToCopy = result.data
        }
      }
      
      await navigator.clipboard.writeText(valueToCopy)
      toast({
        title: "Copied",
        description: "Value copied to clipboard"
      })
    } catch {
      toast({
        title: "Error",
        description: "Failed to copy value",
        variant: "destructive"
      })
    }
  }

  const testConnection = async (key: string) => {
    try {
      const response = await fetch('/api/admin/settings/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key })
      })

      const result = await response.json()
      if (result.isSuccess) {
        toast({
          title: "Success",
          description: result.message || "Connection test passed"
        })
      } else {
        throw new Error(result.message)
      }
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Connection test failed",
        variant: "destructive"
      })
    }
  }

  if (settings.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        No settings found in this category
      </div>
    )
  }

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Key</TableHead>
            <TableHead>Value</TableHead>
            <TableHead>Description</TableHead>
            <TableHead className="w-[100px]">Type</TableHead>
            <TableHead className="w-[50px]"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {settings.map((setting) => {
            const isVisible = visibleValues.has(setting.key)
            const hasValue = setting.hasValue || (setting.value && setting.value !== '••••••••')
            
            return (
              <TableRow key={setting.key}>
                <TableCell className="font-mono text-sm">
                  {setting.key}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    {setting.isSecret && hasValue ? (
                      <div className="flex items-center gap-2 flex-1">
                        <Input
                          type={isVisible ? "text" : "password"}
                          value={isVisible ? (actualValues[setting.key] || setting.value || '') : '••••••••'}
                          readOnly
                          className="max-w-xs font-mono text-sm"
                        />
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => toggleValueVisibility(setting.key)}
                          disabled={loadingValues.has(setting.key)}
                        >
                          {loadingValues.has(setting.key) ? (
                            <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                          ) : isVisible ? (
                            <EyeOff className="h-4 w-4" />
                          ) : (
                            <Eye className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                    ) : (
                      <span className={`${hasValue ? 'font-mono text-sm' : 'text-muted-foreground'}`}>
                        {hasValue ? setting.value : 'Not set'}
                      </span>
                    )}
                    {hasValue && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => copyToClipboard(setting)}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {setting.description}
                </TableCell>
                <TableCell>
                  {setting.isSecret ? (
                    <Badge variant="secondary">Secret</Badge>
                  ) : (
                    <Badge variant="outline">Public</Badge>
                  )}
                </TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => onEdit(setting)}>
                        <Edit className="h-4 w-4 mr-2" />
                        Edit
                      </DropdownMenuItem>
                      {hasValue && canTestConnection(setting.key) && (
                        <DropdownMenuItem onClick={() => testConnection(setting.key)}>
                          <TestTube className="h-4 w-4 mr-2" />
                          Test Connection
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem
                        className="text-destructive"
                        onClick={() => setDeleteKey(setting.key)}
                      >
                        <Trash className="h-4 w-4 mr-2" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>

      <AlertDialog open={!!deleteKey} onOpenChange={() => setDeleteKey(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Setting</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete the setting &quot;{deleteKey}&quot;? This action cannot be undone.
              The application will fall back to environment variables if available.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleteKey) {
                  onDelete(deleteKey)
                  setDeleteKey(null)
                }
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

function canTestConnection(key: string): boolean {
  const testableKeys = [
    'AZURE_OPENAI_KEY',
    'GOOGLE_API_KEY',
    'OPENAI_API_KEY',
    'S3_BUCKET',
    'GITHUB_ISSUE_TOKEN'
  ]
  return testableKeys.includes(key)
}