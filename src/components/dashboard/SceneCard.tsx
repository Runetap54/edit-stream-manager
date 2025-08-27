import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Video, RotateCcw, History, Loader2, AlertCircle } from "lucide-react";

const shotTypeNames: Record<number, string> = {
  1: "Wide Shot",
  2: "Medium Shot", 
  3: "Close-up",
  4: "Extreme Close-up",
  5: "Over Shoulder",
  6: "Point of View"
};

interface SceneCardProps {
  scene: {
    sceneId: string;
    generationId: string;
    startFrameUrl: string;
    endFrameUrl?: string;
    shotType: number;
    status: 'processing' | 'ready' | 'error';
    videoUrl?: string;
    createdAt: Date;
    ordinal?: number;
    version?: number;
  };
  sceneNumber: number;
  onRegenerate?: (sceneId: string) => void;
  onRevertVersion?: (sceneId: string) => void;
}

export function SceneCard({ scene, sceneNumber, onRegenerate, onRevertVersion }: SceneCardProps) {
  const getStatusIcon = () => {
    switch (scene.status) {
      case 'processing':
        return <Loader2 className="w-4 h-4 animate-spin" />;
      case 'ready':
        return <Video className="w-4 h-4" />;
      case 'error':
        return <AlertCircle className="w-4 h-4" />;
      default:
        return <Video className="w-4 h-4" />;
    }
  };

  return (
    <div className="relative aspect-square rounded-lg overflow-hidden bg-background border border-border transition-all hover:scale-[1.02] hover:shadow-lg group">
      {/* Scene Number Badge with version - Minimalist */}
      <Badge className="absolute top-2 left-2 z-10 bg-primary text-primary-foreground text-xs font-medium border-0">
        Scene {scene.ordinal || sceneNumber} v{scene.version || 1}
      </Badge>
      
      {/* Status Indicator - Small and Subtle */}
      <div className="absolute top-2 right-2 z-10">
        {getStatusIcon()}
      </div>

      {/* Video Content - Maximized for space */}
      {scene.status === 'ready' && scene.videoUrl ? (
        <video
          src={scene.videoUrl}
          controls
          className="w-full h-full object-cover"
          preload="metadata"
          poster={scene.startFrameUrl}
        />
      ) : (
        <div className="w-full h-full bg-muted flex items-center justify-center relative">
          {/* Thumbnail Preview */}
          {scene.startFrameUrl && (
            <img 
              src={scene.startFrameUrl} 
              alt={`Scene ${sceneNumber} preview`}
              className="w-full h-full object-cover opacity-60"
            />
          )}
          
          {/* Processing Overlay - Minimal */}
          <div className="absolute inset-0 bg-background/60 flex items-center justify-center">
            <div className="text-center">
              {getStatusIcon()}
            </div>
          </div>
        </div>
      )}

      {/* Action Buttons - Only show on hover to save space */}
      <div className="absolute bottom-2 left-2 right-2 flex justify-between opacity-0 group-hover:opacity-100 transition-opacity">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => onRegenerate?.(scene.sceneId)}
          disabled={scene.status === 'processing'}
          className="bg-background/95 backdrop-blur-sm text-xs px-2 py-1 h-auto border border-border/50"
        >
          <RotateCcw className="w-3 h-3 mr-1" />
          Regenerate
        </Button>
        
        <Button
          variant="secondary"
          size="sm"
          onClick={() => onRevertVersion?.(scene.sceneId)}
          className="bg-background/95 backdrop-blur-sm text-xs px-2 py-1 h-auto border border-border/50"
        >
          <History className="w-3 h-3 mr-1" />
          Previous
        </Button>
      </div>
    </div>
  );
}