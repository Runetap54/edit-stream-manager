import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { User } from "@supabase/supabase-js";
import { useHotkeys } from "react-hotkeys-hook";

import { PhotoGrid } from "@/components/dashboard/PhotoGrid";
import { VideoSection } from "@/components/dashboard/VideoSection";
import { DashboardHeader } from "@/components/dashboard/DashboardHeader";
import { ProjectDropdown } from "@/components/dashboard/ProjectDropdown";
import { Button } from "@/components/ui/button";
import { Loader2, Play } from "lucide-react";
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
  const [uploadedFiles, setUploadedFiles] = useState<string[]>([]);
  const [selectedStart, setSelectedStart] = useState<string>("");
  const [selectedEnd, setSelectedEnd] = useState<string>("");
  const [selectedShotTypeId, setSelectedShotTypeId] = useState<string | null>(null);
  const [scenes, setScenes] = useState<Array<{
    sceneId: string;
    generationId: string;
    startFrameUrl: string;
    endFrameUrl?: string;
    shotType: string;
    status: 'processing' | 'ready' | 'error';
    videoUrl?: string;
    createdAt: Date;
  }>>([]);
  const { execute: createProject } = useApi();

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
    setSelectedShotTypeId(null);
    
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
    setSelectedShotTypeId(null);
    
    // Set up realtime subscription for this project's photos
    setupPhotoSubscription(projectName);
  };

  // Realtime subscription for photos
  const setupPhotoSubscription = (projectName: string) => {
    // Remove existing subscription if any
    supabase.removeAllChannels();

    if (!projectName) return;

    const channel = supabase
      .channel(`photos:${projectName}`)
      .on(
        'postgres_changes',
        { 
          event: 'INSERT', 
          schema: 'public', 
          table: 'photos'
        },
        (payload) => {
          console.log('New photo added:', payload.new);
          // The PhotoGrid component will refetch automatically due to realtime updates
          toast.success("New photo added to project");
        }
      )
      .subscribe();
  };

  const handlePhotoSelect = (photoUrl: string, type: "start" | "end") => {
    if (type === "start") {
      setSelectedStart(photoUrl);
    } else {
      setSelectedEnd(photoUrl);
    }
    
    // Show toast for feedback when End is set without Start
    if (type === "end" && photoUrl && !selectedStart) {
      toast.error("Set Start (S) first");
    }
  };

  const handleSceneGenerate = async (sceneData: { 
    startFrameUrl: string; 
    endFrameUrl?: string; 
    shotTypeId: string; 
  }) => {
    const sceneId = crypto.randomUUID();
    const generationId = crypto.randomUUID();
    
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error("Please sign in to generate scenes");
      }

      // Show loading toast
      toast.loading("Starting scene generation...", { id: sceneId });

      const requestBody = {
        folder: currentProject,
        start_key: sceneData.startFrameUrl,
        end_key: sceneData.endFrameUrl || null,
        shot_type_id: sceneData.shotTypeId
      };

      const response = await supabase.functions.invoke("luma-create-scene", {
        body: requestBody
      });

      if (response.error) {
        throw response.error;
      }

      // Only create scene card AFTER successful API response
      const newScene = {
        sceneId,
        generationId,
        startFrameUrl: sceneData.startFrameUrl,
        endFrameUrl: sceneData.endFrameUrl,
        shotType: sceneData.shotTypeId,
        status: 'processing' as const,
        createdAt: new Date()
      };
      
      setScenes(prev => [newScene, ...prev]);
      
      // Auto-select the new scene by updating URL
      const searchParams = new URLSearchParams(window.location.search);
      searchParams.set('sceneId', sceneId);
      window.history.replaceState({}, '', `${window.location.pathname}?${searchParams}`);

      toast.success("Scene generation started!", {
        id: sceneId,
        description: `Scene ID: ${sceneId.slice(0, 8)}...`
      });
    } catch (error: any) {
      console.error("Error generating scene:", error);
      toast.error(error.message || "Failed to generate scene", { id: sceneId });
    }
  };

  const handleShotTypeSelect = (shotTypeId: string) => {
    setSelectedShotTypeId(shotTypeId);
  };

  // Add hotkey for Enter to generate scene when photos are selected
  const canGenerateScene = selectedStart && selectedShotTypeId;
  useHotkeys(['enter'], () => {
    if (canGenerateScene) {
      handleSceneGenerate({
        startFrameUrl: selectedStart,
        endFrameUrl: selectedEnd,
        shotTypeId: selectedShotTypeId!
      });
    }
  }, {
    enabled: !!canGenerateScene,
    preventDefault: true
  });

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
        
        {/* Shot Type Row - Full width above main content */}
        {currentProject && (
          <div className="bg-card border rounded-lg p-4">
            <PhotoGrid
              projectName=""
              selectedStart=""
              selectedEnd=""
              selectedShotTypeId={selectedShotTypeId}
              onPhotoSelect={() => {}}
              onShotTypeSelect={handleShotTypeSelect}
              onSceneGenerate={() => {}}
              onUploadComplete={() => {}}
              renderShotTypesOnly={true}
            />
          </div>
        )}
        
        {/* Main Content Grid - Photo grid on left, video section takes remaining space */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Photo Grid with integrated upload - Takes up 1 column */}
          <div className="space-y-4">
            <PhotoGrid
              projectName={currentProject}
              selectedStart={selectedStart}
              selectedEnd={selectedEnd}
              selectedShotTypeId={selectedShotTypeId}
              onPhotoSelect={handlePhotoSelect}
              onShotTypeSelect={handleShotTypeSelect}
              onSceneGenerate={handleSceneGenerate}
              onUploadComplete={handleUploadComplete}
              hideShotTypes={true}
            />
            
            {/* Generate Scene Button underneath photo grid */}
            {currentProject && (
              <div className="flex justify-center">
                <Button
                  onClick={() => handleSceneGenerate({
                    startFrameUrl: selectedStart,
                    endFrameUrl: selectedEnd,
                    shotTypeId: selectedShotTypeId!
                  })}
                  disabled={!selectedStart || !selectedShotTypeId}
                  className="bg-gradient-to-r from-primary to-accent hover:opacity-90 px-8 py-3"
                  size="lg"
                >
                  <Play className="w-5 h-5 mr-2" />
                  Generate Scene {canGenerateScene && "(Press Enter)"}
                </Button>
              </div>
            )}
          </div>
          
          {/* Video Section - Takes up 1 column */}
          <div className="space-y-4">
            <VideoSection
              folder={currentProject}
              selectedStart={selectedStart}
              selectedEnd={selectedEnd}
              selectedShotTypeId={selectedShotTypeId}
              scenes={scenes}
              onSceneUpdate={setScenes}
            />
          </div>
        </div>
      </div>
    </div>
  );
}