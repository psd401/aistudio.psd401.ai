"use client"

import { useRef, useEffect, useCallback } from "react"
import type { FormEvent } from "react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { IconSend } from "@tabler/icons-react"
import { PaperclipIcon } from "lucide-react"

interface ChatInputProps {
  input: string
  handleInputChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void
  handleSubmit: (e: FormEvent<HTMLFormElement>) => void
  isLoading: boolean
  disabled?: boolean
  onAttachClick?: () => void
  showAttachButton?: boolean
  /** Placeholder text for the input field */
  placeholder?: string
  /** Accessibility label for the input field */
  ariaLabel?: string
  /** ID for the textarea element */
  inputId?: string
  /** Accessibility label for the send button */
  sendButtonAriaLabel?: string
  /** Accessibility label for the attach button */
  attachButtonAriaLabel?: string
}

export function ChatInput({
  input,
  handleInputChange,
  handleSubmit,
  isLoading,
  disabled,
  onAttachClick,
  showAttachButton = false,
  placeholder = "Type your message...",
  ariaLabel = "Message input",
  inputId = "chat-message-input",
  sendButtonAriaLabel = "Send message",
  attachButtonAriaLabel = "Attach document"
}: ChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (textareaRef.current) {
      // Reset height to get accurate scrollHeight
      textareaRef.current.style.height = "auto"
      const scrollHeight = textareaRef.current.scrollHeight
      const maxHeight = 200
      const minHeight = 48
      
      // Calculate the final height
      const finalHeight = Math.min(Math.max(scrollHeight, minHeight), maxHeight)
      textareaRef.current.style.height = `${finalHeight}px`
    }
  }, [input])

  const submitMessage = useCallback(() => {
    if (input.trim() && !disabled && !isLoading) {
      const syntheticEvent = {
        preventDefault: () => {},
        currentTarget: { reset: () => {} }
      } as FormEvent<HTMLFormElement>
      handleSubmit(syntheticEvent)
      // Don't reset height here - let the input change effect handle it naturally
    }
  }, [input, disabled, isLoading, handleSubmit])

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !isLoading) {
      e.preventDefault()
      submitMessage()
    }
  }

  return (
    <div className="relative w-full" aria-label="Chat message form">
      <Textarea
        ref={textareaRef}
        id={inputId}
        name="message"
        tabIndex={0}
        rows={1}
        value={input}
        onChange={handleInputChange}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        spellCheck={false}
        className={`min-h-[48px] w-full resize-none bg-background py-3 border border-border rounded-xl shadow-sm focus-visible:ring-1 focus-visible:ring-primary focus-visible:ring-offset-0 focus-visible:border-primary ${showAttachButton ? 'pl-12 pr-14' : 'pl-4 pr-14'}`}
        disabled={disabled || isLoading}
        style={{ maxHeight: "200px", overflowY: "auto" }}
        aria-label={ariaLabel}
        aria-disabled={disabled || isLoading}
        aria-multiline="true"
        aria-required="true"
      />
      
      {showAttachButton && (
        <Button
          type="button"
          size="icon"
          variant="ghost"
          onClick={onAttachClick}
          className="absolute bottom-2.5 left-3 h-8 w-8 rounded-lg text-muted-foreground hover:text-foreground transition-colors"
          aria-label={attachButtonAriaLabel}
          aria-disabled={disabled || isLoading}
        >
          <PaperclipIcon className="h-4 w-4" />
          <span className="sr-only">{attachButtonAriaLabel}</span>
        </Button>
      )}
      
      <Button
        type="button"
        size="icon"
        variant="default"
        disabled={input.trim().length === 0 || isLoading || disabled}
        className="absolute bottom-2.5 right-3 h-8 w-8 rounded-lg bg-primary hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:bg-muted"
        aria-label={sendButtonAriaLabel}
        aria-disabled={input.trim().length === 0 || isLoading || disabled}
        onClick={submitMessage}
      >
        <IconSend className="h-4 w-4" />
        <span className="sr-only">{sendButtonAriaLabel}</span>
      </Button>
    </div>
  )
} 