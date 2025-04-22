"use client"

import { useState } from "react"
import { InputFieldsForm } from "./input-fields-form"
import type { SelectToolInputField } from "@/types"
import { Button } from "@/components/ui/button"

interface InputFieldFormWrapperProps {
  assistantId: string
  inputFields: SelectToolInputField[]
}

export function InputFieldFormWrapper({ assistantId, inputFields }: InputFieldFormWrapperProps) {
  const [editingField, setEditingField] = useState<SelectToolInputField | null>(null)
  const isEditing = !!editingField

  function clearEditingField() {
    setEditingField(null)
  }

  return (
    <div>
      {isEditing && (
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-medium">Editing field: {editingField.name}</h3>
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={clearEditingField}
          >
            Cancel Editing
          </Button>
        </div>
      )}
      <InputFieldsForm 
        assistantId={assistantId} 
        inputFields={inputFields} 
        editingField={editingField}
        clearEditingField={clearEditingField}
      />
    </div>
  )
} 