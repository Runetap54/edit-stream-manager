import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Plus, Edit2, Trash2, Settings, Keyboard } from 'lucide-react';
import { useShotTypes, type ShotType } from '@/hooks/useShotTypes';
import { toast } from 'sonner';

interface ShotTypesManagerProps {
  trigger?: React.ReactNode;
}

export function ShotTypesManager({ trigger }: ShotTypesManagerProps) {
  const { shotTypes, loading, createShotType, updateShotType, deleteShotType } = useShotTypes();
  const [isOpen, setIsOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    prompt_template: '',
    hotkey: '',
    sort_order: 0
  });

  const resetForm = () => {
    setFormData({
      name: '',
      prompt_template: '',
      hotkey: '',
      sort_order: 0
    });
    setEditingId(null);
    setIsCreating(false);
  };

  const handleEdit = (shotType: ShotType) => {
    setFormData({
      name: shotType.name,
      prompt_template: shotType.prompt_template,
      hotkey: shotType.hotkey,
      sort_order: shotType.sort_order
    });
    setEditingId(shotType.id);
    setIsCreating(false);
  };

  const handleCreate = () => {
    resetForm();
    setIsCreating(true);
    
    // Set next sort order
    const maxSort = Math.max(...shotTypes.map(st => st.sort_order), 0);
    setFormData(prev => ({ ...prev, sort_order: maxSort + 1 }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.name.trim() || !formData.prompt_template.trim() || !formData.hotkey.trim()) {
      toast.error('Please fill in all required fields');
      return;
    }

    try {
      if (isCreating) {
        await createShotType(formData);
      } else if (editingId) {
        await updateShotType(editingId, formData);
      }
      resetForm();
    } catch (error) {
      // Error handling is done in the hook
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this shot type?')) {
      return;
    }

    try {
      await deleteShotType(id);
    } catch (error) {
      // Error handling is done in the hook
    }
  };

  const defaultTrigger = (
    <Button variant="outline" size="sm">
      <Settings className="w-4 h-4 mr-2" />
      Manage Shot Types
    </Button>
  );

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        {trigger || defaultTrigger}
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center space-x-2">
            <Settings className="w-5 h-5" />
            <span>Shot Types Manager</span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Create/Edit Form */}
          {(isCreating || editingId) && (
            <Card>
              <CardContent className="pt-6">
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <Label htmlFor="name">Name *</Label>
                      <Input
                        id="name"
                        value={formData.name}
                        onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                        placeholder="e.g., Wide Shot"
                        maxLength={50}
                      />
                    </div>
                    <div>
                      <Label htmlFor="hotkey">Hotkey *</Label>
                      <Input
                        id="hotkey"
                        value={formData.hotkey}
                        onChange={(e) => setFormData(prev => ({ ...prev, hotkey: e.target.value.slice(0, 3) }))}
                        placeholder="e.g., 1 or Ctrl+1"
                        maxLength={3}
                      />
                    </div>
                    <div>
                      <Label htmlFor="sort_order">Sort Order</Label>
                      <Input
                        id="sort_order"
                        type="number"
                        value={formData.sort_order}
                        onChange={(e) => setFormData(prev => ({ ...prev, sort_order: parseInt(e.target.value) || 0 }))}
                        min={0}
                      />
                    </div>
                  </div>
                  
                  <div>
                    <Label htmlFor="prompt_template">Prompt Template *</Label>
                    <Textarea
                      id="prompt_template"
                      value={formData.prompt_template}
                      onChange={(e) => setFormData(prev => ({ ...prev, prompt_template: e.target.value }))}
                      placeholder="Describe the shot type and camera movement..."
                      rows={3}
                      className="resize-none"
                    />
                  </div>

                  <div className="flex justify-end space-x-2">
                    <Button type="button" variant="outline" onClick={resetForm}>
                      Cancel
                    </Button>
                    <Button type="submit">
                      {isCreating ? 'Create' : 'Update'} Shot Type
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          )}

          {/* Add New Button */}
          {!isCreating && !editingId && (
            <Button onClick={handleCreate} className="w-full">
              <Plus className="w-4 h-4 mr-2" />
              Add New Shot Type
            </Button>
          )}

          {/* Shot Types List */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-medium">Your Shot Types</h3>
              {shotTypes.length > 0 && (
                <div className="text-sm text-muted-foreground">
                  {shotTypes.length} shot type{shotTypes.length !== 1 ? 's' : ''}
                </div>
              )}
            </div>

            {loading ? (
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="h-20 bg-muted animate-pulse rounded-lg" />
                ))}
              </div>
            ) : shotTypes.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Keyboard className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p>No shot types created yet</p>
                <p className="text-sm">Create your first shot type to get started</p>
              </div>
            ) : (
              <div className="space-y-3">
                {shotTypes.map((shotType) => (
                  <Card key={shotType.id}>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center space-x-2 mb-2">
                            <h4 className="font-medium truncate">{shotType.name}</h4>
                            <Badge variant="secondary" className="text-xs">
                              <Keyboard className="w-3 h-3 mr-1" />
                              {shotType.hotkey}
                            </Badge>
                          </div>
                          <p className="text-sm text-muted-foreground line-clamp-2">
                            {shotType.prompt_template}
                          </p>
                        </div>
                        <div className="flex items-center space-x-2 ml-4">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEdit(shotType)}
                            disabled={isCreating || editingId !== null}
                          >
                            <Edit2 className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDelete(shotType.id)}
                            disabled={isCreating || editingId !== null}
                            className="text-destructive hover:text-destructive"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>

          {/* Legend */}
          {shotTypes.length > 0 && (
            <Card className="bg-muted/30">
              <CardContent className="p-4">
                <div className="text-sm text-muted-foreground">
                  <div className="font-medium mb-2">Hotkey Legend:</div>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                    {shotTypes.map((shotType) => (
                      <div key={shotType.id} className="flex items-center space-x-2">
                        <Badge variant="outline" className="text-xs font-mono">
                          {shotType.hotkey}
                        </Badge>
                        <span className="truncate">{shotType.name}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}