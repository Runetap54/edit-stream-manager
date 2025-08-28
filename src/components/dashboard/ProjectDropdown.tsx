import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChevronDown, FolderOpen, Plus, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface ProjectDropdownProps {
  selectedProject: string;
  onProjectSelect: (projectName: string) => void;
}

export function ProjectDropdown({ selectedProject, onProjectSelect }: ProjectDropdownProps) {
  const [folders, setFolders] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadFolders();
    setupRealtimeSubscription();
  }, []);

  const topLevelFolderFromPath = (path: string, rootPrefix = 'Photos/') => {
    const rel = path.startsWith(rootPrefix) ? path.slice(rootPrefix.length) : path;
    return rel.split('/')[0];
  };

  const loadFolders = async () => {
    setLoading(true);
    try {
      // Get current user to ensure security
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error("Please sign in to access projects");
        return;
      }

      // Get user's projects from database (secure)
      const { data: projects, error: projectsError } = await supabase
        .from('projects')
        .select('name')
        .eq('owner_id', user.id)
        .order('name');

      if (projectsError) {
        console.error("Error loading projects:", projectsError);
        toast.error("Failed to load projects");
        return;
      }

      const projectNames = projects?.map(p => p.name) || [];
      
      // Also check storage for any additional folders
      const { data, error } = await supabase.storage
        .from('media')
        .list('Photos', {
          limit: 1000,
          sortBy: { column: 'name', order: 'asc' }
        });

      if (error) {
        console.error("Error loading folders from storage:", error);
        // Don't fail completely, just use project names
      }

      // Extract unique folder names from storage objects
      const folderSet = new Set<string>(projectNames);
      
      if (data) {
        // Add folders from directory listing
        data.forEach(item => {
          if (item.name && !item.name.includes('.')) {
            // This is likely a folder
            folderSet.add(item.name);
          }
        });

        // Also get folders from file paths by listing all objects
        const { data: allFiles, error: filesError } = await supabase.storage
          .from('media')
          .list('Photos', {
            limit: 1000,
            sortBy: { column: 'name', order: 'asc' }
          });

        if (!filesError && allFiles) {
          allFiles.forEach(file => {
            if (file.name && file.name.includes('/')) {
              const folderName = topLevelFolderFromPath(`Photos/${file.name}`, 'Photos/');
              if (folderName && folderName !== file.name) {
                folderSet.add(folderName);
              }
            }
          });
        }
      }

      const uniqueFolders = Array.from(folderSet).filter(Boolean).sort();
      setFolders(uniqueFolders);

      // Auto-select first folder if none selected and folders exist
      if (!selectedProject && uniqueFolders.length > 0) {
        onProjectSelect(uniqueFolders[0]);
      }
    } catch (error) {
      console.error("Error loading folders:", error);
      toast.error("Failed to load folders");
    } finally {
      setLoading(false);
    }
  };

  const setupRealtimeSubscription = () => {
    const channel = supabase
      .channel('media-objects')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'storage',
          table: 'objects',
          filter: 'bucket_id=eq.media'
        },
        (payload) => {
          console.log('Storage change detected:', payload);
          
          // Debounce folder refresh to avoid too many updates
          setTimeout(() => {
            loadFolders();
          }, 1000);
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('Subscribed to storage changes');
        } else if (status === 'CHANNEL_ERROR') {
          console.warn('Realtime subscription failed, falling back to polling');
          // Fallback: poll every 15 seconds
          const interval = setInterval(loadFolders, 15000);
          return () => clearInterval(interval);
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  };

  const displayText = selectedProject || "Select Folder";
  const truncatedText = displayText.length > 20 
    ? displayText.substring(0, 17) + "..." 
    : displayText;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button 
          variant="outline" 
          className="w-48 justify-between bg-background hover:bg-accent hover:text-accent-foreground border border-border"
          disabled={loading}
        >
          <div className="flex items-center space-x-2">
            <FolderOpen className="w-4 h-4" />
            <span className="truncate">{truncatedText}</span>
          </div>
          {loading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <ChevronDown className="w-4 h-4 opacity-50" />
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-48 bg-popover border border-border shadow-md z-50">
        {folders.length === 0 ? (
          <DropdownMenuItem disabled>
            <div className="text-center w-full text-muted-foreground">
              {loading ? "Loading..." : "No folders found"}
            </div>
          </DropdownMenuItem>
        ) : (
          <>
            {folders.map((folder) => (
              <DropdownMenuItem
                key={folder}
                onClick={() => onProjectSelect(folder)}
                className={`cursor-pointer hover:bg-accent hover:text-accent-foreground ${
                  selectedProject === folder ? "bg-accent text-accent-foreground" : ""
                }`}
              >
                <div className="flex-1">
                  <div className="font-medium truncate">{folder}</div>
                  <div className="text-xs text-muted-foreground">
                    Photo folder
                  </div>
                </div>
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled className="text-xs text-muted-foreground">
              <Plus className="w-3 h-3 mr-1" />
              Upload to create new folder
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}