'use client';

import { useEffect, useState } from 'react';
import { useToast } from '@/components/ui/use-toast';
import { IconThumbUp, IconNote, IconCheck, IconTrash, IconEdit } from '@tabler/icons-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

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
  updatedAt: Date;
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
  const { toast } = useToast();
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [sortBy, setSortBy] = useState<'newest' | 'priority' | 'votes'>('newest');
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showNotesDialog, setShowNotesDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selectedIdea, setSelectedIdea] = useState<Idea | null>(null);
  const [notes, setNotes] = useState<Note[]>([]);
  const [newNote, setNewNote] = useState('');
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    priorityLevel: 'medium',
  });
  const [editData, setEditData] = useState({
    title: '',
    description: '',
    priorityLevel: '',
  });

  useEffect(() => {
    fetchIdeas();
  }, []);

  const sortIdeas = (ideasToSort: Idea[]) => {
    return [...ideasToSort].sort((a, b) => {
      // First sort by completion status
      if (a.status === 'completed' && b.status !== 'completed') return 1;
      if (a.status !== 'completed' && b.status === 'completed') return -1;
      
      // Then apply the selected sort within each group
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
      const response = await fetch('/api/ideas');
      if (!response.ok) {
        throw new Error('Failed to fetch ideas');
      }
      const data = await response.json();
      setIdeas(Array.isArray(data) ? data : []);
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to fetch ideas',
        variant: 'destructive',
      });
      setIdeas([]);
    }
  };

  const handleSubmit = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/ideas', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });
      
      if (!response.ok) throw new Error('Failed to create idea');
      
      await fetchIdeas();
      setShowAddDialog(false);
      setFormData({ title: '', description: '', priorityLevel: 'medium' });
      toast({
        title: 'Success',
        description: 'Idea created successfully',
        variant: 'default',
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to create idea',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleVote = async (ideaId: number) => {
    console.log('Attempting to vote for idea:', ideaId);
    try {
      console.log('Got auth token');
      
      const response = await fetch(`/api/ideas/${ideaId}/vote`, {
        method: 'POST',
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
      toast({
        title: 'Success',
        description: 'Vote recorded successfully',
        variant: 'default',
      });
    } catch (error) {
      console.error('Vote error:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to vote',
        variant: 'destructive',
      });
    }
  };

  const handleStatusChange = async (ideaId: number, status: string) => {
    try {
      const response = await fetch(`/api/ideas/${ideaId}/status`, {
        method: 'PATCH',
        headers: { 
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status }),
      });
      if (!response.ok) throw new Error('Failed to update status');
      await fetchIdeas();
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to update status',
        variant: 'destructive',
      });
    }
  };

  const handleOpenNotes = async (idea: Idea) => {
    setSelectedIdea(idea);
    try {
      const response = await fetch(`/api/ideas/${idea.id}/notes`);
      if (!response.ok) throw new Error('Failed to fetch notes');
      const data = await response.json();
      setNotes(data);
      setShowNotesDialog(true);
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to fetch notes',
        variant: 'destructive',
      });
    }
  };

  const handleAddNote = async () => {
    if (!selectedIdea || !newNote.trim()) return;

    try {
      const response = await fetch(`/api/ideas/${selectedIdea.id}/notes`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ content: newNote }),
      });
      
      if (!response.ok) throw new Error('Failed to add note');
      
      const addedNote = await response.json();
      setNotes([...notes, addedNote]);
      setNewNote('');
      toast({
        title: 'Success',
        description: 'Note added successfully',
        variant: 'default',
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to add note',
        variant: 'destructive',
      });
    }
  };

  const handleEdit = async () => {
    if (!selectedIdea) return;
    setLoading(true);
    try {
      const response = await fetch(`/api/ideas/${selectedIdea.id}`, {
        method: 'PATCH',
        headers: { 
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(editData),
      });
      
      if (!response.ok) throw new Error('Failed to update idea');
      
      await fetchIdeas();
      setShowEditDialog(false);
      setSelectedIdea(null);
      setEditData({ title: '', description: '', priorityLevel: '' });
      toast({
        title: 'Success',
        description: 'Idea updated successfully',
        variant: 'default',
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to update idea',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleOpenEdit = (idea: Idea) => {
    setSelectedIdea(idea);
    setEditData({
      title: idea.title,
      description: idea.description,
      priorityLevel: idea.priorityLevel,
    });
    setShowEditDialog(true);
  };

  return (
    <div className="min-h-screen pt-14">
      <div className="container py-8">
        <div className="flex items-center justify-between mb-8">
          <div className="space-y-1">
            <h1 className="text-3xl font-bold">Ideas</h1>
            <p className="text-muted-foreground">Share and discuss ideas for improving our tools.</p>
          </div>

          <div className="flex items-center gap-4">
            <Select value={sortBy} onValueChange={(value) => setSortBy(value as typeof sortBy)}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Sort by" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="newest">Newest</SelectItem>
                <SelectItem value="priority">Priority</SelectItem>
                <SelectItem value="votes">Most Voted</SelectItem>
              </SelectContent>
            </Select>

            <Button onClick={() => setShowAddDialog(true)}>Add Idea</Button>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {sortIdeas(ideas).map((idea) => (
            <Card key={idea.id}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle>{idea.title}</CardTitle>
                    <CardDescription>
                      Created: {new Date(idea.createdAt).toLocaleDateString()}
                      {idea.updatedAt && idea.updatedAt !== idea.createdAt && (
                        <> · Updated: {new Date(idea.updatedAt).toLocaleDateString()}</>
                      )}
                    </CardDescription>
                  </div>
                  <Badge variant={idea.status === 'completed' ? 'default' : 'secondary'}>
                    {idea.status}
                  </Badge>
                </div>
              </CardHeader>

              <CardContent>
                <p className="text-sm text-muted-foreground">{idea.description}</p>
                <div className="mt-4 flex items-center gap-2">
                  <Badge variant="outline">{idea.priorityLevel}</Badge>
                  <Badge variant="outline">{idea.votes} votes</Badge>
                  <Badge variant="outline">{idea.notes} notes</Badge>
                </div>
              </CardContent>

              <CardFooter className="pt-0">
                <div className="flex flex-wrap items-center w-full gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleVote(idea.id)}
                    disabled={idea.hasVoted}
                  >
                    <IconThumbUp className="h-4 w-4" />
                    <span className="ml-1">Vote</span>
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleOpenNotes(idea)}
                  >
                    <IconNote className="h-4 w-4" />
                    <span className="ml-1">Notes</span>
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleOpenEdit(idea)}
                  >
                    <IconEdit className="h-4 w-4" />
                    <span className="ml-1">Edit</span>
                  </Button>
                  {idea.status !== 'completed' && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleStatusChange(idea.id, 'completed')}
                    >
                      <IconCheck className="h-4 w-4" />
                      <span className="ml-1">Complete</span>
                    </Button>
                  )}
                </div>
              </CardFooter>
            </Card>
          ))}
        </div>

        <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add New Idea</DialogTitle>
              <DialogDescription>
                Share your idea for improving our tools.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Title</label>
                <Input
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder="Enter idea title"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Description</label>
                <Textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Describe your idea"
                  rows={4}
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Priority Level</label>
                <Select
                  value={formData.priorityLevel}
                  onValueChange={(value) => setFormData({ ...formData, priorityLevel: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select priority" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setShowAddDialog(false)}>
                Cancel
              </Button>
              <Button onClick={handleSubmit} disabled={loading}>
                {loading ? (
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                ) : (
                  'Submit'
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={showNotesDialog} onOpenChange={setShowNotesDialog}>
          <DialogContent className="sm:max-w-[600px]">
            <DialogHeader>
              <DialogTitle>Notes</DialogTitle>
              <DialogDescription>
                {selectedIdea?.title}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-4">
              {notes.map((note) => (
                <Card key={note.id}>
                  <CardContent className="pt-6">
                    <p className="text-sm break-words whitespace-pre-wrap">{note.content}</p>
                    <p className="text-xs text-muted-foreground mt-2">
                      {new Date(note.createdAt).toLocaleString()} by {note.createdBy}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>

            <div className="flex gap-2 pt-4 border-t mt-4">
              <Textarea
                value={newNote}
                onChange={(e) => setNewNote(e.target.value)}
                placeholder="Add a note..."
                className="flex-1"
              />
              <Button onClick={handleAddNote}>Add</Button>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit Idea</DialogTitle>
              <DialogDescription>
                Update the details of this idea.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Title</label>
                <Input
                  value={editData.title}
                  onChange={(e) => setEditData({ ...editData, title: e.target.value })}
                  placeholder="Enter idea title"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Description</label>
                <Textarea
                  value={editData.description}
                  onChange={(e) => setEditData({ ...editData, description: e.target.value })}
                  placeholder="Describe your idea"
                  rows={4}
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Priority Level</label>
                <Select
                  value={editData.priorityLevel}
                  onValueChange={(value) => setEditData({ ...editData, priorityLevel: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select priority" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setShowEditDialog(false)}>
                Cancel
              </Button>
              <Button onClick={handleEdit} disabled={loading}>
                {loading ? (
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                ) : (
                  'Save Changes'
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
} 