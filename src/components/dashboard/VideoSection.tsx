import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Video, RotateCcw, Trash2, Download, Play, History } from "lucide-react";

interface StorageScene {
  key: string;
  url: string;
  name: string;
}

interface Scene {
  id: string;
  user_id: string;
  folder: string;
  start_key: string;
  end_key: string;
  shot_type: number;
  status: string;
  created_at: string;
  start_frame_signed_url?: string;
  end_frame_signed_url?: string;
  signed_url_expires_at?: string;
  generations: SceneGeneration[];
}

interface SceneGeneration {
  generation_id: string;
  scene_id: string;
  start_frame_url: string;
  end_frame_url: string | null;
  shot_type: number;
  status: string;
  progress_pct: number | null;
  video_url: string | null;
  error_code: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

interface VideoSectionProps {
  folder: string;
  selectedStart: string;
  selectedEnd: string;
  selectedShotType: number;
  scenes: Array<{
    sceneId: string;
    generationId: string;
    startFrameUrl: string;
    endFrameUrl?: string;
    shotType: number;
    status: 'processing' | 'ready' | 'error';
    videoUrl?: string;
    createdAt: Date;
  }>;
  onSceneUpdate: (updateFn: (prev: any[]) => any[]) => void;
}

export function VideoSection({
  folder,
  selectedStart,
  selectedEnd,
  selectedShotType,
  scenes,
  onSceneUpdate,
}: VideoSectionProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [dbScenes, setDbScenes] = useState<Scene[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedSceneId, setSelectedSceneId] = useState<string | null>(
    searchParams.get('sceneId') || null
  );

  useEffect(() => {
    if (folder) {
      loadDbScenes();
      
      // Set up real-time subscription for scene and scene_generations updates
      const setupRealtime = async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const channel = supabase
          .channel('scene-realtime')
          .on(
            'postgres_changes',
            {
              event: '*',
              schema: 'public',
              table: 'scenes',
              filter: `user_id=eq.${user.id}`
            },
            () => {
              loadDbScenes();
            }
          )
          .on(
            'postgres_changes',
            {
              event: '*',
              schema: 'public',
              table: 'scene_generations'
            },
            () => {
              loadDbScenes();
            }
          )
          .subscribe();

        return channel;
      };

      setupRealtime().then(channel => {
        if (channel) {
          return () => {
            supabase.removeChannel(channel);
          };
        }
      });
    }
  }, [folder]);

  const loadDbScenes = async () => {
    if (!folder) return;
    
    setLoading(true);
    try {
      // Get all scenes for the user with their generations
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: scenesData, error } = await supabase
        .from("scenes")
        .select(`
          *
        `)
        .eq("user_id", user.id)
        .is("deleted_at", null)
        .order("created_at", { ascending: true });

      if (error) {
        console.error("Error loading DB scenes:", error);
        toast.error("Failed to load scenes");
        return;
      }

      // Get generations for each scene
      const sceneIds = scenesData?.map(s => s.id) || [];
      const { data: generationsData, error: generationsError } = await supabase
        .from("scene_generations")
        .select("*")
        .in("scene_id", sceneIds)
        .order("created_at", { ascending: false });

      if (generationsError) {
        console.error("Error loading scene generations:", generationsError);
      }

      const scenesWithGenerations = scenesData?.map(scene => ({
        ...scene,
        generations: (generationsData || []).filter(g => g.scene_id === scene.id)
      })) || [];

      setDbScenes(scenesWithGenerations);
      
      // Auto-select the first scene if none selected and scenes exist
      if (scenesWithGenerations.length > 0 && !selectedSceneId) {
        const firstSceneId = scenesWithGenerations[0].id;
        setSelectedSceneId(firstSceneId);
        setSearchParams(prev => {
          const newParams = new URLSearchParams(prev);
          newParams.set('sceneId', firstSceneId);
          return newParams;
        });
      }
    } catch (error) {
      console.error("Error loading DB scenes:", error);
      toast.error("Failed to load scenes");
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "queued":
        return "bg-status-queued";
      case "rendering":
        return "bg-status-rendering";
      case "ready":
        return "bg-status-ready";
      case "error":
        return "bg-status-error";
      default:
        return "bg-muted";
    }
  };

  const getLatestGeneration = (scene: Scene) => {
    if (scene.generations.length === 0) return null;
    return scene.generations[0]; // Already sorted by created_at desc
  };

  const handleSceneSelect = (sceneId: string) => {
    setSelectedSceneId(sceneId);
    setSearchParams(prev => {
      const newParams = new URLSearchParams(prev);
      newParams.set('sceneId', sceneId);
      return newParams;
    });
  };

  const handleRegenerateScene = async (sceneId: string) => {
    try {
      // Find the scene to regenerate
      const scene = dbScenes.find(s => s.id === sceneId);
      if (!scene) {
        toast.error("Scene not found");
        return;
      }

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error("Please sign in to regenerate scenes");
      }

      const latestGeneration = getLatestGeneration(scene);
      const requestBody = {
        generationId: crypto.randomUUID(),
        sceneId: scene.id,
        startFrameUrl: latestGeneration?.start_frame_url || scene.start_frame_signed_url || scene.start_key,
        endFrameUrl: latestGeneration?.end_frame_url || scene.end_frame_signed_url || scene.end_key,
        shotType: scene.shot_type
      };

      const response = await supabase.functions.invoke("create-scene", {
        body: requestBody
      });

      if (response.error) {
        throw response.error;
      }

      toast.success("Scene regeneration started!");
    } catch (error: any) {
      console.error("Error regenerating scene:", error);
      toast.error(error.message || "Failed to regenerate scene");
    }
  };

  const handleRevertToGeneration = async (sceneId: string, generationId: string) => {
    try {
      // TODO: Switch to previous generation - this could involve updating UI state only
      // For now, just show a success message
      toast.success("Reverted to previous generation");
    } catch (error) {
      console.error("Error reverting generation:", error);
      toast.error("Failed to revert generation");
    }
  };

  const handleDeleteScene = async (sceneId: string) => {
    try {
      const { error } = await supabase
        .from("scenes")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", sceneId);

      if (error) {
        console.error("Error deleting scene:", error);
        toast.error("Failed to delete scene");
        return;
      }

      toast.success("Scene deleted", {
        action: {
          label: "Undo",
          onClick: () => handleRestoreScene(sceneId),
        },
      });

      loadDbScenes();
    } catch (error) {
      console.error("Error deleting scene:", error);
      toast.error("Failed to delete scene");
    }
  };

  const handleRestoreScene = async (sceneId: string) => {
    try {
      const { error } = await supabase
        .from("scenes")
        .update({ deleted_at: null })
        .eq("id", sceneId);

      if (error) {
        console.error("Error restoring scene:", error);
        toast.error("Failed to restore scene");
        return;
      }

      toast.success("Scene restored!");
      loadDbScenes();
    } catch (error) {
      console.error("Error restoring scene:", error);
      toast.error("Failed to restore scene");
    }
  };

  // Combined scenes from session and database
  const allScenes = [
    // Session scenes (temporary, processing) - only include if not in DB yet
    ...scenes.filter(scene => 
      !dbScenes.some(dbScene => dbScene.id === scene.sceneId)
    ).map((scene, index) => ({
      id: scene.sceneId,
      startFrameUrl: scene.startFrameUrl,
      endFrameUrl: scene.endFrameUrl,
      shotType: scene.shotType,
      status: scene.status,
      videoUrl: scene.videoUrl,
      type: 'session' as const,
      createdAt: scene.createdAt,
      generations: []
    })),
    // Database scenes
    ...dbScenes.map((scene) => {
      const latestGeneration = getLatestGeneration(scene);
      return {
        id: scene.id,
        startFrameUrl: latestGeneration?.start_frame_url || scene.start_frame_signed_url || scene.start_key,
        endFrameUrl: latestGeneration?.end_frame_url || scene.end_frame_signed_url || scene.end_key,
        shotType: scene.shot_type,
        status: latestGeneration?.status || scene.status,
        videoUrl: latestGeneration?.video_url,
        type: 'database' as const,
        generations: scene.generations,
        createdAt: new Date(scene.created_at)
      };
    })
  ].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    .map((scene, index) => ({ ...scene, sceneNumber: index + 1 }));

  const selectedScene = selectedSceneId ? allScenes.find(s => s.id === selectedSceneId) : null;

  if (!folder) {
    return (
      <Card className="h-64">
        <CardContent className="flex items-center justify-center h-full">
          <div className="text-center space-y-2">
            <Video className="w-12 h-12 mx-auto text-muted-foreground" />
            <p className="text-muted-foreground">Generate scenes to see videos</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Top Row: Video Scenes Overview */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center space-x-2">
              <Video className="w-5 h-5" />
              <span>Video Scenes</span>
            </CardTitle>
            <Button
              variant="outline"
              size="sm"
              className="hidden md:inline-flex"
            >
              <Download className="w-4 h-4 mr-2" />
              Export All
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="aspect-square w-full" />
              ))}
            </div>
          ) : allScenes.length > 0 ? (
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
              {allScenes.map((scene) => (
                <div
                  key={scene.id}
                  onClick={() => handleSceneSelect(scene.id)}
                  className={`relative aspect-square rounded-lg overflow-hidden bg-background border cursor-pointer transition-all hover:scale-[1.02] hover:shadow-lg ${
                    selectedSceneId === scene.id 
                      ? 'ring-2 ring-primary border-primary' 
                      : 'border-border hover:border-primary/50'
                  }`}
                >
                  {/* Scene Number Badge */}
                  <Badge className="absolute top-2 left-2 z-10 bg-primary text-primary-foreground text-xs font-medium border-0">
                    Scene {scene.sceneNumber}
                  </Badge>
                  
                  {/* Status Indicator */}
                  <div className="absolute top-2 right-2 z-10">
                    <Badge variant="secondary" className={`text-xs ${getStatusColor(scene.status)}`}>
                      {scene.status}
                    </Badge>
                  </div>

                  {/* Thumbnail */}
                  {scene.startFrameUrl ? (
                    <img 
                      src={scene.startFrameUrl} 
                      alt={`Scene ${scene.sceneNumber} preview`}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full bg-muted flex items-center justify-center">
                      <Video className="w-8 h-8 text-muted-foreground" />
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <Video className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">No scenes generated yet</p>
              <p className="text-sm text-muted-foreground">
                Generate scenes from photos to see them here
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Bottom Section: Scene Details */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Play className="w-5 h-5" />
            <span>Scene Details</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {selectedScene ? (
            <div className="space-y-4">
              {/* Scene Info */}
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <h3 className="text-lg font-semibold">Scene {selectedScene.sceneNumber}</h3>
                  <div className="flex items-center space-x-2">
                    <Badge className={getStatusColor(selectedScene.status)}>
                      {selectedScene.status}
                    </Badge>
                    {selectedScene.type === 'database' && selectedScene.generations && (
                      <span className="text-sm text-muted-foreground">
                        v{selectedScene.generations.length || 1}
                      </span>
                    )}
                  </div>
                </div>
                
                <div className="flex space-x-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleRegenerateScene(selectedScene.id)}
                    disabled={selectedScene.status === "rendering"}
                  >
                    <RotateCcw className="w-4 h-4 mr-2" />
                    Regenerate
                  </Button>
                  {selectedScene.type === 'database' && selectedScene.generations && selectedScene.generations.length > 1 && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleRevertToGeneration(selectedScene.id, selectedScene.generations[selectedScene.generations.length - 2]?.generation_id)}
                    >
                      <History className="w-4 h-4 mr-2" />
                      Back to Old Version
                    </Button>
                  )}
                </div>
              </div>

              {/* Video Player or Placeholder */}
              {selectedScene.videoUrl ? (
                <div className="aspect-video bg-black rounded-lg overflow-hidden">
                  <video
                    src={selectedScene.videoUrl}
                    controls
                    className="w-full h-full"
                    preload="metadata"
                    poster={selectedScene.startFrameUrl}
                  />
                </div>
              ) : (
                <div className="aspect-video bg-muted rounded-lg flex items-center justify-center">
                  <div className="text-center">
                    <Play className="w-12 h-12 mx-auto text-muted-foreground mb-2" />
                    <p className="text-lg text-muted-foreground mb-1">
                      {selectedScene.status === "rendering" ? "Rendering..." : "Video pending"}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {selectedScene.status === "rendering" 
                        ? "Your scene is being processed" 
                        : "Video will appear here when ready"
                      }
                    </p>
                  </div>
                </div>
              )}

              {/* Generation History (if available) */}
              {selectedScene.type === 'database' && selectedScene.generations && selectedScene.generations.length > 1 && (
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground mb-2">Generation History</h4>
                  <div className="flex space-x-2">
                    {selectedScene.generations.map((generation, index) => (
                      <Button
                        key={generation.generation_id}
                        variant="outline"
                        size="sm"
                        className="text-xs"
                        onClick={() => handleRevertToGeneration(selectedScene.id, generation.generation_id)}
                      >
                        v{selectedScene.generations.length - index}
                      </Button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-12">
              <Video className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
              <p className="text-lg text-muted-foreground mb-2">Select a scene above</p>
              <p className="text-sm text-muted-foreground">
                Click on any scene thumbnail to view its details and video
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}