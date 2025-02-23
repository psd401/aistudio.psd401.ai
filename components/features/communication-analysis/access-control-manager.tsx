"use client"

import { useState } from "react"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { SelectCommunicationSettings } from "@/types"
import { toast } from "sonner"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

interface AccessControlManagerProps {
  initialSettings: SelectCommunicationSettings
}

export function AccessControlManager({ initialSettings }: AccessControlManagerProps) {
  const [settings, setSettings] = useState<SelectCommunicationSettings>(initialSettings)
  const [isUpdating, setIsUpdating] = useState(false)

  const handleRoleChange = async (newRole: string) => {
    setIsUpdating(true)
    try {
      const response = await fetch("/api/communication-analysis/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          minimumRole: newRole
        })
      })
      const result = await response.json()
      
      if (result.isSuccess) {
        setSettings({ ...settings, minimumRole: newRole as "administrator" | "staff" | "student" })
        toast.success("Access level updated successfully")
      } else {
        toast.error(result.message)
      }
    } catch (error) {
      toast.error("Failed to update access level")
    } finally {
      setIsUpdating(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Access Control</CardTitle>
        <CardDescription>
          Set the minimum role required to access the Communication Analysis tool
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-4">
          <span className="text-sm font-medium">Minimum Role Required:</span>
          <Select
            value={settings.minimumRole}
            onValueChange={handleRoleChange}
            disabled={isUpdating}
          >
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Select minimum role" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="administrator">Administrator</SelectItem>
              <SelectItem value="staff">Staff</SelectItem>
              <SelectItem value="student">Student</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardContent>
    </Card>
  )
} 