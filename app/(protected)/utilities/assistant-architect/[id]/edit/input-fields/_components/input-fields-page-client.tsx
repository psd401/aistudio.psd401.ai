"use client"

import { useState } from "react"
import { InputFieldsForm } from "./input-fields-form"
import { InputFieldList } from "./input-field-list"
import type { SelectToolInputField } from "@/types"
import { CardHeader, CardTitle } from "@/components/ui/card"

interface InputFieldsPageClientProps {
  assistantId: string
  inputFields: SelectToolInputField[]
}

export function InputFieldsPageClient({ assistantId, inputFields }: InputFieldsPageClientProps) {
  const [editingField, setEditingField] = useState<SelectToolInputField | null>(null)

  function handleEdit(field: SelectToolInputField) {
    setEditingField(field)
    // Scroll to form
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function clearEditingField() {
    setEditingField(null)
  }

  return (
    <>
      <div className="bg-white rounded-lg p-6 border">
        {editingField && (
          <div className="mb-4 pb-4 border-b flex justify-between items-center">
            <h3 className="font-medium">Editing field: {editingField.label || editingField.name}</h3>
            <button 
              onClick={clearEditingField}
              className="text-sm text-blue-600 hover:text-blue-800"
            >
              Cancel Editing
            </button>
          </div>
        )}
        <InputFieldsForm 
          assistantId={assistantId} 
          inputFields={inputFields} 
          editingField={editingField}
          clearEditingField={clearEditingField}
        />
      </div>

      {inputFields.length > 0 && (
        <div className="border-t pt-6">
          <CardHeader className="px-0 pt-0">
            <CardTitle>Current Input Fields</CardTitle>
          </CardHeader>
          <div className="mt-2">
            <InputFieldList 
              inputFields={inputFields} 
              onEdit={handleEdit}
            />
          </div>
        </div>
      )}
    </>
  )
} 