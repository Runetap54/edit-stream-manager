import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChevronDown, FolderOpen, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useApi } from "@/hooks/useApi";

interface Project {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
}

interface ProjectDropdownProps {
  selectedProject: string;
  onProjectSelect: (projectName: string) => void;
}

export function ProjectDropdown({ selectedProject, onProjectSelect }: ProjectDropdownProps) {
  const [projects, setProjects] = useState<Project[]>([]);
  const { execute: fetchProjects, loading } = useApi();

  useEffect(() => {
    loadProjects();
  }, []);

  const loadProjects = async () => {
    const result = await fetchProjects(async () => {
      const response = await supabase.functions.invoke('projects', {
        method: 'GET',
      });

      if (response.error) {
        throw response.error;
      }

      return response.data;
    });

    if (result?.data) {
      setProjects(result.data);
      
      // Auto-select the most recent project if none selected
      if (!selectedProject && result.data.length > 0) {
        onProjectSelect(result.data[0].name);
      }
    }
  };

  const displayText = selectedProject || "Select Project";
  const truncatedText = displayText.length > 20 
    ? displayText.substring(0, 17) + "..." 
    : displayText;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button 
          variant="outline" 
          className="w-48 justify-between"
          disabled={loading}
        >
          <div className="flex items-center space-x-2">
            <FolderOpen className="w-4 h-4" />
            <span className="truncate">{truncatedText}</span>
          </div>
          <ChevronDown className="w-4 h-4 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-48">
        {projects.length === 0 ? (
          <DropdownMenuItem disabled>
            <div className="text-center w-full text-muted-foreground">
              No projects yet
            </div>
          </DropdownMenuItem>
        ) : (
          <>
            {projects.map((project) => (
              <DropdownMenuItem
                key={project.id}
                onClick={() => onProjectSelect(project.name)}
                className={selectedProject === project.name ? "bg-accent" : ""}
              >
                <div className="flex-1">
                  <div className="font-medium truncate">{project.name}</div>
                  <div className="text-xs text-muted-foreground">
                    Updated {new Date(project.updated_at).toLocaleDateString()}
                  </div>
                </div>
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled className="text-xs text-muted-foreground">
              <Plus className="w-3 h-3 mr-1" />
              Upload to create new project
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}