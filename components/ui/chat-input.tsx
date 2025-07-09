"use client"

import { useRef, useEffect } from "react"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { Send } from "lucide-react"

interface ChatInputProps {
  input: string
  handleInputChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void
  handleSubmit: (e: React.FormEvent) => void
  isLoading: boolean
  disabled?: boolean
  placeholder?: string
  /** Accessibility label for the input field */
  ariaLabel?: string
  /** ID for the textarea element */
  inputId?: string
  /** Accessibility label for the send button */
  sendButtonAriaLabel?: string
}

export function ChatInput({
  input,
  handleInputChange,
  handleSubmit,
  isLoading,
  disabled = false,
  placeholder = "Type a message...",
  ariaLabel = "Message input",
  inputId = "chat-message-input",
  sendButtonAriaLabel = "Send message"
}: ChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "inherit"
      const scrollHeight = textareaRef.current.scrollHeight
      textareaRef.current.style.height = `${scrollHeight}px`
    }
  }, [input])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSubmit(e)
    }
  }

  const onFormSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    e.stopPropagation()
    handleSubmit(e)
  }

  return (
    <form onSubmit={onFormSubmit} className="relative flex-1">
      <Textarea
        ref={textareaRef}
        id={inputId}
        name="message"
        value={input}
        onChange={handleInputChange}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled || isLoading}
        className="min-h-[44px] w-full resize-none bg-background px-4 py-2.5 pr-12"
        rows={1}
        aria-label={ariaLabel}
        aria-disabled={disabled || isLoading}
        aria-multiline="true"
        aria-required="true"
      />
      <Button
        type="submit"
        size="icon"
        disabled={disabled || isLoading || !input.trim()}
        className="absolute right-2 top-1.5 h-8 w-8"
        aria-label={sendButtonAriaLabel}
        aria-disabled={disabled || isLoading || !input.trim()}
      >
        <Send className="h-4 w-4" />
        <span className="sr-only">{sendButtonAriaLabel}</span>
      </Button>
    </form>
  )
} 