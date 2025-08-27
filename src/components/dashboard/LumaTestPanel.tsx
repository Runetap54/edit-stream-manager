import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, CheckCircle, XCircle, Eye, EyeOff, TestTube, Play, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { lumaCreate, testImageUrl, DEFAULTS, type LumaCreateRequest, type LumaCreateResponse } from "@/lib/luma";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

interface UrlTestResult {
  ok: boolean;
  status: number;
  contentType?: string;
  contentLength?: string;
  error?: string;
}

export function LumaTestPanel() {
  // Form state
  const [prompt, setPrompt] = useState("");
  const [model, setModel] = useState<string>(DEFAULTS.model);
  const [aspectRatio, setAspectRatio] = useState<string>(DEFAULTS.aspect_ratio);
  const [resolution, setResolution] = useState<string>(DEFAULTS.resolution);
  const [frame0Url, setFrame0Url] = useState("");
  const [frame1Url, setFrame1Url] = useState("");

  // Test state
  const [frame0Test, setFrame0Test] = useState<UrlTestResult | null>(null);
  const [frame1Test, setFrame1Test] = useState<UrlTestResult | null>(null);
  const [testingUrls, setTestingUrls] = useState(false);

  // Generation state
  const [generating, setGenerating] = useState(false);
  const [generation, setGeneration] = useState<LumaCreateResponse | null>(null);
  const [generationError, setGenerationError] = useState<{ error: string; status?: number; details?: string } | null>(null);

  // UI state
  const [showRawResponse, setShowRawResponse] = useState(false);
  const [showDebugInfo, setShowDebugInfo] = useState(false);

  const handleTestUrls = async () => {
    setTestingUrls(true);
    setFrame0Test(null);
    setFrame1Test(null);

    try {
      const promises: Promise<void>[] = [];

      if (frame0Url.trim()) {
        promises.push(
          testImageUrl(frame0Url.trim()).then(result => setFrame0Test(result))
        );
      }

      if (frame1Url.trim()) {
        promises.push(
          testImageUrl(frame1Url.trim()).then(result => setFrame1Test(result))
        );
      }

      await Promise.all(promises);
      toast.success("URL tests completed");
    } catch (error) {
      toast.error("Failed to test URLs");
    } finally {
      setTestingUrls(false);
    }
  };

  const handleGenerate = async () => {
    if (!prompt.trim()) {
      toast.error("Prompt is required");
      return;
    }

    // Check if frame URLs are provided but not tested or failing
    const frame0Invalid = frame0Url.trim() && (!frame0Test || !frame0Test.ok);
    const frame1Invalid = frame1Url.trim() && (!frame1Test || !frame1Test.ok);

    if (frame0Invalid || frame1Invalid) {
      toast.error("Please test frame URLs first and ensure they return 200 OK");
      return;
    }

    setGenerating(true);
    setGeneration(null);
    setGenerationError(null);

    try {
      const request: LumaCreateRequest = {
        prompt: prompt.trim(),
        model,
        aspect_ratio: aspectRatio,
        resolution,
      };

      if (frame0Url.trim()) {
        request.frame0Url = frame0Url.trim();
      }

      if (frame1Url.trim()) {
        request.frame1Url = frame1Url.trim();
      }

      const result = await lumaCreate(request);
      setGeneration(result);
      
      toast.success("Scene generation started!", {
        description: `Generation ID: ${result.id.slice(0, 8)}...`
      });

    } catch (error: any) {
      console.error("Generation failed:", error);
      
      setGenerationError({
        error: error.message,
        status: error.status,
        details: error.details
      });
      
      toast.error("Scene generation failed", {
        description: "Check the debug panel for details"
      });
    } finally {
      setGenerating(false);
    }
  };

  const renderUrlTest = (url: string, result: UrlTestResult | null, label: string) => {
    if (!url.trim()) return null;

    return (
      <div className="flex items-center gap-2 text-sm">
        <span className="font-medium">{label}:</span>
        {result ? (
          <>
            {result.ok ? (
              <Badge variant="secondary" className="gap-1">
                <CheckCircle className="w-3 h-3" />
                {result.status}
              </Badge>
            ) : (
              <Badge variant="destructive" className="gap-1">
                <XCircle className="w-3 h-3" />
                {result.status}
              </Badge>
            )}
            {result.contentType && (
              <Badge variant="outline">{result.contentType}</Badge>
            )}
            {result.contentLength && (
              <Badge variant="outline">{result.contentLength} bytes</Badge>
            )}
            {result.error && (
              <span className="text-destructive text-xs">{result.error}</span>
            )}
          </>
        ) : (
          <Badge variant="outline">Not tested</Badge>
        )}
      </div>
    );
  };

  const canGenerate = prompt.trim() && 
    (!frame0Url.trim() || (frame0Test && frame0Test.ok)) &&
    (!frame1Url.trim() || (frame1Test && frame1Test.ok));

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TestTube className="w-5 h-5" />
          Luma Test Panel
        </CardTitle>
        <CardDescription>
          Test the Luma Dream Machine API directly with custom parameters
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        
        {/* Form */}
        <div className="space-y-4">
          <div>
            <Label htmlFor="prompt">Prompt *</Label>
            <Textarea
              id="prompt"
              placeholder="Describe the video you want to generate..."
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={3}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label htmlFor="model">Model</Label>
              <Select value={model} onValueChange={setModel}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ray-flash-2">ray-flash-2</SelectItem>
                  <SelectItem value="ray">ray</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="aspect-ratio">Aspect Ratio</Label>
              <Select value={aspectRatio} onValueChange={setAspectRatio}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="16:9">16:9</SelectItem>
                  <SelectItem value="9:16">9:16</SelectItem>
                  <SelectItem value="1:1">1:1</SelectItem>
                  <SelectItem value="4:3">4:3</SelectItem>
                  <SelectItem value="3:4">3:4</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="resolution">Resolution</Label>
              <Select value={resolution} onValueChange={setResolution}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1080p">1080p</SelectItem>
                  <SelectItem value="720p">720p</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-3">
            <div>
              <Label htmlFor="frame0">Start Frame URL</Label>
              <Input
                id="frame0"
                placeholder="https://example.com/start-image.jpg"
                value={frame0Url}
                onChange={(e) => setFrame0Url(e.target.value)}
              />
            </div>

            <div>
              <Label htmlFor="frame1">End Frame URL</Label>
              <Input
                id="frame1"
                placeholder="https://example.com/end-image.jpg"
                value={frame1Url}
                onChange={(e) => setFrame1Url(e.target.value)}
              />
            </div>

            {/* URL Test Results */}
            {(frame0Url.trim() || frame1Url.trim()) && (
              <div className="space-y-2 p-3 bg-muted/50 rounded-lg">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-medium">URL Tests</h4>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleTestUrls}
                    disabled={testingUrls || (!frame0Url.trim() && !frame1Url.trim())}
                  >
                    {testingUrls ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      "Test URLs"
                    )}
                  </Button>
                </div>
                
                <div className="space-y-2">
                  {renderUrlTest(frame0Url, frame0Test, "Start Frame")}
                  {renderUrlTest(frame1Url, frame1Test, "End Frame")}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Generate Button */}
        <Button
          onClick={handleGenerate}
          disabled={generating || !canGenerate}
          className="w-full"
          size="lg"
        >
          {generating ? (
            <Loader2 className="w-4 h-4 animate-spin mr-2" />
          ) : (
            <Play className="w-4 h-4 mr-2" />
          )}
          {generating ? "Generating..." : "Generate Scene"}
        </Button>

        {/* Status Panel */}
        {(generation || generationError) && (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Status</h3>
            
            {generation && (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">
                    {generation.state || "queued"}
                  </Badge>
                  <span className="text-sm text-muted-foreground">
                    ID: {generation.id}
                  </span>
                </div>

                {generation.video?.url && (
                  <div className="space-y-2">
                    <h4 className="font-medium">Generated Video</h4>
                    <video
                      controls
                      className="w-full rounded-lg"
                      src={generation.video.url}
                    />
                  </div>
                )}
              </div>
            )}

            {generationError && (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-destructive">
                  <XCircle className="w-4 h-4" />
                  <span className="font-medium">Generation Failed</span>
                  {generationError.status && (
                    <Badge variant="destructive">{generationError.status}</Badge>
                  )}
                </div>
                
                <p className="text-sm text-muted-foreground">
                  {generationError.error}
                </p>

                {generationError.details && (
                  <Collapsible open={showDebugInfo} onOpenChange={setShowDebugInfo}>
                    <CollapsibleTrigger asChild>
                      <Button variant="outline" size="sm" className="gap-2">
                        <AlertTriangle className="w-3 h-3" />
                        View Debug Details
                      </Button>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <div className="mt-2 p-3 bg-destructive/10 border border-destructive/20 rounded text-sm">
                        <pre className="whitespace-pre-wrap text-xs">
                          {generationError.details}
                        </pre>
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                )}
              </div>
            )}

            {/* Raw Response Toggle */}
            {generation && (
              <Collapsible open={showRawResponse} onOpenChange={setShowRawResponse}>
                <CollapsibleTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-2">
                    {showRawResponse ? (
                      <EyeOff className="w-3 h-3" />
                    ) : (
                      <Eye className="w-3 h-3" />
                    )}
                    {showRawResponse ? "Hide" : "Inspect"} Raw Response
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="mt-2 p-3 bg-muted rounded">
                    <pre className="text-xs overflow-auto">
                      {JSON.stringify(generation, null, 2)}
                    </pre>
                  </div>
                </CollapsibleContent>
              </Collapsible>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}