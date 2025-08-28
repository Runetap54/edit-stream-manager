import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Images, Play, Loader2, Upload, FolderOpen, X, Settings, Trash2 } from "lucide-react";
import { useHotkeys } from "react-hotkeys-hook";
import { useApi } from "@/hooks/useApi";
import { useShotTypes } from "@/hooks/useShotTypes";
import { ShotTypesManager } from "@/components/dashboard/ShotTypesManager";

interface Photo {
  key: string;   // storage key e.g. "Photos/<project>/<filename>"
  url: string;   // public/signed url
  name: string;  // filename
}

interface PhotoGridProps {
  projectName: string;
  selectedStart: string;
  selectedEnd: string;
  selectedShotTypeId: string | null;
  onPhotoSelect: (photoUrl: string, type: "start" | "end") => void;
  onShotTypeSelect: (shotTypeId: string) => void;
  onSceneGenerate: (sceneData: { startFrameUrl: string; endFrameUrl?: string; shotTypeId: string }) => void;
  onUploadComplete: (folder: string, files: string[]) => void;
  hideShotTypes?: boolean;
  renderShotTypesOnly?: boolean;
}

export function PhotoGrid({
  projectName,
  selectedStart,
  selectedEnd,
  selectedShotTypeId,
  onPhotoSelect,
  onShotTypeSelect,
  onSceneGenerate,
  onUploadComplete,
  hideShotTypes = false,
  renderShotTypesOnly = false,
}: PhotoGridProps) {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [loading, setLoading] = useState(false);
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);

  const { execute: fetchPhotos } = useApi();
  const { shotTypes, loading: shotTypesLoading } = useShotTypes();

  // Upload state
  const [folderName, setFolderName] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [selectedFiles, setSelectedFiles] = useState<FileList | null>(null);
  const [showUploadExpanded, setShowUploadExpanded] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Load photos for current project
  useEffect(() => {
    const loadPhotos = async () => {
      if (!projectName) {
        setPhotos([]);
        return;
      }
      setLoading(true);
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) throw new Error("No session found");

        const functionUrl = `https://fmizfozbyrohydcutkgg.functions.supabase.co/photos-from-storage?project=${encodeURIComponent(projectName)}`;
        const response = await fetch(functionUrl, {
          method: "GET",
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            "Content-Type": "application/json",
          },
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`HTTP ${response.status}: ${errorText}`);
        }

        const result = await response.json();
        if (!result.ok) throw new Error(result.error?.message || "Failed to fetch photos");

        setPhotos(result.data?.photos || []);
      } catch (error) {
        const msg = error instanceof Error ? error.message : "Failed to load photos";
        toast.error(`${msg} for project: ${projectName}`);
        setPhotos([]);
      } finally {
        setLoading(false);
      }
    };
    loadPhotos();
  }, [projectName]);

  // Hotkeys: S / E to select start/end
  useHotkeys(
    "s",
    () => {
      if (!hoveredKey) return;
      const photo = photos.find((p) => p.key === hoveredKey);
      if (!photo) return;
      if (selectedStart === photo.url) onPhotoSelect("", "start");
      else onPhotoSelect(photo.url, "start");
    },
    { enableOnFormTags: false },
    [hoveredKey, selectedStart, onPhotoSelect, photos]
  );

  useHotkeys(
    "e",
    () => {
      if (!hoveredKey) return;
      const photo = photos.find((p) => p.key === hoveredKey);
      if (!photo) return;
      if (selectedEnd === photo.url) onPhotoSelect("", "end");
      else onPhotoSelect(photo.url, "end");
    },
    { enableOnFormTags: false },
    [hoveredKey, selectedEnd, onPhotoSelect, photos]
  );

  // 🔥 NEW: Del hotkey to delete hovered photo
  useHotkeys(
    "del",
    () => {
      if (!hoveredKey) return;
      deletePhotoByKey(hoveredKey).catch((e) => {
        console.error(e);
        toast.error("Delete failed");
      });
    },
    { enableOnFormTags: false },
    [hoveredKey]
  );

  const handleImageClick = (photo: Photo, e: React.MouseEvent) => {
    if (e.shiftKey) onPhotoSelect(photo.url, "end");
    else onPhotoSelect(photo.url, "start");
  };

  const getFilename = (storageKey: string) => storageKey.split("/").pop() || storageKey;

  // ===== Helpers ===================================================

  // Ensure a DB project row exists for this user (first-time upload)
  async function ensureProjectExists(name: string) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("User not authenticated");

    const { data: existing } = await supabase
      .from("projects")
      .select("id")
      .eq("name", name)
      .eq("owner_id", user.id)
      .maybeSingle();

    if (existing) return;

    const { error: insErr } = await supabase
      .from("projects")
      .insert({ name, owner_id: user.id });

    if (insErr) throw insErr;
  }

  async function deletePhotoByKey(storageKey: string) {
    const { error } = await supabase.storage.from("media").remove([storageKey]);
    if (error) throw error;
    setPhotos((prev) => prev.filter((p) => p.key !== storageKey));
    toast.success("Photo deleted");
  }

  // ===== Upload flow ===============================================

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      setSelectedFiles(files);
      // Prefill a folder name if creating a new project
      if (!folderName) {
        const baseName = files[0].name.split(".")[0];
        setFolderName(`folder-${baseName}`);
      }
    }
  };

  const handleFolderSelect = () => fileInputRef.current?.click();

  const handleUpload = async () => {
    const isAddingToProject = photos.length > 0 && projectName;

    if (!isAddingToProject && !folderName.trim()) {
      toast.error("Please enter a project name");
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
      if (!user) throw new Error("User not authenticated");

      // Determine target folder (existing project or new)
      const targetFolder = isAddingToProject ? projectName : folderName;

      // ✅ Ensure DB project row exists on first upload
      if (!isAddingToProject) {
        await ensureProjectExists(targetFolder);
      }

      const uploadedFiles: string[] = [];
      const totalFiles = selectedFiles.length;

      for (let i = 0; i < totalFiles; i++) {
        const file = selectedFiles[i];
        const fileName = file.name;
        const filePath = `Photos/${targetFolder}/${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from("media")
          .upload(filePath, file, { cacheControl: "3600", upsert: false });

        if (uploadError) {
          console.error("Upload error:", uploadError);
          toast.error(`Failed to upload ${fileName}`);
          continue;
        }

        uploadedFiles.push(fileName);
        setUploadProgress(Math.round(((i + 1) / totalFiles) * 100));
      }

      if (uploadedFiles.length > 0) {
        if (isAddingToProject) {
          toast.success(`Added ${uploadedFiles.length} photos to ${projectName}`);
        } else {
          // Notify parent that a new project was created via upload
          onUploadComplete(targetFolder, uploadedFiles);
        }

        // reset UI
        setFolderName("");
        setSelectedFiles(null);
        setUploadProgress(0);
        setShowUploadExpanded(false);
        if (fileInputRef.current) fileInputRef.current.value = "";

        // Refresh photos for the current/new project
        const currentProject = projectName || targetFolder;
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          const functionUrl = `https://fmizfozbyrohydcutkgg.functions.supabase.co/photos-from-storage?project=${encodeURIComponent(
            currentProject
          )}`;
          const response = await fetch(functionUrl, {
            method: "GET",
            headers: {
              Authorization: `Bearer ${session.access_token}`,
              "Content-Type": "application/json",
            },
          });
          if (response.ok) {
            const result = await response.json();
            if (result.ok) setPhotos(result.data?.photos || []);
          }
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

  // ===== UI bits ====================================================

  if (renderShotTypesOnly) {
    return (
      <div className="w-full">
        <Label className="mb-2 block">Shot Type</Label>
        <div className="flex flex-wrap gap-2">
          {shotTypesLoading ? (
            <>
              {Array.from({ length: 3 }).map((_, i) => (
                <Badge key={i} variant="secondary" className="opacity-50">
                  …
                </Badge>
              ))}
            </>
          ) : shotTypes.length === 0 ? (
            <div className="text-sm text-muted-foreground">
              No shot types available
              <ShotTypesManager />
            </div>
          ) : (
            shotTypes.map((shotType) => (
              <Button
                key={shotType.id}
                variant="outline"
                size="sm"
                onClick={() => onShotTypeSelect(shotType.id)}
                className="text-xs"
                title={shotType.prompt_template}
              >
                <Badge variant="secondary" className="mr-2">
                  {shotType.hotkey}
                </Badge>
                {shotType.name}
              </Button>
            ))
          )}
        </div>
      </div>
    );
  }

  const renderUploadInterface = () => {
    const isAddingToProject = photos.length > 0 && projectName;

    return (
      <div className="space-y-4">
        {/* Project Name (only when creating) */}
        {!isAddingToProject && (
          <div className="space-y-2">
            <Label htmlFor="folderName">Project Name</Label>
            <Input
              id="folderName"
              value={folderName}
              onChange={(e) => setFolderName(e.target.value)}
              disabled={uploading}
              placeholder="e.g. My Project"
            />
          </div>
        )}

        {/* File selection */}
        <div className="flex items-center gap-2">
          <Input
            type="file"
            multiple
            className="hidden"
            ref={fileInputRef}
            onChange={handleFileSelect}
            accept="image/*"
          />
          <Button variant="outline" onClick={handleFolderSelect}>
            <Upload className="mr-2 h-4 w-4" />
            Select Files
          </Button>

          {selectedFiles && (
            <span className="text-sm text-muted-foreground">
              {selectedFiles.length} file(s) selected
            </span>
          )}
        </div>

        {/* Upload button */}
        <Button onClick={handleUpload} disabled={uploading || (!isAddingToProject && !folderName.trim())}>
          {uploading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Uploading...
            </>
          ) : isAddingToProject ? (
            "Add Photos"
          ) : (
            "Create Project"
          )}
        </Button>

        {/* Progress */}
        {uploading && (
          <div className="space-y-2">
            <Progress value={uploadProgress} />
            <div className="text-xs text-muted-foreground">{uploadProgress}% complete</div>
          </div>
        )}
      </div>
    );
  };

  if (!projectName) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Create New Project</CardTitle>
        </CardHeader>
        <CardContent>{renderUploadInterface()}</CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Photo Grid</h2>
          <p className="text-sm text-muted-foreground">{photos.length} images</p>
        </div>

        {photos.length > 0 && (
          <Button
            variant="ghost"
            onClick={() => setShowUploadExpanded(!showUploadExpanded)}
            className="h-8 w-8 p-0"
            title="Add photos"
          >
            <Upload className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* Compact add-more UI */}
      {photos.length > 0 && showUploadExpanded && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Add More Photos</CardTitle>
            <Button variant="ghost" onClick={() => setShowUploadExpanded(false)} className="h-6 w-6 p-0">
              <X className="h-4 w-4" />
            </Button>
          </CardHeader>
          <CardContent>{renderUploadInterface()}</CardContent>
        </Card>
      )}

      {/* Shot Types */}
      {!hideShotTypes && (
        <div className="space-y-2">
          <Label className="mb-2 block">Shot Type</Label>
          <div className="flex flex-wrap gap-2">
            {shotTypesLoading ? (
              <>
                {Array.from({ length: 3 }).map((_, i) => (
                  <Badge key={i} variant="secondary" className="opacity-50">
                    …
                  </Badge>
                ))}
              </>
            ) : shotTypes.length === 0 ? (
              <div className="text-sm text-muted-foreground">
                No shot types available
                <ShotTypesManager />
              </div>
            ) : (
              shotTypes.map((shotType) => (
                <Button
                  key={shotType.id}
                  variant="outline"
                  size="sm"
                  onClick={() => onShotTypeSelect(shotType.id)}
                  className="text-xs"
                  title={shotType.prompt_template}
                >
                  <Badge variant="secondary" className="mr-2">
                    {shotType.hotkey}
                  </Badge>
                  {shotType.name}
                </Button>
              ))
            )}
          </div>
        </div>
      )}

      {/* Grid */}
      {loading ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {Array.from({ length: 9 }).map((_, i) => (
            <div key={i} className="h-28 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      ) : photos.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center">
            <p className="mb-4 text-sm text-muted-foreground">No photos found for project: {projectName}</p>
            <Button onClick={() => setShowUploadExpanded(!showUploadExpanded)}>
              <Upload className="mr-2 h-4 w-4" />
              Upload Photos
            </Button>
            {showUploadExpanded && <div className="mt-6">{renderUploadInterface()}</div>}
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
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
                className="group relative cursor-pointer overflow-hidden rounded-lg border"
                onClick={(e) => handleImageClick(photo, e)}
                onMouseEnter={() => setHoveredKey(photo.key)}
                onMouseLeave={() => setHoveredKey(null)}
                title={isSameImage ? "Start = End (single frame)" : ""}
              >
                {url ? (
                  <img src={url} alt={filename} className="h-40 w-full object-cover" />
                ) : (
                  <div className="flex h-40 w-full items-center justify-center bg-muted">
                    <Images className="h-6 w-6 text-muted-foreground" />
                  </div>
                )}

                {/* Hover: quick badges */}
                {isHovered && !isStart && !isEnd && (
                  <>
                    <Badge className="absolute left-2 top-2">S</Badge>
                    <Badge className="absolute left-10 top-2">E</Badge>
                  </>
                )}

                {/* Actual badges */}
                {isStart && <Badge className="absolute left-2 top-2">S</Badge>}
                {isEnd && <Badge className="absolute left-10 top-2">E</Badge>}
                {isSameImage && (
                  <Badge variant="secondary" className="absolute left-2 bottom-2">
                    Single
                  </Badge>
                )}

                {/* Filename */}
                <div className="absolute bottom-0 line-clamp-1 w-full bg-black/50 px-2 py-1 text-xs text-white">
                  {filename}
                </div>

                {/* 🔥 Hover delete button */}
                {isHovered && (
                  <button
                    className="absolute right-2 top-2 rounded-md bg-red-600/90 px-2 py-1 text-xs text-white hover:bg-red-700"
                    onClick={(e) => {
                      e.stopPropagation();
                      deletePhotoByKey(photo.key).catch((err) => {
                        console.error(err);
                        toast.error("Delete failed");
                      });
                    }}
                    aria-label="Delete photo"
                    title="Delete photo (Del)"
                  >
                    <span className="inline-flex items-center gap-1">
                      <Trash2 className="h-3.5 w-3.5" />
                      Delete
                    </span>
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Instructions */}
      <div className="text-xs text-muted-foreground">
        Hover image then press <kbd>S</kbd> to set Start, <kbd>E</kbd> to set End. End is optional.
        <br />
        Click to set Start • Shift+Click to set End • Use hotkeys to select shot types • Press <kbd>Del</kbd> to delete hovered photo.
        {shotTypes.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {shotTypes.slice(0, 6).map((shotType) => (
              <span key={shotType.id} className="rounded bg-muted px-1.5 py-0.5">
                <code className="text-xs"> {shotType.hotkey} </code>
              </span>
            ))}
            {shotTypes.length > 6 && <span className="text-xs">...</span>}
          </div>
        )}
      </div>
    </div>
  );
}
