import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Video, RotateCcw, Trash2, Loader2, Clock, AlertCircle } from "lucide-react";

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
  onRegenerate?: (sceneId: string) => void;
  onDelete?: (sceneId: string) => void;
}

export function SceneCard({ scene, onRegenerate, onDelete }: SceneCardProps) {
  const getStatusIcon = () => {
    switch (scene.status) {
      case 'processing':
        return <Loader2 className="w-4 h-4 animate-spin" />;
      case 'ready':
        return <Video className="w-4 h-4" />;
      case 'error':
        return <AlertCircle className="w-4 h-4" />;
      default:
        return <Clock className="w-4 h-4" />;
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
        return 'bg-gray-500';
    }
  };

  return (
    <Card className="border-border/50">
      <CardContent className="p-4">
        <div className="flex items-start justify-between mb-3">
          <div className="space-y-1">
            <div className="flex items-center space-x-2">
              <Badge className={`${getStatusColor()} text-white`}>
                {getStatusIcon()}
                <span className="ml-1 capitalize">{scene.status}</span>
              </Badge>
              <span className="text-sm text-muted-foreground">
                {shotTypeNames[scene.shotType]}
              </span>
            </div>
            <div className="text-xs text-muted-foreground">
              ID: {scene.sceneId.slice(0, 8)}...
            </div>
          </div>
          
          <div className="flex space-x-1">
            {scene.status !== 'processing' && onRegenerate && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onRegenerate(scene.sceneId)}
              >
                <RotateCcw className="w-4 h-4" />
              </Button>
            )}
            {onDelete && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onDelete(scene.sceneId)}
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            )}
          </div>
        </div>

        {/* Frame preview row */}
        <div className="flex items-center space-x-2 mb-3">
          <div className="relative">
            <img 
              src={scene.startFrameUrl} 
              alt="Start frame"
              className="w-16 h-16 object-cover rounded"
            />
            <Badge className="absolute -top-1 -left-1 bg-green-500 text-white text-xs px-1">
              S
            </Badge>
          </div>
          
          {scene.endFrameUrl && (
            <>
              <div className="text-muted-foreground">→</div>
              <div className="relative">
                <img 
                  src={scene.endFrameUrl} 
                  alt="End frame"
                  className="w-16 h-16 object-cover rounded"
                />
                <Badge className="absolute -top-1 -left-1 bg-blue-500 text-white text-xs px-1">
                  E
                </Badge>
              </div>
            </>
          )}
        </div>
        
        {/* Video Preview */}
        {scene.status === 'ready' && scene.videoUrl ? (
          <div className="aspect-video bg-black rounded-lg overflow-hidden">
            <video
              src={scene.videoUrl}
              controls
              className="w-full h-full"
              preload="metadata"
            />
          </div>
        ) : (
          <div className="aspect-video bg-muted rounded-lg flex items-center justify-center">
            <div className="text-center">
              {getStatusIcon()}
              <p className="text-sm text-muted-foreground mt-2">
                {scene.status === 'processing' && 'Generating video...'}
                {scene.status === 'error' && 'Generation failed'}
                {scene.status === 'ready' && !scene.videoUrl && 'Video pending'}
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}