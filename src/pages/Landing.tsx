import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Video, Upload, Zap, Download, Users, Shield, ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import heroImage from "@/assets/hero-video-editing.jpg";

export default function Landing() {
  const features = [
    {
      icon: Upload,
      title: "Smart Upload",
      description: "Drag & drop folder uploads with automatic organization and metadata processing."
    },
    {
      icon: Zap,
      title: "AI Scene Generation",
      description: "Generate professional video scenes with customizable shot types via n8n workflows."
    },
    {
      icon: Video,
      title: "Version Management",
      description: "Track scene versions, regenerate content, and manage video iterations seamlessly."
    },
    {
      icon: Download,
      title: "Bulk Export",
      description: "Export all scenes in organized ZIP packages with one-click download."
    },
    {
      icon: Users,
      title: "Team Collaboration",
      description: "Admin approval workflows ensure controlled access to your video production pipeline."
    },
    {
      icon: Shield,
      title: "Secure Processing",
      description: "End-to-end encrypted uploads with secure HMAC-signed webhook integrations."
    }
  ];

  const workflow = [
    { step: "1", title: "Upload Photos", description: "Organize media into folders" },
    { step: "2", title: "Select Range", description: "Choose start & end frames" },
    { step: "3", title: "Set Shot Type", description: "Pick from 6 cinematic styles" },
    { step: "4", title: "Generate Scene", description: "AI creates your video" },
    { step: "5", title: "Export & Share", description: "Download finished scenes" }
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border/20 bg-card/50 backdrop-blur sticky top-0 z-50">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-gradient-to-br from-primary to-accent rounded-lg flex items-center justify-center">
                <Video className="w-5 h-5 text-primary-foreground" />
              </div>
              <div>
                <h1 className="text-xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
                  VideoStream
                </h1>
                <p className="text-xs text-muted-foreground">Professional Video Creation</p>
              </div>
            </div>
            
            <div className="flex items-center space-x-4">
              <Link to="/auth">
                <Button variant="outline">Sign In</Button>
              </Link>
              <Link to="/auth">
                <Button className="bg-gradient-to-r from-primary to-accent hover:opacity-90">
                  Get Started
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative py-20 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-background via-background to-muted" />
        <div className="relative container mx-auto px-6">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div className="space-y-8">
              <div className="space-y-4">
                <Badge className="bg-primary/10 text-primary border-primary/20">
                  Professional Video Creation Platform
                </Badge>
                <h1 className="text-4xl lg:text-6xl font-bold leading-tight">
                  Transform Photos into{" "}
                  <span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
                    Cinematic Scenes
                  </span>
                </h1>
                <p className="text-xl text-muted-foreground leading-relaxed">
                  Upload photo folders, select frames, and generate professional video scenes 
                  with AI-powered workflows. Complete with version management and team collaboration.
                </p>
              </div>
              
              <div className="flex flex-col sm:flex-row gap-4">
                <Link to="/auth">
                  <Button 
                    size="lg" 
                    className="bg-gradient-to-r from-primary to-accent hover:opacity-90 text-lg px-8"
                  >
                    Start Creating
                    <ArrowRight className="w-5 h-5 ml-2" />
                  </Button>
                </Link>
                <Button variant="outline" size="lg" className="text-lg px-8">
                  Watch Demo
                  <Video className="w-5 h-5 ml-2" />
                </Button>
              </div>
            </div>
            
            <div className="relative">
              <div className="absolute inset-0 bg-gradient-to-br from-primary/20 to-accent/20 rounded-2xl blur-3xl" />
              <img
                src={heroImage}
                alt="Video editing workspace"
                className="relative rounded-2xl shadow-2xl border border-border/20"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20 bg-muted/30">
        <div className="container mx-auto px-6">
          <div className="text-center space-y-4 mb-16">
            <Badge className="bg-accent/10 text-accent border-accent/20">
              Powerful Features
            </Badge>
            <h2 className="text-3xl lg:text-5xl font-bold">
              Everything You Need for{" "}
              <span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
                Video Production
              </span>
            </h2>
            <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
              From upload to export, our platform handles every step of your video creation workflow
              with professional-grade tools and automation.
            </p>
          </div>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {features.map((feature, index) => (
              <Card key={index} className="border-border/20 bg-card/50 backdrop-blur hover:border-primary/20 transition-colors">
                <CardContent className="p-6">
                  <div className="space-y-4">
                    <div className="w-12 h-12 bg-gradient-to-br from-primary/10 to-accent/10 rounded-lg flex items-center justify-center">
                      <feature.icon className="w-6 h-6 text-primary" />
                    </div>
                    <div className="space-y-2">
                      <h3 className="text-xl font-semibold">{feature.title}</h3>
                      <p className="text-muted-foreground">{feature.description}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Workflow Section */}
      <section className="py-20">
        <div className="container mx-auto px-6">
          <div className="text-center space-y-4 mb-16">
            <Badge className="bg-primary/10 text-primary border-primary/20">
              Simple Workflow
            </Badge>
            <h2 className="text-3xl lg:text-5xl font-bold">
              From Photos to{" "}
              <span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
                Professional Videos
              </span>
            </h2>
          </div>
          
          <div className="grid md:grid-cols-5 gap-8">
            {workflow.map((item, index) => (
              <div key={index} className="text-center space-y-4">
                <div className="w-16 h-16 bg-gradient-to-br from-primary to-accent rounded-full flex items-center justify-center text-primary-foreground font-bold text-xl mx-auto">
                  {item.step}
                </div>
                <div className="space-y-2">
                  <h3 className="text-lg font-semibold">{item.title}</h3>
                  <p className="text-sm text-muted-foreground">{item.description}</p>
                </div>
                {index < workflow.length - 1 && (
                  <div className="hidden md:block absolute top-8 left-1/2 transform translate-x-8 w-full">
                    <ArrowRight className="w-6 h-6 text-muted-foreground" />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 bg-gradient-to-br from-primary/5 via-background to-accent/5">
        <div className="container mx-auto px-6 text-center">
          <div className="max-w-3xl mx-auto space-y-8">
            <h2 className="text-3xl lg:text-5xl font-bold">
              Ready to Create{" "}
              <span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
                Amazing Videos?
              </span>
            </h2>
            <p className="text-xl text-muted-foreground">
              Join our platform and start transforming your photos into professional video scenes today.
              Sign up for an account and get admin approval to access all features.
            </p>
            <Link to="/auth">
              <Button 
                size="lg" 
                className="bg-gradient-to-r from-primary to-accent hover:opacity-90 text-lg px-12"
              >
                Get Started Now
                <ArrowRight className="w-5 h-5 ml-2" />
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/20 py-8 bg-muted/20">
        <div className="container mx-auto px-6">
          <div className="flex flex-col md:flex-row items-center justify-between space-y-4 md:space-y-0">
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 bg-gradient-to-br from-primary to-accent rounded-lg flex items-center justify-center">
                <Video className="w-4 h-4 text-primary-foreground" />
              </div>
              <span className="font-semibold">VideoStream</span>
            </div>
            <div className="text-sm text-muted-foreground">
              © 2024 VideoStream. Professional video creation platform.
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}