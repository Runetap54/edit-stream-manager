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
  };
  sceneNumber: number;
  onRegenerate?: (sceneId: string) => void;
  onRevertVersion?: (sceneId: string) => void;
}

export function SceneCard({ scene, sceneNumber, onRegenerate, onRevertVersion }: SceneCardProps) {
  const getStatusIcon = () => {
    switch (scene.status) {
      case 'processing':
        return <Loader2 className="w-3 h-3 animate-spin" />;
      case 'ready':
        return <Video className="w-3 h-3" />;
      case 'error':
        return <AlertCircle className="w-3 h-3" />;
      default:
        return <Video className="w-3 h-3" />;
    }
  };

  const getStatusColor = () => {
    switch (scene.status) {
      case 'processing':
        return 'bg-blue-500';
      case 'ready':
        return 'bg-green-500';
      case 'error':
        return 'bg-red-500';
      default:
        return 'bg-muted';
    }
  };

  return (
    <div className="relative aspect-square rounded-lg overflow-hidden bg-background border border-border transition-all hover:scale-105 hover:shadow-lg">
      {/* Scene Number Badge */}
      <Badge className="absolute top-2 left-2 z-10 bg-background/90 text-foreground border">
        Scene {sceneNumber}
      </Badge>
      
      {/* Status Badge */}
      <Badge className={`absolute top-2 right-2 z-10 text-white ${getStatusColor()}`}>
        {getStatusIcon()}
        <span className="ml-1 text-xs">{scene.status}</span>
      </Badge>

      {/* Video Content */}
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
              alt="Scene preview"
              className="w-full h-full object-cover opacity-50"
            />
          )}
          
          {/* Processing Overlay */}
          <div className="absolute inset-0 bg-background/80 flex items-center justify-center">
            <div className="text-center">
              {getStatusIcon()}
              <p className="text-xs text-muted-foreground mt-1">
                {scene.status === 'processing' && 'Processing...'}
                {scene.status === 'error' && 'Failed'}
                {scene.status === 'ready' && !scene.videoUrl && 'Pending'}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="absolute bottom-2 left-2 right-2 flex justify-between">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => onRegenerate?.(scene.sceneId)}
          disabled={scene.status === 'processing'}
          className="bg-background/90 backdrop-blur-sm text-xs px-2 py-1 h-auto"
        >
          <RotateCcw className="w-3 h-3 mr-1" />
          Regenerate
        </Button>
        
        <Button
          variant="secondary"
          size="sm"
          onClick={() => onRevertVersion?.(scene.sceneId)}
          className="bg-background/90 backdrop-blur-sm text-xs px-2 py-1 h-auto"
        >
          <History className="w-3 h-3 mr-1" />
          Previous
        </Button>
      </div>

      {/* Shot Type Label */}
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-2">
        <div className="text-white text-xs truncate">
          {shotTypeNames[scene.shotType]}
        </div>
      </div>
    </div>
  );
}