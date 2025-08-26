import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { User } from "@supabase/supabase-js";
import { UploadPanel } from "@/components/dashboard/UploadPanel";
import { PhotoGrid } from "@/components/dashboard/PhotoGrid";
import { VideoSection } from "@/components/dashboard/VideoSection";
import { DashboardHeader } from "@/components/dashboard/DashboardHeader";
import { Loader2 } from "lucide-react";

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
  const [currentFolder, setCurrentFolder] = useState<string>("");
  const [uploadedFiles, setUploadedFiles] = useState<string[]>([]);
  const [selectedStart, setSelectedStart] = useState<string>("");
  const [selectedEnd, setSelectedEnd] = useState<string>("");
  const [selectedShotType, setSelectedShotType] = useState<number>(1);

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

  const handleUploadComplete = (folder: string, files: string[]) => {
    setCurrentFolder(folder);
    setUploadedFiles(files);
    setSelectedStart("");
    setSelectedEnd("");
    setSelectedShotType(1);
    toast.success(`Uploaded ${files.length} files to ${folder}`);
  };

  const handlePhotoSelect = (filename: string, type: "start" | "end") => {
    if (type === "start") {
      setSelectedStart(filename);
    } else {
      setSelectedEnd(filename);
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
        {/* Upload Panel */}
        <UploadPanel onUploadComplete={handleUploadComplete} />
        
        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Photo Grid - Takes up 2 columns on large screens */}
          <div className="lg:col-span-2 space-y-4">
            <PhotoGrid
              folder={currentFolder}
              files={uploadedFiles}
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
              folder={currentFolder}
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