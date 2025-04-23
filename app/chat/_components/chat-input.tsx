"use client"

import { useRef, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { IconSend } from "@tabler/icons-react"
import type { FormEvent } from "react"

interface ChatInputProps {
  input: string
  handleInputChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void
  handleSubmit: (e: FormEvent<HTMLFormElement>) => void
  isLoading: boolean
  disabled?: boolean
}

export function ChatInput({
  input,
  handleInputChange,
  handleSubmit,
  isLoading,
  disabled
}: ChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "0px"
      const scrollHeight = textareaRef.current.scrollHeight
      textareaRef.current.style.height = scrollHeight + "px"
    }
  }, [input])

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!input.trim() || isLoading || disabled) return
    handleSubmit(e)
    if (textareaRef.current) {
      textareaRef.current.style.height = "48px"
    }
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !isLoading) {
      e.preventDefault()
      const form = e.currentTarget.form
      if (form && input.trim()) {
        onSubmit(new SubmitEvent("submit", { bubbles: true, cancelable: true, submitter: form }) as unknown as FormEvent<HTMLFormElement>);
      }
    }
  }

  return (
    <form onSubmit={onSubmit} className="relative w-full">
      <Textarea
        ref={textareaRef}
        tabIndex={0}
        rows={1}
        value={input}
        onChange={handleInputChange}
        onKeyDown={onKeyDown}
        placeholder="Message..."
        spellCheck={false}
        className="min-h-[48px] w-full resize-none bg-background pl-4 pr-14 py-3 border border-border rounded-xl shadow-sm focus-visible:ring-1 focus-visible:ring-primary focus-visible:ring-offset-0 focus-visible:border-primary"
        disabled={disabled || isLoading}
        style={{ maxHeight: "200px", overflowY: "auto" }}
      />
      <Button
        type="submit"
        size="icon"
        variant="default"
        disabled={input.trim().length === 0 || isLoading || disabled}
        className="absolute bottom-2.5 right-3 h-8 w-8 rounded-lg bg-primary hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:bg-muted"
        aria-label="Send message"
      >
        <IconSend className="h-4 w-4" />
      </Button>
    </form>
  )
} 