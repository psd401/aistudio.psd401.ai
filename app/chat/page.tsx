import { currentUser } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { Chat } from './components/Chat';

export default async function ChatPage() {
  const user = await currentUser();
  
  if (!user?.id) {
    redirect('/sign-in');
  }

  return <Chat />;
} 