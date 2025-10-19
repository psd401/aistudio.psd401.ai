"use client"

import { useRef, useEffect } from "react"
import type { FormEvent } from "react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { IconSend } from "@tabler/icons-react"

interface SimpleChatInputProps {
  input: string
  handleInputChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void
  handleSubmit: (e: FormEvent<HTMLFormElement>) => void
  isLoading: boolean
  disabled?: boolean
  placeholder?: string
}

/**
 * Simple chat input for components not yet using assistant-ui runtime
 * For new features, prefer using assistant-ui's ComposerPrimitive instead
 */
export function SimpleChatInput({
  input,
  handleInputChange,
  handleSubmit,
  isLoading,
  disabled,
  placeholder = "Type your message..."
}: SimpleChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto"
      const scrollHeight = textareaRef.current.scrollHeight
      const finalHeight = Math.min(Math.max(scrollHeight, 48), 200)
      textareaRef.current.style.height = `${finalHeight}px`
    }
  }, [input])

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !isLoading) {
      e.preventDefault()
      const syntheticEvent = {
        preventDefault: () => {},
        currentTarget: { reset: () => {} }
      } as FormEvent<HTMLFormElement>
      handleSubmit(syntheticEvent)
    }
  }

  return (
    <div className="relative w-full">
      <Textarea
        ref={textareaRef}
        value={input}
        onChange={handleInputChange}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        disabled={disabled || isLoading}
        className="min-h-[48px] w-full resize-none bg-background py-3 pl-4 pr-14 border border-border rounded-xl"
        style={{ maxHeight: "200px", overflowY: "auto" }}
      />
      <Button
        type="submit"
        size="icon"
        disabled={disabled || isLoading || !input.trim()}
        onClick={() => {
          const syntheticEvent = {
            preventDefault: () => {},
            currentTarget: { reset: () => {} }
          } as FormEvent<HTMLFormElement>
          handleSubmit(syntheticEvent)
        }}
        className="absolute right-2 top-1/2 -translate-y-1/2 h-10 w-10"
      >
        <IconSend className="h-4 w-4" />
      </Button>
    </div>
  )
}
