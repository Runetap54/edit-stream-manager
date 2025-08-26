import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Video, LogOut, Download } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { User } from "@supabase/supabase-js";

interface Profile {
  id: string;
  email: string;
  role: string;
  status: string;
}

interface DashboardHeaderProps {
  user: User;
  profile: Profile;
}

export function DashboardHeader({ user, profile }: DashboardHeaderProps) {
  const handleSignOut = async () => {
    try {
      await supabase.auth.signOut();
      toast.success("Signed out successfully");
    } catch (error) {
      toast.error("Error signing out");
    }
  };

  const handleExportAll = () => {
    // TODO: Implement export functionality
    toast.info("Export functionality coming soon");
  };

  const getInitials = (email: string) => {
    return email.split("@")[0].slice(0, 2).toUpperCase();
  };

  return (
    <header className="border-b border-border/20 bg-card/50 backdrop-blur">
      <div className="container mx-auto px-6 py-4">
        <div className="flex items-center justify-between">
          {/* Logo and Brand */}
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-gradient-to-br from-primary to-accent rounded-lg flex items-center justify-center">
              <Video className="w-5 h-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
                VideoStream
              </h1>
              <p className="text-sm text-muted-foreground">Dashboard</p>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center space-x-4">
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportAll}
              className="hidden sm:inline-flex"
            >
              <Download className="w-4 h-4 mr-2" />
              Export All
            </Button>
            
            <div className="flex items-center space-x-3">
              <div className="text-right hidden sm:block">
                <p className="text-sm font-medium">{user.email}</p>
                <p className="text-xs text-muted-foreground capitalize">
                  {profile.role} • {profile.status}
                </p>
              </div>
              
              <Avatar className="w-8 h-8">
                <AvatarFallback className="bg-primary/10 text-primary text-xs">
                  {getInitials(user.email || "")}
                </AvatarFallback>
              </Avatar>
              
              <Button
                variant="ghost"
                size="sm"
                onClick={handleSignOut}
                className="text-muted-foreground hover:text-foreground"
              >
                <LogOut className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}