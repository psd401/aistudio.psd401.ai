import { useChat } from 'ai/react';
import { useEffect } from 'react';

type DataStreamDelta = {
  type: 'text-delta' | 'finish' | 'user-message-id';
  content: string;
};

export function DataStreamHandler({ id }: { id: string }) {
  const { data: dataStream } = useChat({ id });
  
  useEffect(() => {
    if (!dataStream) return;
    
    // Process each stream delta
    dataStream.forEach((delta: DataStreamDelta) => {
      switch (delta.type) {
        case 'text-delta':
          console.log('Text update:', delta.content);
          break;
        case 'user-message-id':
          console.log('Message ID:', delta.content);
          break;
        case 'finish':
          console.log('Stream finished');
          break;
      }
    });
  }, [dataStream]);

  return null; // This component doesn't render anything
} 