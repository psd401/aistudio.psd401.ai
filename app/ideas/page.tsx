'use client';

import { useEffect, useState } from 'react';
import { useUser, useAuth } from '@clerk/nextjs';
import {
  Card,
  Text,
  Badge,
  Group,
  Button,
  Modal,
  TextInput,
  Textarea,
  Select,
  ActionIcon,
  Tooltip,
  Stack,
  SegmentedControl,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { IconThumbUp, IconNote, IconCheck, IconTrash } from '@tabler/icons-react';

type Idea = {
  id: number;
  title: string;
  description: string;
  priorityLevel: string;
  status: string;
  votes: number;
  notes: number;
  createdBy: string;
  createdAt: Date;
  completedAt?: Date;
  completedBy?: string;
  hasVoted?: boolean;
};

type Note = {
  id: number;
  ideaId: number;
  content: string;
  createdBy: string;
  createdAt: Date;
};

export default function IdeasPage() {
  const { user } = useUser();
  const { getToken } = useAuth();
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [sortBy, setSortBy] = useState<'newest' | 'priority' | 'votes'>('newest');
  const [opened, { open, close }] = useDisclosure(false);
  const [notesOpened, { open: openNotes, close: closeNotes }] = useDisclosure(false);
  const [loading, setLoading] = useState(false);
  const [selectedIdea, setSelectedIdea] = useState<Idea | null>(null);
  const [notes, setNotes] = useState<Note[]>([]);
  const [newNote, setNewNote] = useState('');
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    priorityLevel: 'medium',
  });

  const isAdmin = user?.publicMetadata?.role === 'Admin';

  useEffect(() => {
    fetchIdeas();
  }, []);

  const sortIdeas = (ideasToSort: Idea[]) => {
    return [...ideasToSort].sort((a, b) => {
      switch (sortBy) {
        case 'priority':
          const priorityOrder = { high: 0, medium: 1, low: 2 };
          return priorityOrder[a.priorityLevel as keyof typeof priorityOrder] - 
                 priorityOrder[b.priorityLevel as keyof typeof priorityOrder];
        case 'votes':
          return b.votes - a.votes;
        case 'newest':
        default:
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }
    });
  };

  const fetchIdeas = async () => {
    try {
      const token = await getToken();
      const response = await fetch('/api/ideas', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (!response.ok) {
        throw new Error('Failed to fetch ideas');
      }
      const data = await response.json();
      setIdeas(Array.isArray(data) ? data : []);
    } catch (error) {
      notifications.show({
        title: 'Error',
        message: 'Failed to fetch ideas',
        color: 'red',
      });
      setIdeas([]);
    }
  };

  const handleSubmit = async () => {
    setLoading(true);
    try {
      const token = await getToken();
      const response = await fetch('/api/ideas', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(formData),
      });
      
      if (!response.ok) throw new Error('Failed to create idea');
      
      await fetchIdeas();
      close();
      setFormData({ title: '', description: '', priorityLevel: 'medium' });
      notifications.show({
        title: 'Success',
        message: 'Idea created successfully',
        color: 'green',
      });
    } catch (error) {
      notifications.show({
        title: 'Error',
        message: 'Failed to create idea',
        color: 'red',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleVote = async (ideaId: number) => {
    console.log('Attempting to vote for idea:', ideaId);
    try {
      const token = await getToken();
      console.log('Got auth token');
      
      const response = await fetch(`/api/ideas/${ideaId}/vote`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      console.log('Vote response status:', response.status);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.log('Vote error:', errorText);
        throw new Error(errorText || 'Failed to vote');
      }
      
      const data = await response.json();
      console.log('Vote success:', data);
      
      await fetchIdeas();
      notifications.show({
        title: 'Success',
        message: 'Vote recorded successfully',
        color: 'green',
      });
    } catch (error) {
      console.error('Vote error:', error);
      notifications.show({
        title: 'Error',
        message: error instanceof Error ? error.message : 'Failed to vote',
        color: 'red',
      });
    }
  };

  const handleStatusChange = async (ideaId: number, status: string) => {
    try {
      const token = await getToken();
      const response = await fetch(`/api/ideas/${ideaId}/status`, {
        method: 'PATCH',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ status }),
      });
      if (!response.ok) throw new Error('Failed to update status');
      await fetchIdeas();
    } catch (error) {
      notifications.show({
        title: 'Error',
        message: 'Failed to update status',
        color: 'red',
      });
    }
  };

  const handleOpenNotes = async (idea: Idea) => {
    setSelectedIdea(idea);
    try {
      const token = await getToken();
      const response = await fetch(`/api/ideas/${idea.id}/notes`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (!response.ok) throw new Error('Failed to fetch notes');
      const data = await response.json();
      setNotes(data);
      openNotes();
    } catch (error) {
      notifications.show({
        title: 'Error',
        message: 'Failed to fetch notes',
        color: 'red',
      });
    }
  };

  const handleAddNote = async () => {
    if (!selectedIdea || !newNote.trim()) return;

    try {
      const token = await getToken();
      const response = await fetch(`/api/ideas/${selectedIdea.id}/notes`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ content: newNote }),
      });
      
      if (!response.ok) throw new Error('Failed to add note');
      
      const addedNote = await response.json();
      setNotes([...notes, addedNote]);
      setNewNote('');
      notifications.show({
        title: 'Success',
        message: 'Note added successfully',
        color: 'green',
      });
    } catch (error) {
      notifications.show({
        title: 'Error',
        message: 'Failed to add note',
        color: 'red',
      });
    }
  };

  return (
    <div className="p-4">
      <Stack spacing="md">
        <Group justify="space-between" align="center">
          <Text size="xl" fw={700}>Ideas Board</Text>
          <Button onClick={open}>Submit New Idea</Button>
        </Group>

        <Group>
          <Text size="sm" fw={500}>Sort by:</Text>
          <SegmentedControl
            value={sortBy}
            onChange={(value) => setSortBy(value as typeof sortBy)}
            data={[
              { label: 'Newest', value: 'newest' },
              { label: 'Priority', value: 'priority' },
              { label: 'Most Votes', value: 'votes' },
            ]}
          />
        </Group>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {sortIdeas(ideas).map((idea) => (
            <Card key={idea.id} withBorder padding="lg" radius="md">
              <Stack spacing="xs">
                <Group justify="space-between">
                  <Text fw={500} size="lg">{idea.title}</Text>
                  <Badge
                    color={
                      idea.priorityLevel === 'high' ? 'red' :
                      idea.priorityLevel === 'medium' ? 'yellow' : 'blue'
                    }
                  >
                    {idea.priorityLevel}
                  </Badge>
                </Group>

                <Text size="sm" c="dimmed">
                  {idea.description}
                </Text>

                <Text size="xs" c="dimmed">
                  Created {new Date(idea.createdAt).toLocaleDateString()} at {new Date(idea.createdAt).toLocaleTimeString()}
                </Text>

                <Group justify="space-between">
                  <Group>
                    <Tooltip label={idea.hasVoted ? "Already voted" : "Vote"}>
                      <ActionIcon 
                        variant="light" 
                        onClick={() => handleVote(idea.id)}
                        disabled={idea.hasVoted}
                        color={idea.hasVoted ? 'gray' : 'blue'}
                      >
                        <IconThumbUp size={18} />
                      </ActionIcon>
                    </Tooltip>
                    <Text size="sm">{idea.votes}</Text>
                    
                    <Tooltip label="View Notes">
                      <ActionIcon.Group>
                        <ActionIcon 
                          variant="light"
                          onClick={() => handleOpenNotes(idea)}
                          color={idea.notes > 0 ? 'blue' : undefined}
                          pos="relative"
                        >
                          <IconNote size={18} />
                          {idea.notes > 0 && (
                            <Badge 
                              size="xs" 
                              variant="filled" 
                              color="blue"
                              style={{ 
                                position: 'absolute', 
                                top: -6, 
                                right: -6,
                                padding: '2px 4px',
                                minWidth: 'auto'
                              }}
                            >
                              {idea.notes}
                            </Badge>
                          )}
                        </ActionIcon>
                      </ActionIcon.Group>
                    </Tooltip>
                  </Group>

                  {isAdmin && (
                    <Group>
                      <Tooltip label="Mark Complete">
                        <ActionIcon
                          variant="light"
                          color="green"
                          onClick={() => handleStatusChange(idea.id, 'completed')}
                        >
                          <IconCheck size={18} />
                        </ActionIcon>
                      </Tooltip>
                      <Tooltip label="Delete">
                        <ActionIcon
                          variant="light"
                          color="red"
                          onClick={() => handleStatusChange(idea.id, 'deleted')}
                        >
                          <IconTrash size={18} />
                        </ActionIcon>
                      </Tooltip>
                    </Group>
                  )}
                </Group>
              </Stack>
            </Card>
          ))}
        </div>
      </Stack>

      <Modal opened={opened} onClose={close} title="Submit New Idea">
        <Stack>
          <TextInput
            label="Title"
            placeholder="Enter idea title"
            value={formData.title}
            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
            required
          />
          <Textarea
            label="Description"
            placeholder="Describe your idea"
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            required
            minRows={3}
          />
          <Select
            label="Priority Level"
            value={formData.priorityLevel}
            onChange={(value) => setFormData({ ...formData, priorityLevel: value || 'medium' })}
            data={[
              { value: 'low', label: 'Low' },
              { value: 'medium', label: 'Medium' },
              { value: 'high', label: 'High' },
            ]}
          />
          <Button onClick={handleSubmit} loading={loading}>Submit Idea</Button>
        </Stack>
      </Modal>

      <Modal opened={notesOpened} onClose={closeNotes} title={`Notes for ${selectedIdea?.title}`}>
        <Stack>
          {notes.length === 0 ? (
            <Text c="dimmed">No notes yet</Text>
          ) : (
            notes.map((note) => (
              <Card key={note.id} withBorder>
                <Text size="sm">{note.content}</Text>
                <Text size="xs" c="dimmed" mt="xs">
                  Added on {new Date(note.createdAt).toLocaleDateString()}
                </Text>
              </Card>
            ))
          )}

          <Textarea
            label="Add a note"
            placeholder="Type your note here"
            value={newNote}
            onChange={(e) => setNewNote(e.target.value)}
          />
          <Button onClick={handleAddNote}>Add Note</Button>
        </Stack>
      </Modal>
    </div>
  );
} 