import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Images, Play, Loader2, Upload, FolderOpen, X, ChevronDown, ChevronUp } from "lucide-react";
import { useHotkeys } from "react-hotkeys-hook";
import { useApi } from "@/hooks/useApi";

interface Photo {
  key: string;
  url: string;
  name: string;
}

interface PhotoGridProps {
  projectName: string;
  selectedStart: string;
  selectedEnd: string;
  selectedShotType: number;
  onPhotoSelect: (photoUrl: string, type: "start" | "end") => void;
  onShotTypeSelect: (shotType: number) => void;
  onSceneGenerate: (sceneData: { startFrameUrl: string; endFrameUrl?: string; shotType: number }) => void;
  onUploadComplete: (folder: string, files: string[]) => void;
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
  projectName,
  selectedStart,
  selectedEnd,
  selectedShotType,
  onPhotoSelect,
  onShotTypeSelect,
  onSceneGenerate,
  onUploadComplete,
}: PhotoGridProps) {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [loading, setLoading] = useState(false);
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);
  const { execute: fetchPhotos } = useApi();
  
  // Upload functionality states
  const [folderName, setFolderName] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [selectedFiles, setSelectedFiles] = useState<FileList | null>(null);
  const [showUploadExpanded, setShowUploadExpanded] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const loadPhotos = async () => {
      if (!projectName) {
        setPhotos([]);
        return;
      }

      setLoading(true);
      
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) {
          throw new Error('No session found');
        }

        const functionUrl = `https://fmizfozbyrohydcutkgg.functions.supabase.co/photos-from-storage?project=${encodeURIComponent(projectName)}`;
        console.log(`Fetching photos from: ${functionUrl}`);
        
        const response = await fetch(functionUrl, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
        });

        console.log(`Response status: ${response.status}`);

        if (!response.ok) {
          const errorText = await response.text();
          console.error(`HTTP Error: ${response.status} - ${errorText}`);
          throw new Error(`HTTP ${response.status}: ${errorText}`);
        }

        const result = await response.json();
        console.log('API Response:', result);
        
        if (!result.ok) {
          throw new Error(result.error?.message || 'Failed to fetch photos');
        }

        const photos = result.data?.photos || [];
        console.log(`Found ${photos.length} photos for project ${projectName}`);
        setPhotos(photos);
      } catch (error) {
        console.error("Error loading photos:", error);
        const errorMessage = error instanceof Error ? error.message : 'Failed to load photos';
        toast.error(`${errorMessage} for project: ${projectName}`);
        setPhotos([]);
      } finally {
        setLoading(false);
      }
    };

    loadPhotos();
  }, [projectName]);


  // Hotkey handlers
  useHotkeys('s', () => {
    if (hoveredKey) {
      const photo = photos.find(p => p.key === hoveredKey);
      if (photo) {
        if (selectedStart === photo.url) {
          onPhotoSelect("", "start"); // Clear start if same image
        } else {
          onPhotoSelect(photo.url, "start");
        }
      }
    }
  }, { enableOnFormTags: false }, [hoveredKey, selectedStart, onPhotoSelect, photos]);

  useHotkeys('e', () => {
    if (hoveredKey) {
      const photo = photos.find(p => p.key === hoveredKey);
      if (photo) {
        if (selectedEnd === photo.url) {
          onPhotoSelect("", "end"); // Clear end if same image
        } else {
          onPhotoSelect(photo.url, "end");
        }
      }
    }
  }, { enableOnFormTags: false }, [hoveredKey, selectedEnd, onPhotoSelect, photos]);

  // Shot type hotkeys
  useHotkeys('1', () => onShotTypeSelect(1), { enableOnFormTags: false }, [onShotTypeSelect]);
  useHotkeys('2', () => onShotTypeSelect(2), { enableOnFormTags: false }, [onShotTypeSelect]);
  useHotkeys('3', () => onShotTypeSelect(3), { enableOnFormTags: false }, [onShotTypeSelect]);
  useHotkeys('4', () => onShotTypeSelect(4), { enableOnFormTags: false }, [onShotTypeSelect]);
  useHotkeys('5', () => onShotTypeSelect(5), { enableOnFormTags: false }, [onShotTypeSelect]);
  useHotkeys('6', () => onShotTypeSelect(6), { enableOnFormTags: false }, [onShotTypeSelect]);

  const handleImageClick = (photo: Photo, e: React.MouseEvent) => {
    if (e.shiftKey) {
      onPhotoSelect(photo.url, "end");
    } else {
      onPhotoSelect(photo.url, "start");
    }
  };

  const canGenerateScene = selectedStart && projectName;

  // Get filename from storage key for display
  const getFilename = (storageKey: string) => {
    return storageKey.split('/').pop() || storageKey;
  };

  const handleGenerateScene = async () => {
    if (!canGenerateScene) return;

    const sceneData = {
      startFrameUrl: selectedStart,
      endFrameUrl: selectedEnd || undefined,
      shotType: selectedShotType
    };

    // Call parent handler to create immediate scene card
    onSceneGenerate(sceneData);
  };

  // Upload functionality
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      setSelectedFiles(files);
      // Auto-generate folder name from first few files if not set
      if (!folderName) {
        const baseName = files[0].name.split('.')[0];
        setFolderName(`folder-${baseName}`);
      }
    }
  };

  const handleFolderSelect = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleUpload = async () => {
    if (!folderName.trim()) {
      toast.error("Please enter a folder name");
      return;
    }

    if (!selectedFiles || selectedFiles.length === 0) {
      toast.error("Please select files to upload");
      return;
    }

    setUploading(true);
    setUploadProgress(0);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error("User not authenticated");
      }

      const uploadedFiles: string[] = [];
      const totalFiles = selectedFiles.length;

      for (let i = 0; i < totalFiles; i++) {
        const file = selectedFiles[i];
        const fileName = file.name;
        const filePath = `Photos/${folderName}/${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from("media")
          .upload(filePath, file, {
            cacheControl: "3600",
            upsert: false
          });

        if (uploadError) {
          console.error("Upload error:", uploadError);
          toast.error(`Failed to upload ${fileName}`);
          continue;
        }

        uploadedFiles.push(fileName);
        setUploadProgress(Math.round(((i + 1) / totalFiles) * 100));
      }

      if (uploadedFiles.length > 0) {
        onUploadComplete(folderName, uploadedFiles);
        
        // Reset form
        setFolderName("");
        setSelectedFiles(null);
        setUploadProgress(0);
        setShowUploadExpanded(false);
        
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
      } else {
        toast.error("No files were uploaded successfully");
      }
    } catch (error) {
      console.error("Upload error:", error);
      toast.error("Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const clearSelection = () => {
    setSelectedFiles(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  // Render upload interface when no project or no photos
  const renderUploadInterface = () => (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Folder Name Input */}
        <div className="space-y-2">
          <Label htmlFor="folder-name">Folder Name</Label>
          <Input
            id="folder-name"
            placeholder="Enter folder name"
            value={folderName}
            onChange={(e) => setFolderName(e.target.value)}
            disabled={uploading}
          />
        </div>

        {/* File Selection */}
        <div className="space-y-2">
          <Label>Select Files</Label>
          <div className="flex space-x-2">
            <Button
              variant="outline"
              onClick={handleFolderSelect}
              disabled={uploading}
              className="flex-1"
            >
              <FolderOpen className="w-4 h-4 mr-2" />
              Choose Files
            </Button>
            {selectedFiles && (
              <Button
                variant="ghost"
                size="sm"
                onClick={clearSelection}
                disabled={uploading}
              >
                <X className="w-4 h-4" />
              </Button>
            )}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/*,video/*"
            onChange={handleFileSelect}
            className="hidden"
          />
        </div>

        {/* Upload Button */}
        <div className="space-y-2">
          <Label>&nbsp;</Label>
          <Button
            onClick={handleUpload}
            disabled={uploading || !folderName.trim() || !selectedFiles}
            className="w-full bg-gradient-to-r from-primary to-accent hover:opacity-90"
          >
            {uploading ? "Uploading..." : "Upload"}
          </Button>
        </div>
      </div>

      {/* File List and Progress */}
      {selectedFiles && (
        <div className="space-y-2">
          <div className="text-sm text-muted-foreground">
            {selectedFiles.length} file(s) selected
          </div>
          {uploading && (
            <div className="space-y-2">
              <Progress value={uploadProgress} className="h-2" />
              <div className="text-sm text-muted-foreground text-center">
                {uploadProgress}% complete
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );

  if (!projectName) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center space-x-2">
            <Upload className="w-5 h-5 text-primary" />
            <CardTitle>Upload Photos</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          {renderUploadInterface()}
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
            <span>Photo Grid</span>
          </CardTitle>
          <div className="flex items-center space-x-2">
            <div className="text-sm text-muted-foreground">
              {photos.length} images
            </div>
            {photos.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowUploadExpanded(!showUploadExpanded)}
                className="h-8 w-8 p-0"
              >
                <Upload className="w-4 h-4" />
              </Button>
            )}
          </div>
        </div>
        
        {/* Compact upload interface when photos exist */}
        {photos.length > 0 && showUploadExpanded && (
          <div className="mt-4 p-4 border rounded-lg bg-muted/30">
            <div className="flex items-center justify-between mb-3">
              <div className="text-sm font-medium">Upload More Photos</div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowUploadExpanded(false)}
                className="h-6 w-6 p-0"
              >
                <X className="w-3 h-3" />
              </Button>
            </div>
            {renderUploadInterface()}
          </div>
        )}
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
            {Array.from({ length: Math.min(photos.length || 8, 8) }).map((_, i) => (
              <div
                key={i}
                className="aspect-square bg-muted animate-pulse rounded-lg"
              />
            ))}
          </div>
        ) : photos.length === 0 ? (
          <div className="space-y-4">
            <div className="text-center py-8">
              <Images className="w-12 h-12 mx-auto text-muted-foreground mb-2" />
              <p className="text-muted-foreground">No photos found for project: {projectName}</p>
              <Button 
                variant="outline" 
                size="sm" 
                className="mt-2"
                onClick={() => setShowUploadExpanded(!showUploadExpanded)}
              >
                <Upload className="w-4 h-4 mr-2" />
                Upload Photos
              </Button>
            </div>
            
            {/* Upload interface when no photos */}
            {showUploadExpanded && (
              <div className="border-t pt-4">
                {renderUploadInterface()}
              </div>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {photos.map((photo) => {
              const isStart = selectedStart === photo.url;
              const isEnd = selectedEnd === photo.url;
              const isHovered = hoveredKey === photo.key;
              const url = photo.url;
              const isSameImage = isStart && isEnd;
              const filename = photo.name;

              return (
                <div
                  key={photo.key}
                  className={`relative aspect-square rounded-lg overflow-hidden cursor-pointer transition-all hover:scale-105 ${
                    isStart || isEnd ? "ring-2 ring-primary shadow-lg" : ""
                  }`}
                  onClick={(e) => handleImageClick(photo, e)}
                  onMouseEnter={() => setHoveredKey(photo.key)}
                  onMouseLeave={() => setHoveredKey(null)}
                  title={isSameImage ? "Start = End (single frame)" : ""}
                >
                  {url ? (
                    <img
                      src={url}
                      alt={filename}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full bg-muted flex items-center justify-center">
                      <Images className="w-8 h-8 text-muted-foreground" />
                    </div>
                  )}
                  
                  {/* Ghost badges on hover */}
                  {isHovered && !isStart && !isEnd && (
                    <>
                      <Badge variant="outline" className="absolute top-2 left-2 opacity-50 bg-background/80">
                        S
                      </Badge>
                      <Badge variant="outline" className="absolute top-2 right-2 opacity-50 bg-background/80">
                        E
                      </Badge>
                    </>
                  )}
                  
                  {/* Actual badges */}
                  {isStart && (
                    <Badge className="absolute top-2 left-2 bg-green-500 hover:bg-green-600 text-white">
                      S
                    </Badge>
                  )}
                  {isEnd && (
                    <Badge className="absolute top-2 right-2 bg-blue-500 hover:bg-blue-600 text-white">
                      E
                    </Badge>
                  )}
                  
                  {/* Single frame indicator */}
                  {isSameImage && (
                    <Badge className="absolute top-2 left-1/2 transform -translate-x-1/2 bg-purple-500 text-white text-xs">
                      Single
                    </Badge>
                  )}
                  
                  {/* Filename */}
                  <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-2">
                    <div className="text-white text-xs truncate">{filename}</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Generate Scene Button */}
        <div className="flex flex-col items-center pt-4 space-y-2">
          <Button
            onClick={handleGenerateScene}
            disabled={!canGenerateScene || loading}
            className="bg-gradient-to-r from-primary to-accent hover:opacity-90"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Play className="w-4 h-4 mr-2" />
                Generate Scene
              </>
            )}
          </Button>
          {selectedStart && !selectedEnd && (
            <p className="text-xs text-muted-foreground">End optional</p>
          )}
          {selectedEnd && !selectedStart && (
            <p className="text-xs text-orange-500">Set Start (S) first</p>
          )}
        </div>

        {/* Instructions */}
        <div className="text-xs text-muted-foreground text-center space-y-1">
          <p>Hover image then press <kbd className="px-1 py-0.5 bg-muted rounded text-xs">S</kbd> to set Start, <kbd className="px-1 py-0.5 bg-muted rounded text-xs">E</kbd> to set End. End is optional.</p>
          <p>Click to set Start • Shift+Click to set End • Keys <kbd className="px-1 py-0.5 bg-muted rounded text-xs">1-6</kbd> for shot type</p>
        </div>
      </CardContent>
    </Card>
  );
}