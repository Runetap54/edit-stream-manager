import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Upload, FolderOpen, X, ChevronDown, ChevronUp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface UploadPanelProps {
  onUploadComplete: (folder: string, files: string[]) => void;
}

export function UploadPanel({ onUploadComplete }: UploadPanelProps) {
  const [folderName, setFolderName] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [selectedFiles, setSelectedFiles] = useState<FileList | null>(null);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
        const filePath = `${user.id}/${folderName}/${fileName}`;

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
        // TODO: Send metadata to n8n webhook
        // const webhookData = {
        //   folder: folderName,
        //   files: uploadedFiles,
        //   userId: user.id
        // };
        
        onUploadComplete(folderName, uploadedFiles);
        
        // Reset form and collapse panel
        setFolderName("");
        setSelectedFiles(null);
        setUploadProgress(0);
        setIsCollapsed(true);
        
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

  return (
    <Card className={`transition-all duration-300 ${isCollapsed ? 'h-16' : 'h-auto'} overflow-hidden`}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Upload className="w-5 h-5 text-primary" />
            <CardTitle className="text-lg">Upload Panel</CardTitle>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="h-8 w-8 p-0"
          >
            {isCollapsed ? (
              <ChevronDown className="w-4 h-4" />
            ) : (
              <ChevronUp className="w-4 h-4" />
            )}
          </Button>
        </div>
      </CardHeader>
      
      {!isCollapsed && (
        <CardContent className="space-y-4">
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
        </CardContent>
      )}
    </Card>
  );
}