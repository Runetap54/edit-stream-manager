import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Images, Play } from "lucide-react";

interface PhotoGridProps {
  folder: string;
  files: string[];
  selectedStart: string;
  selectedEnd: string;
  selectedShotType: number;
  onPhotoSelect: (filename: string, type: "start" | "end") => void;
  onShotTypeSelect: (shotType: number) => void;
}

const shotTypes = [
  { id: 1, name: "Wide Shot", key: "1" },
  { id: 2, name: "Medium Shot", key: "2" },
  { id: 3, name: "Close-up", key: "3" },
  { id: 4, name: "Extreme Close-up", key: "4" },
  { id: 5, name: "Over Shoulder", key: "5" },
  { id: 6, name: "Point of View", key: "6" },
];

export function PhotoGrid({
  folder,
  files,
  selectedStart,
  selectedEnd,
  selectedShotType,
  onPhotoSelect,
  onShotTypeSelect,
}: PhotoGridProps) {
  const [imageUrls, setImageUrls] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const loadImages = async () => {
      if (!folder || files.length === 0) {
        setImageUrls({});
        return;
      }

      setLoading(true);
      const urls: Record<string, string> = {};
      
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        for (const file of files) {
          const filePath = `${user.id}/${folder}/${file}`;
          const { data } = await supabase.storage
            .from("media")
            .createSignedUrl(filePath, 3600); // 1 hour expiry

          if (data?.signedUrl) {
            urls[file] = data.signedUrl;
          }
        }
        
        setImageUrls(urls);
      } catch (error) {
        console.error("Error loading images:", error);
        toast.error("Failed to load images");
      } finally {
        setLoading(false);
      }
    };

    loadImages();
  }, [folder, files]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      
      switch (e.key.toLowerCase()) {
        case 's':
          // Mark start
          break;
        case 'e':
          // Mark end
          break;
        case '1':
        case '2':
        case '3':
        case '4':
        case '5':
        case '6':
          onShotTypeSelect(parseInt(e.key));
          break;
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [onShotTypeSelect]);

  const handleImageClick = (filename: string, e: React.MouseEvent) => {
    if (e.shiftKey) {
      onPhotoSelect(filename, "end");
    } else {
      onPhotoSelect(filename, "start");
    }
  };

  const canGenerateScene = selectedStart && selectedEnd && folder;

  const handleGenerateScene = async () => {
    if (!canGenerateScene) return;

    try {
      // TODO: Call API to create scene
      toast.success("Scene generation started!");
    } catch (error) {
      console.error("Error generating scene:", error);
      toast.error("Failed to generate scene");
    }
  };

  if (!folder) {
    return (
      <Card className="h-64">
        <CardContent className="flex items-center justify-center h-full">
          <div className="text-center space-y-2">
            <Images className="w-12 h-12 mx-auto text-muted-foreground" />
            <p className="text-muted-foreground">Upload photos to get started</p>
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
            <Images className="w-5 h-5" />
            <span>Photo Grid - {folder}</span>
          </CardTitle>
          <div className="text-sm text-muted-foreground">
            {files.length} images
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Shot Type Selection */}
        <div className="space-y-2">
          <div className="text-sm font-medium">Shot Type</div>
          <div className="flex flex-wrap gap-2">
            {shotTypes.map((type) => (
              <Button
                key={type.id}
                variant={selectedShotType === type.id ? "default" : "outline"}
                size="sm"
                onClick={() => onShotTypeSelect(type.id)}
                className="text-xs"
              >
                {type.key}. {type.name}
              </Button>
            ))}
          </div>
        </div>

        {/* Photo Grid */}
        {loading ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {Array.from({ length: Math.min(files.length, 8) }).map((_, i) => (
              <div
                key={i}
                className="aspect-square bg-muted animate-pulse rounded-lg"
              />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {files.map((file) => {
              const isStart = selectedStart === file;
              const isEnd = selectedEnd === file;
              const url = imageUrls[file];

              return (
                <div
                  key={file}
                  className={`relative aspect-square rounded-lg overflow-hidden cursor-pointer transition-all hover:scale-105 ${
                    isStart || isEnd ? "ring-2 ring-primary shadow-lg" : ""
                  }`}
                  onClick={(e) => handleImageClick(file, e)}
                >
                  {url ? (
                    <img
                      src={url}
                      alt={file}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full bg-muted flex items-center justify-center">
                      <Images className="w-8 h-8 text-muted-foreground" />
                    </div>
                  )}
                  
                  {/* Badges */}
                  {isStart && (
                    <Badge className="absolute top-2 left-2 bg-green-500 hover:bg-green-600">
                      S
                    </Badge>
                  )}
                  {isEnd && (
                    <Badge className="absolute top-2 right-2 bg-red-500 hover:bg-red-600">
                      E
                    </Badge>
                  )}
                  
                  {/* Filename */}
                  <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-2">
                    <div className="text-white text-xs truncate">{file}</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Generate Scene Button */}
        <div className="flex justify-center pt-4">
          <Button
            onClick={handleGenerateScene}
            disabled={!canGenerateScene}
            className="bg-gradient-to-r from-primary to-accent hover:opacity-90"
          >
            <Play className="w-4 h-4 mr-2" />
            Generate Scene
          </Button>
        </div>

        {/* Instructions */}
        <div className="text-xs text-muted-foreground text-center space-y-1">
          <p>Click image to mark Start • Shift+Click to mark End</p>
          <p>Use keys 1-6 to select shot type • S/E for start/end</p>
        </div>
      </CardContent>
    </Card>
  );
}