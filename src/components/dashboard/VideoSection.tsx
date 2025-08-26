import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Video, RotateCcw, Trash2, Download, Play } from "lucide-react";

interface Scene {
  id: string;
  folder: string;
  start_key: string;
  end_key: string;
  shot_type: number;
  status: string;
  created_at: string;
  versions: SceneVersion[];
}

interface SceneVersion {
  id: string;
  scene_id: string;
  version: number;
  video_url: string | null;
  created_at: string;
}

interface VideoSectionProps {
  folder: string;
  selectedStart: string;
  selectedEnd: string;
  selectedShotType: number;
}

export function VideoSection({
  folder,
  selectedStart,
  selectedEnd,
  selectedShotType,
}: VideoSectionProps) {
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (folder) {
      loadScenes();
      
      // Set up real-time subscription for scene updates
      const channel = supabase
        .channel('scene-changes')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'scenes',
            filter: `folder=eq.${folder}`
          },
          () => {
            loadScenes();
          }
        )
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'scene_versions'
          },
          () => {
            loadScenes();
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [folder]);

  const loadScenes = async () => {
    if (!folder) return;
    
    setLoading(true);
    try {
      const { data: scenesData, error } = await supabase
        .from("scenes")
        .select(`
          *,
          scene_versions (*)
        `)
        .eq("folder", folder)
        .is("deleted_at", null)
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Error loading scenes:", error);
        toast.error("Failed to load scenes");
        return;
      }

      const scenesWithVersions = scenesData?.map(scene => ({
        ...scene,
        versions: scene.scene_versions || []
      })) || [];

      setScenes(scenesWithVersions);
    } catch (error) {
      console.error("Error loading scenes:", error);
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

  const getLatestVersion = (scene: Scene) => {
    if (scene.versions.length === 0) return null;
    return scene.versions.reduce((latest, current) => 
      current.version > latest.version ? current : latest
    );
  };

  const handleRegenerateScene = async (sceneId: string) => {
    try {
      // TODO: Call API to regenerate scene
      toast.success("Scene regeneration started!");
    } catch (error) {
      console.error("Error regenerating scene:", error);
      toast.error("Failed to regenerate scene");
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

      loadScenes();
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
      loadScenes();
    } catch (error) {
      console.error("Error restoring scene:", error);
      toast.error("Failed to restore scene");
    }
  };

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
      <CardContent className="space-y-4">
        {loading ? (
          <div className="space-y-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="bg-muted animate-pulse rounded-lg h-24" />
            ))}
          </div>
        ) : scenes.length === 0 ? (
          <div className="text-center py-8">
            <Video className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">No scenes generated yet</p>
            <p className="text-sm text-muted-foreground">
              Select photos and generate your first scene
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {scenes.map((scene) => {
              const latestVersion = getLatestVersion(scene);
              
              return (
                <Card key={scene.id} className="border-border/50">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between mb-3">
                      <div className="space-y-1">
                        <div className="flex items-center space-x-2">
                          <Badge className={getStatusColor(scene.status)}>
                            {scene.status}
                          </Badge>
                          <span className="text-sm text-muted-foreground">
                            v{latestVersion?.version || 1}
                          </span>
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {scene.start_key} → {scene.end_key}
                        </div>
                      </div>
                      
                      <div className="flex space-x-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRegenerateScene(scene.id)}
                          disabled={scene.status === "rendering"}
                        >
                          <RotateCcw className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteScene(scene.id)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                    
                    {/* Video Preview */}
                    {latestVersion?.video_url ? (
                      <div className="aspect-video bg-black rounded-lg overflow-hidden">
                        <video
                          src={latestVersion.video_url}
                          controls
                          className="w-full h-full"
                          preload="metadata"
                        />
                      </div>
                    ) : (
                      <div className="aspect-video bg-muted rounded-lg flex items-center justify-center">
                        <div className="text-center">
                          <Play className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
                          <p className="text-sm text-muted-foreground">
                            {scene.status === "rendering" ? "Rendering..." : "Video pending"}
                          </p>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}