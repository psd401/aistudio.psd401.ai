import type { FC } from "react";
import {
  ThreadListItemPrimitive,
  ThreadListPrimitive,
  useThreadListItem
} from "@assistant-ui/react";
import { ArchiveIcon, PlusIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { TooltipIconButton } from "@/components/assistant-ui/tooltip-icon-button";
import { useThreadTitles } from "@/lib/nexus/use-thread-titles";

export const NexusThreadList: FC = () => {
  // Initialize the hook at the top level to ensure it always runs
  const { getThreadTitle } = useThreadTitles();
  
  return (
    <ThreadListPrimitive.Root className="text-foreground flex flex-col items-stretch gap-1.5">
      <ThreadListNew />
      <ThreadListItems getThreadTitle={getThreadTitle} />
    </ThreadListPrimitive.Root>
  );
};

const ThreadListNew: FC = () => {
  return (
    <ThreadListPrimitive.New asChild>
      <Button className="data-active:bg-muted hover:bg-muted flex items-center justify-start gap-1 rounded-lg px-2.5 py-2 text-start" variant="ghost">
        <PlusIcon />
        New Thread
      </Button>
    </ThreadListPrimitive.New>
  );
};

const ThreadListItems: FC<{ getThreadTitle: (id: string) => string }> = ({ getThreadTitle }) => {
  return <ThreadListPrimitive.Items components={{ ThreadListItem: (props) => <NexusThreadListItem {...props} getThreadTitle={getThreadTitle} /> }} />;
};

const NexusThreadListItem: FC<{ getThreadTitle: (id: string) => string }> = ({ getThreadTitle }) => {
  return (
    <ThreadListItemPrimitive.Root className="data-active:bg-muted hover:bg-muted focus-visible:bg-muted focus-visible:ring-ring flex items-center gap-2 rounded-lg transition-all focus-visible:outline-none focus-visible:ring-2">
      <ThreadListItemPrimitive.Trigger className="flex-grow px-3 py-2 text-start">
        <NexusThreadListItemTitle getThreadTitle={getThreadTitle} />
      </ThreadListItemPrimitive.Trigger>
      <ThreadListItemArchive />
    </ThreadListItemPrimitive.Root>
  );
};

const NexusThreadListItemTitle: FC<{ getThreadTitle: (id: string) => string }> = ({ getThreadTitle }) => {
  const threadItem = useThreadListItem();
  
  // Get the actual title from database, fallback to default
  const title = getThreadTitle(threadItem.id);
  
  return (
    <p className="text-sm">
      {title}
    </p>
  );
};

const ThreadListItemArchive: FC = () => {
  return (
    <ThreadListItemPrimitive.Archive asChild>
      <TooltipIconButton
        className="hover:text-foreground/60 text-foreground ml-auto mr-1 size-4 p-4"
        variant="ghost"
        tooltip="Archive thread"
      >
        <ArchiveIcon />
      </TooltipIconButton>
    </ThreadListItemPrimitive.Archive>
  );
};