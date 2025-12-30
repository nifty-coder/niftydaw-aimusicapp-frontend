import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Sparkles, Music, Upload, AlertCircle, FileAudio, CheckCircle2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useMusicLibrary } from "@/hooks/useMusicLibrary";
import { useToast } from "@/hooks/use-toast";
import { Volume2 } from "lucide-react";

export function HeroSection() {
  const { addAudioFile, isLoading } = useMusicLibrary();
  const { toast } = useToast();

  // Max upload size 10 MB
  const MAX_FILE_SIZE = 10 * 1024 * 1024;

  const [uploadLoading, setUploadLoading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [tosAgreed, setTosAgreed] = useState(false);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;

    if (f.size > MAX_FILE_SIZE) {
      toast({ title: 'Error', description: 'File must be 10 MB or smaller', variant: 'destructive' });
      e.target.value = '';
      return;
    }

    setSelectedFile(f);
    setUploadProgress(0);
    // Reset file input value so same file can be selected again if needed
    // e.target.value = ''; // We keep it bound for now or reset in analyze
  };

  const clearSelection = () => {
    setSelectedFile(null);
    setUploadProgress(0);
  };

  const handleAnalyze = async () => {
    if (!selectedFile) return;

    if (!tosAgreed) {
      toast({ title: 'Terms of Service', description: 'You must agree to the Terms of Service before analyzing.', variant: 'destructive' });
      return;
    }

    setUploadLoading(true);
    setUploadProgress(0);

    const interval = setInterval(() => {
      // Slower progress: ~0.4% per second -> reaches ~90% in ~4 minutes
      setUploadProgress((p) => {
        if (p >= 90) return 90;
        return Math.min(90, p + (Math.random() * 0.5 + 0.2));
      });
    }, 1000);

    try {
      await addAudioFile(selectedFile, tosAgreed);
      setUploadProgress(100);
      toast({ title: 'Success', description: 'Audio file analyzed and added to library.' });
      setSelectedFile(null); // Clear selection on success
      window.location.reload();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast({ title: 'Error', description: msg, variant: 'destructive' });
    } finally {
      clearInterval(interval);
      setTimeout(() => {
        setUploadLoading(false);
        setUploadProgress(0);
      }, 600);
    }
  };

  return (
    <div className="flex-1 flex items-center justify-center p-6 md:p-8">
      <div className="max-w-3xl md:max-w-4xl w-full text-center space-y-8">

        <div className="space-y-6 animate-fade-in">
          <div className="flex items-center justify-center gap-3 mb-6">
            <div className="p-3 rounded-full bg-gradient-primary">
              <Music className="w-8 h-8 text-primary-foreground" />
            </div>
            <h1 className="text-3xl md:text-4xl lg:text-6xl font-bold bg-gradient-to-r from-foreground to-muted-foreground bg-clip-text text-transparent">
              StemSplit
            </h1>
          </div>

          <p className="text-base md:text-lg lg:text-2xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            Upload your music tracks to isolate audio layers.
            Separate bass, drums, vocals, and instruments with AI precision.
          </p>
        </div>

        {/* Input Section */}
        <div className="space-y-6 animate-slide-up" style={{ animationDelay: "0.2s" }}>
          <div className="max-w-2xl mx-auto space-y-6">

            <div className="relative group">
              <div className="absolute inset-0 bg-gradient-primary rounded-2xl blur-xl opacity-20 group-hover:opacity-30 transition-opacity" />

              <div className="relative bg-card/80 backdrop-blur-glass border border-border/50 rounded-2xl p-6 md:p-8 shadow-card flex flex-col items-center gap-6">

                {/* File Selection Area */}
                <div className="w-full grid grid-cols-1 md:grid-cols-[1fr,auto] gap-4 items-center">
                  {/* File Input / Display */}
                  <div className="relative">
                    {!selectedFile ? (
                      <div className="relative w-full">
                        <input
                          type="file"
                          accept="audio/*"
                          id="audioUpload"
                          onChange={handleFileSelect}
                          className="hidden"
                          disabled={uploadLoading}
                        />
                        <label
                          htmlFor="audioUpload"
                          className={cn(
                            "w-full h-14 flex items-center justify-center gap-2",
                            "bg-background/50 border-2 border-dashed border-border/50 hover:border-primary/50 hover:bg-background/80",
                            "rounded-xl font-medium text-muted-foreground transition-all cursor-pointer"
                          )}
                        >
                          <Upload className="w-5 h-5 mb-0.5" />
                          <span>Click to Select Audio File</span>
                        </label>
                      </div>
                    ) : (
                      <div className="w-full h-14 flex items-center justify-between px-4 bg-primary/10 border border-primary/20 rounded-xl">
                        <div className="flex items-center gap-3 min-w-0">
                          <FileAudio className="w-5 h-5 text-primary flex-shrink-0" />
                          <span className="truncate font-medium text-foreground max-w-[200px] md:max-w-sm">
                            {selectedFile.name}
                          </span>
                        </div>
                        <button
                          onClick={clearSelection}
                          className="p-1 hover:bg-background/50 rounded-full transition-colors text-muted-foreground hover:text-foreground"
                          disabled={uploadLoading}
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Analyze Button */}
                  <Button
                    onClick={handleAnalyze}
                    disabled={!selectedFile || uploadLoading || (!tosAgreed && !!selectedFile)}
                    size="lg"
                    className={cn(
                      "h-14 px-8 min-w-[160px] rounded-xl font-semibold shadow-glow transition-all duration-300",
                      "bg-gradient-primary hover:opacity-90",
                      uploadLoading && "animate-pulse"
                    )}
                  >
                    {uploadLoading ? (
                      <>
                        <Sparkles className="w-5 h-5 mr-2 animate-spin" />
                        Analyzing
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-5 h-5 mr-2" />
                        Analyze
                      </>
                    )}
                  </Button>
                </div>

                {/* Progress Bar (if processing) */}
                {uploadLoading && (
                  <div className="w-full space-y-2 animate-in fade-in">
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Analyzing {selectedFile?.name}...</span>
                      <span>{Math.round(uploadProgress)}%</span>
                    </div>
                    <div className="h-1.5 w-full bg-secondary/50 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary transition-all duration-300 ease-out"
                        style={{ width: `${uploadProgress}%` }}
                      />
                    </div>
                  </div>
                )}

                {/* ToS Checkbox */}
                <div className="flex items-start gap-3 p-4 rounded-xl bg-background/50 border border-border/40 text-left w-full mt-2">
                  <div className="flex items-center h-5">
                    <input
                      id="tos-terms"
                      type="checkbox"
                      checked={tosAgreed}
                      onChange={(e) => setTosAgreed(e.target.checked)}
                      className="w-4 h-4 text-primary border-border/50 rounded focus:ring-primary focus:ring-offset-0 bg-background"
                    />
                  </div>
                  <div className="ml-2 text-sm text-foreground">
                    <div className="font-medium flex items-center gap-1">
                      <label htmlFor="tos-terms" className="cursor-pointer">
                        I agree to the
                      </label>

                      <Dialog>
                        <DialogTrigger asChild>
                          <span className="text-primary hover:underline cursor-pointer font-bold">
                            Terms of Service
                          </span>
                        </DialogTrigger>
                        <DialogContent className="max-w-md">
                          <DialogHeader>
                            <DialogTitle>Terms of Service</DialogTitle>
                            <DialogDescription>
                              Please review our terms carefully.
                            </DialogDescription>
                          </DialogHeader>
                          <div className="text-sm space-y-4 max-h-[60vh] overflow-y-auto pr-2">
                            <p>
                              <strong>1. Content Ownership</strong><br />
                              You confirm that you own the rights to any audio files you upload, or have explicit permission from the copyright holder to use and process them.
                            </p>
                            <p>
                              <strong>2. Usage Rights</strong><br />
                              By uploading, you grant StemSplit a temporary license to process your file solely for the purpose of separation. We do not claim ownership of your content.
                            </p>
                            <p>
                              <strong>3. Data Retention</strong><br />
                              Uploaded files are processed temporarily. While we may cache results for your convenience, we are not a long-term storage provider. Please keep your own backups.
                            </p>
                            <p>
                              <strong>4. Prohibited Content</strong><br />
                              Do not upload illegal, harmful, or offensive content. We reserve the right to terminate services for violations.
                            </p>
                          </div>
                        </DialogContent>
                      </Dialog>
                    </div>
                    <p className="text-muted-foreground mt-1 text-xs">
                      confirming that you own the rights to the content.
                    </p>
                  </div>
                </div>

              </div>
            </div>

            {/* Disclaimer & Warning */}
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-center gap-2 text-sm text-yellow-500/80 bg-yellow-500/10 p-3 rounded-lg border border-yellow-500/20">
                <AlertCircle className="w-4 h-4" />
                <span>Uploaded files are private and only accessible to you.</span>
              </div>

              <div className="text-sm text-muted-foreground text-center max-w-lg mx-auto leading-relaxed">
                <strong>Note:</strong> AI generation may not always be 100% accurate.
                Analyzing high-quality files may take up to 5 minutes.
              </div>
            </div>

          </div>
        </div>

        {/* Features Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto mt-16 animate-slide-up" style={{ animationDelay: "0.4s" }}>
          {[
            {
              icon: Volume2,
              title: "Bass Extraction",
              description: "Isolate low-frequency bass lines and sub-bass elements"
            },
            {
              icon: Music,
              title: "Instrument Separation",
              description: "Extract individual instruments including piano, guitar, and strings"
            },
            {
              icon: Sparkles,
              title: "AI-Powered Analysis",
              description: "Advanced machine learning for precise audio separation"
            }
          ].map((feature, index) => (
            <div
              key={index}
              className="p-6 bg-card/50 backdrop-blur-sm border border-border/30 rounded-xl hover:bg-card/70 transition-all duration-300 group"
            >
              <div className="p-3 rounded-lg bg-gradient-secondary w-fit mb-4 group-hover:scale-110 transition-transform">
                <feature.icon className="w-6 h-6 text-primary" />
              </div>
              <h3 className="font-semibold text-foreground mb-2">{feature.title}</h3>
              <p className="text-sm text-muted-foreground">{feature.description}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}