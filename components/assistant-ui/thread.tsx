import {
  ThreadPrimitive,
  ComposerPrimitive,
  MessagePrimitive,
  ActionBarPrimitive,
  BranchPickerPrimitive,
  ErrorPrimitive,
  useMessage,
} from "@assistant-ui/react";
import type { FC } from "react";
import { createContext, useContext } from "react";
import { useSession } from "next-auth/react";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  CopyIcon,
  CheckIcon,
  PencilIcon,
  RefreshCwIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  Square,
  Volume2Icon,
  VolumeOffIcon,
} from "lucide-react";

import { TooltipIconButton } from "@/components/assistant-ui/tooltip-icon-button";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { MarkdownText } from "./markdown-text";
import { ToolFallback } from "./tool-fallback";
import { ToolGroup } from "@/app/(protected)/nexus/_components/tools/tool-group";
import {
  ComposerAttachments,
  ComposerAddAttachment,
  UserMessageAttachments,
} from "@/components/assistant-ui/attachment";
import { PromptSaveButton } from "@/app/(protected)/nexus/_components/chat/prompt-save-button";

// Context for passing conversationId to message components
const ConversationIdContext = createContext<string | null>(null);

export const useConversationId = () => useContext(ConversationIdContext);

interface ThreadProps {
  processingAttachments?: Set<string>;
  conversationId?: string | null;
}

export const Thread: FC<ThreadProps> = ({ processingAttachments, conversationId }) => {
  return (
    <ConversationIdContext.Provider value={conversationId || null}>
      <ThreadPrimitive.Root
        className="bg-white flex h-full flex-col"
        style={{
          ["--thread-max-width" as string]: "48rem",
          ["--thread-padding-x" as string]: "1rem",
        }}
      >
        <ThreadPrimitive.Viewport className="relative flex min-w-0 flex-1 flex-col gap-6 overflow-y-scroll">
          <ThreadWelcome conversationId={conversationId} />

          <ThreadPrimitive.Messages
            components={{
              UserMessage,
              EditComposer,
              AssistantMessage,
            }}
          />

          <ThreadPrimitive.If empty={false}>
            <motion.div className="min-h-6 min-w-6 shrink-0" />
          </ThreadPrimitive.If>
        </ThreadPrimitive.Viewport>

        <Composer processingAttachments={processingAttachments} />
      </ThreadPrimitive.Root>
    </ConversationIdContext.Provider>
  );
};

const ThreadScrollToBottom: FC = () => {
  return (
    <ThreadPrimitive.ScrollToBottom asChild>
      <TooltipIconButton
        tooltip="Scroll to bottom"
        variant="outline"
        className="dark:bg-background dark:hover:bg-accent absolute -top-12 z-10 self-center rounded-full p-4 disabled:invisible"
      >
        <ArrowDownIcon />
      </TooltipIconButton>
    </ThreadPrimitive.ScrollToBottom>
  );
};

const ThreadWelcome: FC<{ conversationId?: string | null }> = ({ conversationId }) => {
  const { data: session } = useSession();
  
  // If we have a conversationId (loading existing conversation), show loading state
  if (conversationId) {
    return (
      <ThreadPrimitive.Empty>
        <div className="mx-auto flex w-full max-w-[var(--thread-max-width)] flex-grow flex-col px-[var(--thread-padding-x)]">
          <div className="flex w-full flex-grow flex-col items-center justify-center">
            <div className="flex items-center space-x-2">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
              <span className="text-muted-foreground">Loading conversation...</span>
            </div>
          </div>
        </div>
      </ThreadPrimitive.Empty>
    );
  }
  
  // Extract user name with fallback
  const getUserName = () => {
    if (session?.user?.name) {
      return session.user.name.split(' ')[0];
    }
    if (session?.user?.email) {
      return session.user.email.split('@')[0];
    }
    return null;
  };
  
  const userName = getUserName();
  
  return (
    <ThreadPrimitive.Empty>
      <div className="mx-auto flex w-full max-w-[var(--thread-max-width)] flex-grow flex-col px-[var(--thread-padding-x)]">
        <div className="flex w-full flex-grow flex-col items-center justify-center">
          <div className="flex size-full flex-col justify-center px-8 md:mt-20">
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              transition={{ delay: 0.5 }}
              className="text-2xl font-semibold"
            >
              Hello{userName ? ` ${userName}` : ''}!
            </motion.div>
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              transition={{ delay: 0.6 }}
              className="text-muted-foreground/65 text-2xl"
            >
              How can I help you today?
            </motion.div>
          </div>
        </div>
      </div>
    </ThreadPrimitive.Empty>
  );
};

const ThreadWelcomeSuggestions: FC = () => {
  return (
    <div className="grid w-full gap-2 sm:grid-cols-2">
      {[
        {
          title: "Help me create a lesson plan",
          label: "for 5th grade math fractions",
          action: "Help me create a lesson plan for 5th grade math fractions",
        },
        {
          title: "Write a parent communication",
          label: "email about upcoming field trip",
          action: "Write a parent communication email about upcoming field trip",
        },
        {
          title: "Generate discussion questions",
          label: "for high school literature class",
          action: "Generate discussion questions for high school literature class",
        },
        {
          title: "Create a rubric",
          label: "for evaluating student presentations",
          action: "Create a rubric for evaluating student presentations",
        },
      ].map((suggestedAction, index) => (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
          transition={{ delay: 0.05 * index }}
          key={`suggested-action-${suggestedAction.title}-${index}`}
          className="[&:nth-child(n+3)]:hidden sm:[&:nth-child(n+3)]:block"
        >
          <ThreadPrimitive.Suggestion
            prompt={suggestedAction.action}
            method="replace"
            autoSend
            asChild
          >
            <Button
              variant="ghost"
              className="dark:hover:bg-accent/60 h-auto w-full flex-1 flex-wrap items-start justify-start gap-1 rounded-xl border px-4 py-3.5 text-left text-sm sm:flex-col"
              aria-label={suggestedAction.action}
            >
              <span className="font-medium">
                {suggestedAction.title}
              </span>
              <p className="text-muted-foreground">
                {suggestedAction.label}
              </p>
            </Button>
          </ThreadPrimitive.Suggestion>
        </motion.div>
      ))}
    </div>
  );
};

interface ComposerProps {
  processingAttachments?: Set<string>;
}

const Composer: FC<ComposerProps> = ({ processingAttachments }) => {
  return (
    <div className="bg-white relative mx-auto flex w-full max-w-[var(--thread-max-width)] flex-col gap-4 px-[var(--thread-padding-x)] pb-4 md:pb-6">
      <ThreadScrollToBottom />
      <ThreadPrimitive.Empty>
        <ThreadWelcomeSuggestions />
      </ThreadPrimitive.Empty>
      <ComposerPrimitive.Root className="relative flex w-full flex-col rounded-2xl focus-within:ring-2 focus-within:ring-black focus-within:ring-offset-2 dark:focus-within:ring-white">
        <ComposerAttachments processingAttachments={processingAttachments} />
        <ComposerPrimitive.Input
          placeholder="Send a message..."
          className="bg-muted border-border dark:border-muted-foreground/15 focus:outline-primary placeholder:text-muted-foreground max-h-[calc(50dvh)] min-h-16 w-full resize-none rounded-t-2xl border-x border-t px-4 pb-3 pt-2 text-base outline-none"
          rows={1}
          autoFocus
          aria-label="Message input"
        />
        <ComposerAction processingAttachments={processingAttachments} />
      </ComposerPrimitive.Root>
    </div>
  );
};

interface ComposerActionProps {
  processingAttachments?: Set<string>;
}

const ComposerAction: FC<ComposerActionProps> = ({ processingAttachments }) => {
  const hasProcessingAttachments = processingAttachments && processingAttachments.size > 0;
  
  return (
    <div className="bg-muted border-border dark:border-muted-foreground/15 relative flex items-center justify-between rounded-b-2xl border-x border-b p-2">
      <ComposerAddAttachment />

      <ThreadPrimitive.If running={false}>
        <ComposerPrimitive.Send asChild>
          <Button
            type="submit"
            variant="default"
            disabled={hasProcessingAttachments}
            className={cn(
              "size-8 rounded-full border",
              "dark:border-muted-foreground/90 border-muted-foreground/60 hover:bg-primary/75",
              hasProcessingAttachments && "opacity-50 cursor-not-allowed"
            )}
            aria-label={hasProcessingAttachments ? "Processing documents..." : "Send message"}
            title={hasProcessingAttachments ? "Please wait for document processing to complete" : "Send message"}
          >
            <ArrowUpIcon className="size-5" />
          </Button>
        </ComposerPrimitive.Send>
      </ThreadPrimitive.If>

      <ThreadPrimitive.If running>
        <ComposerPrimitive.Cancel asChild>
          <Button
            type="button"
            variant="default"
            className="dark:border-muted-foreground/90 border-muted-foreground/60 hover:bg-primary/75 size-8 rounded-full border"
            aria-label="Stop generating"
          >
            <Square className="size-3.5 fill-white dark:size-4 dark:fill-black" />
          </Button>
        </ComposerPrimitive.Cancel>
      </ThreadPrimitive.If>
    </div>
  );
};

const MessageError: FC = () => {
  return (
    <MessagePrimitive.Error>
      <ErrorPrimitive.Root className="border-destructive bg-destructive/10 dark:bg-destructive/5 text-destructive mt-2 rounded-md border p-3 text-sm dark:text-red-200">
        <ErrorPrimitive.Message className="line-clamp-2" />
      </ErrorPrimitive.Root>
    </MessagePrimitive.Error>
  );
};

const AssistantMessage: FC = () => {
  return (
    <MessagePrimitive.Root asChild>
      <motion.div
        className="relative mx-auto grid w-full max-w-[var(--thread-max-width)] grid-cols-[auto_auto_1fr] grid-rows-[auto_1fr] px-[var(--thread-padding-x)] py-4"
        initial={{ y: 5, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        data-role="assistant"
      >
        <div className="ring-border bg-background col-start-1 row-start-1 flex size-8 shrink-0 items-center justify-center rounded-full ring-1">
          <StarIcon size={14} />
        </div>

        <div className="text-foreground col-span-2 col-start-2 row-start-1 ml-4 break-words leading-7">
          <MessagePrimitive.Content
            components={{
              Text: MarkdownText,
              ToolGroup: ToolGroup,
              tools: { Fallback: ToolFallback },
            }}
          />
          <MessageError />
        </div>

        <AssistantActionBar />

        <BranchPicker className="col-start-2 row-start-2 -ml-2 mr-2" />
      </motion.div>
    </MessagePrimitive.Root>
  );
};

const AssistantActionBar: FC = () => {
  return (
    <ActionBarPrimitive.Root
      hideWhenRunning
      autohide="not-last"
      autohideFloat="single-branch"
      className="text-muted-foreground data-floating:bg-background data-floating:absolute data-floating:mt-2 data-floating:rounded-md data-floating:border data-floating:p-1 data-floating:shadow-sm col-start-3 row-start-2 ml-3 mt-3 flex gap-1"
    >
      <ActionBarPrimitive.Copy asChild>
        <TooltipIconButton tooltip="Copy">
          <MessagePrimitive.If copied>
            <CheckIcon />
          </MessagePrimitive.If>
          <MessagePrimitive.If copied={false}>
            <CopyIcon />
          </MessagePrimitive.If>
        </TooltipIconButton>
      </ActionBarPrimitive.Copy>
      <ActionBarPrimitive.Speak asChild>
        <TooltipIconButton tooltip="Read aloud">
          <MessagePrimitive.If speaking>
            <VolumeOffIcon />
          </MessagePrimitive.If>
          <MessagePrimitive.If speaking={false}>
            <Volume2Icon />
          </MessagePrimitive.If>
        </TooltipIconButton>
      </ActionBarPrimitive.Speak>
      <ActionBarPrimitive.Reload asChild>
        <TooltipIconButton tooltip="Refresh">
          <RefreshCwIcon />
        </TooltipIconButton>
      </ActionBarPrimitive.Reload>
    </ActionBarPrimitive.Root>
  );
};

const UserMessage: FC = () => {
  return (
    <MessagePrimitive.Root asChild>
      <motion.div
        className="mx-auto grid w-full max-w-[var(--thread-max-width)] auto-rows-auto grid-cols-[minmax(72px,1fr)_auto] gap-y-1 px-[var(--thread-padding-x)] py-4 [&:where(>*)]:col-start-2"
        initial={{ y: 5, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        data-role="user"
      >
        <UserActionBar />
        
        <UserMessageAttachments />

        <div className="bg-muted text-foreground col-start-2 break-words rounded-3xl px-5 py-2.5">
          <MessagePrimitive.Content components={{ Text: MarkdownText }} />
        </div>

        <BranchPicker className="col-span-full col-start-1 row-start-3 -mr-1 justify-end" />
      </motion.div>
    </MessagePrimitive.Root>
  );
};

const UserActionBar: FC = () => {
  const message = useMessage();
  const conversationId = useConversationId();

  // Extract text content from message
  const messageContent = message.content
    .filter(part => part.type === "text")
    .map(part => (part as { type: "text"; text: string }).text)
    .join("\n");

  return (
    <ActionBarPrimitive.Root
      hideWhenRunning
      autohide="not-last"
      className="col-start-1 mr-3 mt-2.5 flex flex-col items-end gap-1"
    >
      <ActionBarPrimitive.Edit asChild>
        <TooltipIconButton tooltip="Edit">
          <PencilIcon />
        </TooltipIconButton>
      </ActionBarPrimitive.Edit>

      {messageContent && (
        <PromptSaveButton
          content={messageContent}
          conversationId={conversationId}
        />
      )}
    </ActionBarPrimitive.Root>
  );
};

const EditComposer: FC = () => {
  return (
    <div className="mx-auto flex w-full max-w-[var(--thread-max-width)] flex-col gap-4 px-[var(--thread-padding-x)]">
      <ComposerPrimitive.Root className="bg-muted max-w-7/8 ml-auto flex w-full flex-col rounded-xl">
        <ComposerPrimitive.Input
          className="text-foreground flex min-h-[60px] w-full resize-none bg-transparent p-4 outline-none"
          autoFocus
        />

        <div className="mx-3 mb-3 flex items-center justify-center gap-2 self-end">
          <ComposerPrimitive.Cancel asChild>
            <Button variant="ghost" size="sm" aria-label="Cancel edit">
              Cancel
            </Button>
          </ComposerPrimitive.Cancel>
          <ComposerPrimitive.Send asChild>
            <Button size="sm" aria-label="Update message">
              Update
            </Button>
          </ComposerPrimitive.Send>
        </div>
      </ComposerPrimitive.Root>
    </div>
  );
};

const BranchPicker: FC<BranchPickerPrimitive.Root.Props> = ({
  className,
  ...rest
}) => {
  return (
    <BranchPickerPrimitive.Root
      hideWhenSingleBranch
      className={cn("text-muted-foreground inline-flex items-center text-xs", className)}
      {...rest}
    >
      <BranchPickerPrimitive.Previous asChild>
        <TooltipIconButton tooltip="Previous">
          <ChevronLeftIcon />
        </TooltipIconButton>
      </BranchPickerPrimitive.Previous>
      <span className="font-medium">
        <BranchPickerPrimitive.Number /> / <BranchPickerPrimitive.Count />
      </span>
      <BranchPickerPrimitive.Next asChild>
        <TooltipIconButton tooltip="Next">
          <ChevronRightIcon />
        </TooltipIconButton>
      </BranchPickerPrimitive.Next>
    </BranchPickerPrimitive.Root>
  );
};

const StarIcon = ({ size = 14 }: { size?: number }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 16 16"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      d="M8 0L9.79611 6.20389L16 8L9.79611 9.79611L8 16L6.20389 9.79611L0 8L6.20389 6.20389L8 0Z"
      fill="currentColor"
    />
  </svg>
);
