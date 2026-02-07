import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { Sparkles, Music, Upload, AlertCircle, FileAudio, CheckCircle2, X, Mic, Drum, Zap, Music2, Play } from "lucide-react";
import { cn } from "@/lib/utils";
import { useMusicLibrary } from "@/hooks/useMusicLibrary";
import { useToast } from "@/hooks/use-toast";
import { Volume2 } from "lucide-react";
import { auth } from "@/lib/firebase";

export function HeroSection() {
  const { addAudioFile, isLoading } = useMusicLibrary();
  const { toast } = useToast();

  // Max upload size 10 MB
  const MAX_FILE_SIZE = 10 * 1024 * 1024;

  const [uploadLoading, setUploadLoading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [tosAgreed, setTosAgreed] = useState(false);
  const [selectedStems, setSelectedStems] = useState<string[]>(['vocals', 'percussion', 'bass', 'other', 'instrumental']);
  const [isTosOpen, setIsTosOpen] = useState(false);
  const triggeredByVoiceRef = useRef(false);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;

    if (f.size > MAX_FILE_SIZE) {
      toast({ title: 'Error', description: 'File must be 10 MB or smaller', variant: 'destructive' });
      e.target.value = '';
      return;
    }

    if (!f.name.toLowerCase().endsWith('.mp3')) {
      toast({ title: 'Error', description: 'Only MP3 files are accepted', variant: 'destructive' });
      e.target.value = '';
      return;
    }

    setSelectedFile(f);
    setUploadProgress(0);
    // Dispatch event to close listening window if active
    window.dispatchEvent(new CustomEvent('file-selected'));
  };

  useEffect(() => {
    const handleVoiceSplit = () => {
      setTosAgreed(true);
      setIsTosOpen(false);
      triggeredByVoiceRef.current = true;
      window.dispatchEvent(new CustomEvent('tos-agreed'));

      // Small delay to ensure state updates have propagated
      setTimeout(() => {
        const analyzeBtn = document.getElementById('analyze-button');
        const isButtonDisabled = !selectedFile || isLoading || selectedStems.length === 0;

        if (!isButtonDisabled) {
          handleAnalyze(true);
        } else {
          toast({
            title: "Voice Command",
            description: selectedFile ? "Please select at least one stem." : "Please select a file first.",
            variant: "destructive"
          });
        }
      }, 500);
    };

    window.addEventListener('voice-trigger-split', handleVoiceSplit);

    const handleVoiceViewTos = () => {
      setIsTosOpen(true);
    };

    const handleVoiceSelectStem = (e: any) => {
      const stemId = e.detail?.stemId;
      if (stemId === 'all') {
        setSelectedStems(['vocals', 'percussion', 'bass', 'other', 'instrumental']);
      } else if (stemId === 'none') {
        setSelectedStems([]);
      } else if (stemId) {
        setSelectedStems(prev =>
          prev.includes(stemId) ? prev.filter(s => s !== stemId) : [...prev, stemId]
        );
      }
    };

    window.addEventListener('voice-view-tos', handleVoiceViewTos);
    window.addEventListener('voice-select-stem', handleVoiceSelectStem);

    return () => {
      window.removeEventListener('voice-trigger-split', handleVoiceSplit);
      window.removeEventListener('voice-view-tos', handleVoiceViewTos);
      window.removeEventListener('voice-select-stem', handleVoiceSelectStem);
    };
  }, [selectedFile, tosAgreed, selectedStems]);

  const clearSelection = () => {
    setSelectedFile(null);
    setUploadProgress(0);
  };

  const handleTosAgree = () => {
    setTosAgreed(true);
    setIsTosOpen(false);
    window.dispatchEvent(new CustomEvent('tos-agreed'));
    // Use a small timeout to ensure state reflects TOS agreement before analysis
    setTimeout(() => {
      handleAnalyze(true);
    }, 100);
  };

  const handleAnalyze = async (forceAgree: boolean = false) => {
    const isAgreed = tosAgreed || forceAgree;

    if (!selectedFile) {
      console.warn("[Hero] No file selected");
      return;
    }

    if (!isAgreed) {
      console.warn("[Hero] TOS not agreed");
      toast({ title: 'Terms of Service', description: 'You must agree to the Terms of Service before splitting.', variant: 'destructive' });
      return;
    }

    // Check if user is authenticated (required for R2 storage)
    const user = auth.currentUser;
    if (!user) {
      toast({
        title: 'Authentication Required',
        description: 'Please log in to upload and process audio files.',
        variant: 'destructive'
      });
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
      await addAudioFile(selectedFile, isAgreed, selectedStems);

      // Notify speech control if this was a voice-initiated split
      if (triggeredByVoiceRef.current) {
        window.dispatchEvent(new CustomEvent('voice-split-success'));
        triggeredByVoiceRef.current = false;
      }
      setUploadProgress(100);
      toast({ title: 'Success', description: 'Audio file analyzed and added to library.' });
      setSelectedFile(null); // Clear selection on success
    } catch (err) {
      console.error("[Hero] addAudioFile failed:", err);
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
            <img
              src="/NiftyDAW-logo.png"
              alt="NiftyDAW Logo"
              className="w-18 h-16 object-contain"
            />
            <h1 className="text-3xl md:text-4xl lg:text-6xl font-bold text-transparent bg-clip-text bg-gradient-primary">
              NiftyDAW
            </h1>
          </div>

          <p className="text-base md:text-lg lg:text-2xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            Your one-stop Digital Audio Workstation (DAW) for AI-powered audio separation.
          </p>

          <p className="text-base md:text-md lg:text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            Upload your music tracks to isolate audio layers.
            Separate bass, drums, vocals, and instruments with AI precision.
          </p>
        </div>

        {/* Input Section */}
        <div className="space-y-6 animate-slide-up" style={{ animationDelay: "0.2s" }}>
          <div className="max-w-3xl mx-auto space-y-6">

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
                          accept=".mp3"
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
                          <span>Select MP3 File</span>
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
                          id="clear-file-button"
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
                    id="analyze-button"
                    onClick={() => handleAnalyze()}
                    disabled={!selectedFile || uploadLoading || (!tosAgreed && !!selectedFile) || selectedStems.length === 0}
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
                        Splitting
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-5 h-5 mr-2" />
                        Split
                      </>
                    )}
                  </Button>
                </div>

                {/* Progress Bar (if processing) */}
                {uploadLoading && (
                  <div className="w-full space-y-2 animate-in fade-in">
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Splitting {selectedFile?.name}...</span>
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

                {/* Stem Selection Section */}
                {selectedFile && !uploadLoading && (
                  <div className="w-full space-y-4 p-4 rounded-xl bg-background/30 border border-border/20 animate-slide-up">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                        <Music className="w-4 h-4 text-primary" />
                        Select Stems to Extract
                      </h3>
                      <button
                        onClick={() => {
                          if (selectedStems.length === 5) setSelectedStems([]);
                          else setSelectedStems(['vocals', 'percussion', 'bass', 'other', 'instrumental']);
                        }}
                        className="text-xs uppercase tracking-wider font-bold text-white hover:opacity-80 transition-opacity"
                      >
                        {selectedStems.length === 5 ? 'Deselect All' : 'Select All'}
                      </button>
                    </div>

                    <div className="flex flex-wrap gap-3">
                      {[
                        { id: 'vocals', label: 'Vocals', icon: Mic },
                        { id: 'percussion', label: 'Percussion', icon: Drum },
                        { id: 'bass', label: 'Bass', icon: Volume2 },
                        { id: 'other', label: 'Other', icon: Zap },
                        { id: 'instrumental', label: 'Instrumental', icon: Music2 },
                      ].map((stem) => {
                        const isSelected = selectedStems.includes(stem.id);
                        const Icon = stem.icon;
                        return (
                          <button
                            key={stem.id}
                            onClick={() => {
                              setSelectedStems(prev =>
                                isSelected
                                  ? prev.filter(s => s !== stem.id)
                                  : [...prev, stem.id]
                              );
                            }}
                            className={cn(
                              "group/stem relative flex flex-col items-center justify-center gap-2 p-4 min-w-[100px] flex-1 rounded-xl border-2 transition-all duration-300",
                              isSelected
                                ? "bg-primary/10 border-primary shadow-[0_0_15px_rgba(var(--primary),0.2)]"
                                : "bg-background/20 border-border/40 text-muted-foreground hover:border-border/80 hover:bg-background/40"
                            )}
                          >
                            <div className={cn(
                              "p-2 rounded-lg transition-all duration-300",
                              isSelected
                                ? "bg-primary text-primary-foreground scale-110 shadow-glow-sm"
                                : "bg-muted/30 text-muted-foreground group-hover/stem:bg-muted/50"
                            )}>
                              <Icon className="w-5 h-5" />
                            </div>
                            <span className={cn(
                              "text-[11px] font-bold tracking-wide uppercase transition-colors",
                              isSelected ? "text-foreground" : "text-muted-foreground"
                            )}>
                              {stem.label}
                            </span>

                            {/* Selected Indicator */}
                            <div className={cn(
                              "absolute top-2 right-2 w-4 h-4 rounded-full border-2 flex items-center justify-center transition-all duration-300",
                              isSelected
                                ? "bg-primary border-primary scale-100"
                                : "bg-transparent border-muted-foreground/30 scale-75 opacity-0 group-hover/stem:opacity-100"
                            )}>
                              {isSelected && <CheckCircle2 className="w-3 h-3 text-primary-foreground" />}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                    {selectedStems.length === 0 && (
                      <p className="text-sm text-destructive flex items-center gap-1">
                        <AlertCircle className="w-3 h-3" />
                        Please select at least one stem.
                      </p>
                    )}
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

                      <Dialog open={isTosOpen} onOpenChange={setIsTosOpen}>
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
                              By uploading, you grant NiftyDAW a temporary license to process your file solely for the purpose of separation. We do not claim ownership of your content.
                            </p>
                            <p>
                              <strong>3. Data Retention</strong><br />
                              Authenticated users' files are stored in private Cloudflare R2 storage and are automatically deleted after 24 hours. Local files are processed in your browser session and not stored by us.
                            </p>
                            <p>
                              <strong>4. Bot Detection</strong><br />
                              This site is protected by reCAPTCHA v3 to prevent automated abuse. Your use of reCAPTCHA is subject to the Google <a href="https://policies.google.com/privacy" target="_blank" className="underline">Privacy Policy</a> and <a href="https://policies.google.com/terms" target="_blank" className="underline">Terms of Service</a>.
                            </p>
                            <p>
                              <strong>5. Storage & Privacy</strong><br />
                              We use secure, private Cloudflare R2 buckets. Only you can access your analyzed files via secure, time-limited links.
                            </p>
                            <p>
                              <strong>6. Prohibited Content</strong><br />
                              Do not upload illegal, harmful, or offensive content. We reserve the right to terminate services for violations.
                            </p>
                          </div>
                          <DialogFooter className="sm:justify-start mt-6">
                            <Button
                              type="button"
                              className="bg-primary hover:bg-primary/90 font-bold"
                              onClick={handleTosAgree}
                            >
                              I Agree
                            </Button>
                            <DialogClose asChild>
                              <Button type="button" variant="secondary">
                                Close
                              </Button>
                            </DialogClose>
                          </DialogFooter>
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
                Splitting high-quality files may take up to 5 minutes. Stay on this page while the process is complete.
              </div>
            </div>

          </div>
        </div>

        {/* Voice Commands Section */}
        <div className="space-y-6 max-w-4xl mx-auto mt-16 animate-slide-up" style={{ animationDelay: "0.4s" }}>
          <h2 className="text-primary text-sm font-bold uppercase tracking-widest">Available Voice Commands</h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              {
                icon: Upload,
                title: "File Actions",
                commands: ["\"Open files\"", "\"Upload file\"", "\"Split music\"", "\"View TOS\""],
                color: "text-blue-400"
              },
              {
                icon: Play,
                title: "Playback",
                commands: ["\"Play all\"", "\"Play {stems} from {song}\"", "\"Stop music\""],
                color: "text-green-400"
              },
              {
                icon: Zap,
                title: "App Support",
                commands: ["\"View Profile\"", "\"Go Back\"", "\"Stop listening\""],
                color: "text-purple-400"
              }
            ].map((feature, index) => (
              <div
                key={index}
                className="p-6 bg-card/40 backdrop-blur-sm border border-border/20 rounded-2xl hover:bg-card/60 transition-all duration-300 group text-left"
              >
                <div className={cn("p-2.5 rounded-xl bg-background/50 w-fit mb-4 group-hover:scale-110 transition-transform border border-border/10", feature.color)}>
                  <feature.icon className="w-5 h-5" />
                </div>
                <h3 className="font-bold text-foreground mb-3 text-sm uppercase tracking-wide">{feature.title}</h3>
                <div className="space-y-2">
                  {feature.commands.map((cmd, cIdx) => (
                    <p key={cIdx} className="text-xs text-muted-foreground font-mono bg-muted/20 px-2 py-1 rounded w-fit">
                      {cmd}
                    </p>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}