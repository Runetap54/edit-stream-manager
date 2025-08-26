import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { User } from "@supabase/supabase-js";
import { UploadPanel } from "@/components/dashboard/UploadPanel";
import { PhotoGrid } from "@/components/dashboard/PhotoGrid";
import { VideoSection } from "@/components/dashboard/VideoSection";
import { DashboardHeader } from "@/components/dashboard/DashboardHeader";
import { ProjectDropdown } from "@/components/dashboard/ProjectDropdown";
import { Loader2 } from "lucide-react";
import { useApi } from "@/hooks/useApi";

interface Profile {
  id: string;
  email: string;
  role: string;
  status: string;
}

export default function Dashboard() {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentProject, setCurrentProject] = useState<string>("");
  const [currentProjectId, setCurrentProjectId] = useState<string>("");
  const [uploadedFiles, setUploadedFiles] = useState<string[]>([]);
  const [selectedStart, setSelectedStart] = useState<string>("");
  const [selectedEnd, setSelectedEnd] = useState<string>("");
  const [selectedShotType, setSelectedShotType] = useState<number>(1);
  const { execute: createProject } = useApi();
  const { execute: fetchProjects } = useApi();

  useEffect(() => {
    // Load last selected project from localStorage
    const lastProject = localStorage.getItem('lastSelectedProject');
    if (lastProject) {
      setCurrentProject(lastProject);
    }

    // Cleanup subscriptions on unmount
    return () => {
      supabase.removeAllChannels();
    };
  }, []);

  useEffect(() => {
    // Save current project to localStorage
    if (currentProject) {
      localStorage.setItem('lastSelectedProject', currentProject);
    }
  }, [currentProject]);

  useEffect(() => {
    // Check authentication and profile status
    const checkAuth = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        
        if (!session) {
          navigate("/auth");
          return;
        }

        setUser(session.user);

        // Check profile status
        const { data: profileData, error: profileError } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", session.user.id)
          .single();

        if (profileError) {
          console.error("Profile error:", profileError);
          toast.error("Error loading profile");
          return;
        }

        setProfile(profileData);

        if (profileData.status !== "approved") {
          toast.error("Your account is pending admin approval");
          await supabase.auth.signOut();
          navigate("/auth");
          return;
        }
      } catch (error) {
        console.error("Auth check error:", error);
        navigate("/auth");
      } finally {
        setLoading(false);
      }
    };

    checkAuth();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (event === 'SIGNED_OUT' || !session) {
          navigate("/auth");
        }
      }
    );

    return () => subscription.unsubscribe();
  }, [navigate]);

  const handleUploadComplete = async (folder: string, files: string[]) => {
    setCurrentProject(folder);
    setUploadedFiles(files);
    setSelectedStart("");
    setSelectedEnd("");
    setSelectedShotType(1);
    
    // Create/update project in database
    await createProject(async () => {
      const response = await supabase.functions.invoke('projects', {
        method: 'POST',
        body: { name: folder }
      });

      if (response.error) {
        throw response.error;
      }

      return response.data;
    });
    
    toast.success(`Uploaded ${files.length} files to ${folder}`);
  };

  const handleProjectSelect = async (projectName: string) => {
    setCurrentProject(projectName);
    setUploadedFiles([]);
    setSelectedStart("");
    setSelectedEnd("");
    setSelectedShotType(1);
    
    // Get the project ID for the selected project
    try {
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
        const project = result.data.find((p: any) => p.name === projectName);
        if (project) {
          setCurrentProjectId(project.id);
          // Set up realtime subscription for this project's photos
          setupPhotoSubscription(project.id);
        }
      }
    } catch (error) {
      console.error("Error fetching project details:", error);
      toast.error("Failed to load project details");
    }
  };

  // Realtime subscription for photos
  const setupPhotoSubscription = (projectId: string) => {
    // Remove existing subscription if any
    if (currentProjectId) {
      supabase.removeAllChannels();
    }

    const channel = supabase
      .channel(`photos:${projectId}`)
      .on(
        'postgres_changes',
        { 
          event: 'INSERT', 
          schema: 'public', 
          table: 'photos', 
          filter: `project_id=eq.${projectId}` 
        },
        (payload) => {
          console.log('New photo added:', payload.new);
          // The PhotoGrid component will refetch automatically due to realtime updates
          toast.success("New photo added to project");
        }
      )
      .subscribe();
  };

  const handlePhotoSelect = (storageKey: string, type: "start" | "end") => {
    if (type === "start") {
      setSelectedStart(storageKey);
    } else {
      setSelectedEnd(storageKey);
    }
    
    // Show toast for feedback when End is set without Start
    if (type === "end" && storageKey && !selectedStart) {
      toast.error("Set Start (S) first");
    }
  };

  const handleShotTypeSelect = (shotType: number) => {
    setSelectedShotType(shotType);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4">
          <Loader2 className="w-8 h-8 animate-spin mx-auto text-primary" />
          <p className="text-muted-foreground">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  if (!user || !profile) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader user={user} profile={profile} />
      
      <div className="container mx-auto p-6 space-y-6">
        {/* Project Selection */}
        <div className="flex items-center justify-between">
          <ProjectDropdown 
            selectedProject={currentProject}
            onProjectSelect={handleProjectSelect}
          />
        </div>
        
        {/* Upload Panel */}
        <UploadPanel onUploadComplete={handleUploadComplete} />
        
        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Photo Grid - Takes up 2 columns on large screens */}
          <div className="lg:col-span-2 space-y-4">
            <PhotoGrid
              projectId={currentProjectId}
              selectedStart={selectedStart}
              selectedEnd={selectedEnd}
              selectedShotType={selectedShotType}
              onPhotoSelect={handlePhotoSelect}
              onShotTypeSelect={handleShotTypeSelect}
            />
          </div>
          
          {/* Video Section - Takes up 1 column on large screens */}
          <div className="space-y-4">
            <VideoSection
              folder={currentProject}
              selectedStart={selectedStart}
              selectedEnd={selectedEnd}
              selectedShotType={selectedShotType}
            />
          </div>
        </div>
      </div>
    </div>
  );
}