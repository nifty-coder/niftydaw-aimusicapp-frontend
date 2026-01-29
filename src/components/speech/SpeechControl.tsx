import { useState, useEffect, useCallback, useRef } from "react";
import { Mic, MicOff, Loader2, Upload } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useMusicLibrary } from "@/hooks/useMusicLibrary";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from "@/components/ui/dialog";

// Extend Window interface for SpeechRecognition
declare global {
    interface Window {
        SpeechRecognition: any;
        webkitSpeechRecognition: any;
    }
}

export function SpeechControl() {
    const [connectionState, setConnectionState] = useState<'offline' | 'connecting' | 'online'>('offline');
    const [status, setStatus] = useState<string | null>(null);
    const [liveTranscript, setLiveTranscript] = useState<string | null>(null);
    const [flowState, setFlowState] = useState<'idle' | 'tos-verification' | 'upload-confirmation'>('idle');
    const [pendingAction, setPendingAction] = useState<{ type: 'upload' | 'select', label: string } | null>(null);

    // Refs for new implementation
    const socketRef = useRef<WebSocket | null>(null);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const timeoutRef = useRef<NodeJS.Timeout | null>(null);
    const isListeningRef = useRef(false); // Keep ref for logic capability

    const navigate = useNavigate();
    const { logout } = useAuth();
    const { urls, handlePlayAll, stopAllPlayback, clearLibrary, handlePlayToggle } = useMusicLibrary();
    const { toast } = useToast();

    // Helper to check if we are on a mobile device
    const isMobile = useCallback(() => {
        return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.innerWidth < 768;
    }, []);

    // Helper to change listening state in both ref and component state
    const setListeningState = useCallback((state: boolean) => {
        setConnectionState(state ? 'online' : 'offline');
        isListeningRef.current = state;
        if (!state) {
            if (timeoutRef.current) {
                clearTimeout(timeoutRef.current);
                timeoutRef.current = null;
            }
            // Clear pending action and flow if we stop listening
            setPendingAction(null);
            setFlowState('idle');
        }
    }, []);

    // Sound feedback for activation
    const playActivationSound = useCallback(() => {
        try {
            const AudioContextClass = (window as any).AudioContext || (window as any).webkitAudioContext;
            if (!AudioContextClass) return;

            const context = new AudioContextClass();
            const oscillator = context.createOscillator();
            const gainNode = context.createGain();

            oscillator.type = "sine";
            oscillator.frequency.setValueAtTime(1000, context.currentTime);

            gainNode.gain.setValueAtTime(0, context.currentTime);
            gainNode.gain.linearRampToValueAtTime(0.05, context.currentTime + 0.01);
            gainNode.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.05);

            oscillator.connect(gainNode);
            gainNode.connect(context.destination);

            oscillator.start();
            oscillator.stop(context.currentTime + 0.05);

            // Clean up AudioContext
            setTimeout(() => {
                context.close();
            }, 100);
        } catch (e) {
            console.error("Failed to play activation sound:", e);
        }
    }, []);

    // TTS Helper
    const speak = useCallback((text: string) => {
        if ('speechSynthesis' in window) {
            // Cancel any ongoing speech
            window.speechSynthesis.cancel();

            const utterance = new SpeechSynthesisUtterance(text);
            utterance.rate = 1.1; // Slightly faster for responsiveness
            utterance.pitch = 1.0;
            utterance.volume = 1.0;

            window.speechSynthesis.speak(utterance);
        }
    }, []);

    const stopListening = useCallback(() => {
        setListeningState(false);
        setStatus(null);
        setFlowState('idle'); // Reset conversational state
        setPendingAction(null);

        // Stop recorder
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
            try {
                mediaRecorderRef.current.stop();
                // Stop all tracks to release microphone
                mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
            } catch (e) {
                console.error("Error stopping MediaRecorder:", e);
            }
        }
        mediaRecorderRef.current = null;

        // Close socket
        if (socketRef.current) {
            socketRef.current.close();
        }
        socketRef.current = null;

        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
            timeoutRef.current = null;
        }
    }, [setListeningState]);

    const handlePendingAction = useCallback(() => {
        if (!pendingAction) return;

        if (pendingAction.type === 'upload') {
            const fileInput = document.getElementById('audioUpload');
            if (fileInput) {
                fileInput.click();
                setStatus("Opening file explorer...");
                setPendingAction(null);
                setFlowState('idle');
            }
        }
    }, [pendingAction]);

    const processCommand = useCallback((transcript: string) => {
        const text = transcript.toLowerCase().trim();
        console.log("Command Transcript:", text);

        // --- CONVERSATIONAL FLOW HANDLING ---

        if (flowState === 'tos-verification') {
            if (text.includes("yes") || text.includes("agree") || text.includes("i do") || text.includes("sure") || text.includes("ok")) {
                speak("Great. Proceeding with the request.");
                setStatus("TOS Agreed. Proceeding...");
                setFlowState('idle');
                window.dispatchEvent(new CustomEvent('voice-trigger-split'));
                return true;
            } else if (text.includes("no") || text.includes("cancel") || text.includes("don't") || text.includes("disagree")) {
                speak("Cancelled.");
                setStatus("Cancelled.");
                setFlowState('idle');
                return true;
            }
            if (text.endsWith("done") || text === "stop listening" || text === "turn off" || text === "stop voice") {
                speak("Cancelling voice control.");
                stopListening();
                return true;
            }
            return false;
        }

        if (flowState === 'upload-confirmation') {
            if (text.includes("yes") || text.includes("sure") || text.includes("ok") || text.includes("confirm") || text.includes("do it") || text === "yes") {
                const fileInput = document.getElementById('audioUpload');
                if (fileInput) {
                    try {
                        // Attempt automatic click
                        fileInput.click();
                        speak("Attempting to open file explorer. If it doesn't appear, please tap the button on your screen.");
                        setStatus("Opening file explorer...");
                    } catch (e) {
                        speak("Your browser requires a physical tap. Please touch the open file explorer button.");
                        setStatus("Tap required...");
                    }
                }
                // Keep the flow/button active in case the click was blocked
                return true;
            } else if (text.includes("no") || text.includes("cancel") || text.includes("stop")) {
                speak("Cancelled.");
                setStatus("Cancelled.");
                setFlowState('idle');
                setPendingAction(null);
                return true;
            }
            return false;
        }

        // --- STANDARD COMMANDS ---

        // Navigation Commands
        if (text.includes("go to profile") || text.includes("view profile") || text.includes("show profile")) {
            setStatus("Navigating to profile...");
            navigate("/profile");
            return true;
        }
        if (text.includes("go home") || text.includes("go to home")) {
            setStatus("Navigating home...");
            navigate("/");
            return true;
        }
        if (text.includes("go back") || text.includes("back to app")) {
            setStatus("Navigating back...");
            navigate(-1);
            return true;
        }
        if (text.includes("go to pricing") || text.includes("view pricing") || text.includes("show pricing")) {
            setStatus("Navigating to pricing...");
            navigate("/pricing");
            return true;
        }

        // Playback Commands
        if (text.includes("play all") || text.includes("play music")) {
            if (urls.length > 0) {
                setStatus(`Playing all tracks for: ${urls[0].title}`);
                handlePlayAll(urls[0]);
            } else {
                setStatus("No tracks found in library.");
            }
            return true;
        }
        if (text.includes("stop music") || text.includes("stop all") || text.includes("stop playing") || text.includes("pause music")) {
            setStatus("Stopping playback...");
            stopAllPlayback();
            return true;
        }
        if (text.includes("clear library")) {
            setStatus("Clearing library...");
            clearLibrary();
            return true;
        }

        // System Commands
        if (text.includes("refresh page") || text.includes("refresh")) {
            setStatus("Refreshing page...");
            window.location.reload();
            return true;
        }
        if (text.includes("logout") || text.includes("sign out")) {
            setStatus("Logging out...");
            logout();
            return true;
        }

        if (text.endsWith("done") || text === "stop listening" || text === "turn off" || text === "stop voice") {
            setStatus("Powering off voice control...");
            stopListening();
            return true;
        }

        if (text.includes("clear file") || text.includes("remove file") || text.includes("clear selection") || text.includes("cancel upload")) {
            const clearBtn = document.getElementById('clear-file-button');
            if (clearBtn) {
                setStatus("Clearing selection...");
                clearBtn.click();
            } else {
                setStatus("No file to clear.");
            }
            return true;
        }

        if (text.includes("open files") || text.includes("upload file") || text.includes("upload music") || text.includes("select file") || text.includes("pick file") || text.includes("choose file") || text.includes("select song")) {
            const fileInput = document.getElementById('audioUpload');
            if (fileInput) {
                setStatus("Opening file explorer...");

                // Try direct click immediately (The Concept)
                try {
                    fileInput.click();
                } catch (e) {
                    console.warn("Direct click blocked by browser policy.");
                }

                if (isMobile()) {
                    setFlowState('upload-confirmation');
                    speak("Shall I open the file explorer for you?");
                    setStatus("Confirm to open...");
                    setPendingAction({ type: 'upload', label: 'Open File Explorer' });
                }
            } else {
                const clearBtn = document.getElementById('clear-file-button');
                if (clearBtn) {
                    speak("A file is already selected. Say 'clear file' to remove it.");
                    setStatus("File already selected.");
                } else {
                    setStatus("File picker unavailable.");
                }
            }
            return true;
        }

        // INTERCEPT for TOS Flow
        if (text.includes("split song") || text.includes("split music") || text.includes("split") ||
            text.includes("view tos") || text.includes("view terms") || text.includes("show terms") || text.includes("terms of service") || text.includes("view the terms of service")) {

            setStatus("Please listen to the Terms of Service...");
            window.dispatchEvent(new CustomEvent('voice-view-tos'));

            const tosSummary = "By using this service, you agree that you own the rights to the uploaded music or have permission to use it. Do you agree to these terms?";

            speak(tosSummary);
            setFlowState('tos-verification');
            return true;
        }

        if (text.includes("select all stems") || text.includes("select all")) {
            setStatus("Selecting all stems...");
            window.dispatchEvent(new CustomEvent('voice-select-stem', { detail: { stemId: 'all' } }));
            return true;
        }

        if (text.includes("deselect all stems") || text.includes("deselect all") || text.includes("clear stems")) {
            setStatus("Deselecting all stems...");
            window.dispatchEvent(new CustomEvent('voice-select-stem', { detail: { stemId: 'none' } }));
            return true;
        }

        const selectStemMatch = text.match(/select (.+)/i);
        if (selectStemMatch) {
            let stemId = selectStemMatch[1].trim();
            if (stemId.includes("drum") || stemId.includes("percussion")) stemId = "percussion";
            if (stemId.includes("vocal")) stemId = "vocals";
            if (stemId.includes("instrumental") || stemId.includes("instrument")) stemId = "instrumental";
            if (stemId.includes("original") || stemId.includes("source")) stemId = "original audio";
            if (stemId.includes("bas")) stemId = "bass";

            const validStems = ["vocals", "percussion", "bass", "other", "instrumental", "original audio"];
            if (validStems.includes(stemId)) {
                setStatus(`Toggling ${stemId}...`);
                window.dispatchEvent(new CustomEvent('voice-select-stem', { detail: { stemId } }));
            }
            return true;
        }

        const stemMatch = text.match(/play (.+) (?:for|from) (.+)/i);
        if (stemMatch) {
            const stemName = stemMatch[1].trim();
            const songTitle = stemMatch[2].trim();

            const song = urls.find(u => u.title.toLowerCase().includes(songTitle));
            if (song) {
                const layer = song.layers.find(l =>
                    l.name.toLowerCase().includes(stemName) ||
                    l.id.toLowerCase().includes(stemName) ||
                    (stemName === "original audio" && l.id === "original") ||
                    (stemName === "percussion" && l.id === "drums")
                );

                if (layer) {
                    const f = song.files?.find(file => {
                        const parts = file.filename.replace(/\\/g, '/').split('/');
                        const basename = parts[parts.length - 1].split('.')[0].toLowerCase();
                        return basename === layer.id.toLowerCase();
                    });

                    if (f) {
                        const trackKey = `${song.id}__${f.filename}`;
                        setStatus(`Playing ${layer.name} for ${song.title}`);
                        handlePlayToggle(trackKey, f, song);
                        return true;
                    }
                } else {
                    setStatus(`Could not find stem "${stemName}" for "${song.title}"`);
                }
            } else {
                setStatus(`Could not find song "${songTitle}" in library`);
            }
            return true;
        }

        return false;
    }, [urls, navigate, logout, handlePlayAll, stopAllPlayback, clearLibrary, handlePlayToggle, flowState, speak, stopListening, isMobile]);

    const resetInactivityTimeout = useCallback(() => {
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        timeoutRef.current = setTimeout(() => {
            if (isListeningRef.current) {
                console.log("Auto-stopping due to inactivity");
                stopListening();
            }
        }, 30000); // 30 seconds
    }, [stopListening]);

    const startListening = useCallback(async () => {
        try {
            setConnectionState('connecting');
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

            // Determine WebSocket URL
            const apiBase = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';
            const wsUrl = apiBase.replace(/^http/, 'ws') + '/ws/transcribe';

            // Connect
            const socket = new WebSocket(wsUrl);
            socketRef.current = socket;

            socket.onopen = () => {
                console.log("WebSocket connected");
                playActivationSound();
                setStatus("Online");
                setListeningState(true);
                setLiveTranscript(null);
                resetInactivityTimeout();

                // iOS and some mobile browsers are very picky about MediaRecorder mimeTypes
                const mimeTypes = [
                    'audio/webm;codecs=opus',
                    'audio/webm',
                    'audio/ogg;codecs=opus',
                    'audio/mp4',
                    'audio/aac'
                ];

                let selectedMimeType = '';
                for (const mime of mimeTypes) {
                    if (MediaRecorder.isTypeSupported(mime)) {
                        selectedMimeType = mime;
                        break;
                    }
                }

                console.log(`[Audio] Using MimeType: ${selectedMimeType || 'default'}`);
                const recorder = new MediaRecorder(stream, selectedMimeType ? { mimeType: selectedMimeType } : undefined);
                mediaRecorderRef.current = recorder;

                let chunkCount = 0;
                recorder.ondataavailable = (e) => {
                    chunkCount++;
                    if (e.data.size > 0 && socket.readyState === WebSocket.OPEN) {
                        socket.send(e.data);
                    }
                };

                recorder.start(250); // Send 250ms chunks
            };

            socket.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    const { transcript, isFinal } = data;

                    if (transcript) {
                        resetInactivityTimeout();
                        setLiveTranscript(transcript);

                        if (isFinal) {
                            const matched = processCommand(transcript);
                            if (matched) {
                                toast({
                                    title: "Voice Command",
                                    description: transcript,
                                });
                            }
                            // Persist transcript briefly
                            setTimeout(() => setLiveTranscript(null), 3500);
                        }
                    }
                } catch (e) {
                    console.error("Error parsing WebSocket message:", e);
                }
            };

            socket.onerror = (error) => {
                console.error("WebSocket error:", error);

                // Detailed error messaging
                let msg = "Failed to connect to speech server.";
                if (socket.readyState === WebSocket.CLOSED) {
                    msg = "Voice server connection refused. The backend service may be starting up or unavailable.";
                }

                if (connectionState === 'connecting' || connectionState === 'online') {
                    toast({
                        title: "Voice Control Error",
                        description: msg,
                        variant: "destructive"
                    });
                }
                stopListening();
            };

            socket.onclose = () => {
                console.log("WebSocket closed");
                if (isListeningRef.current && !liveTranscript) {
                    stopListening();
                } else if (isListeningRef.current) {
                    setConnectionState('offline');
                    isListeningRef.current = false;

                    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
                        mediaRecorderRef.current.stop();
                        mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
                    }
                    mediaRecorderRef.current = null;
                    socketRef.current = null;
                }
            };

        } catch (err) {
            console.error("Error starting voice control:", err);
            toast({
                title: "Microphone Access Denied",
                description: "Please enable microphone access in your browser settings.",
                variant: "destructive"
            });
            stopListening();
        }
    }, [playActivationSound, processCommand, resetInactivityTimeout, setListeningState, stopListening, toast, connectionState]);

    // Clean up on unmount
    useEffect(() => {
        return () => {
            stopListening();
        };
    }, [stopListening]);

    const toggleListening = () => {
        if (connectionState === 'online' || connectionState === 'connecting') {
            stopListening();
        } else {
            startListening();
        }
    };

    return (
        <div className="flex items-center gap-3 bg-background/40 backdrop-blur-md px-4 py-2 rounded-full border border-primary/20 shadow-glow-sm transition-all hover:bg-background/60 group">
            <div className="flex flex-col items-start">
                <span className="text-[10px] font-bold uppercase tracking-wider text-primary leading-none">Voice Control</span>
                <span className="text-[9px] text-muted-foreground leading-none mt-1 uppercase">
                    {connectionState === 'connecting' ? 'Connecting...' : (connectionState === 'online' ? 'Online' : 'Offline')}
                </span>
            </div>
            <div className="relative">
                <Button
                    variant={connectionState === 'online' ? "default" : "outline"}
                    size="icon"
                    onClick={toggleListening}
                    disabled={connectionState === 'connecting'}
                    className={cn(
                        "relative transition-all rounded-full w-12 h-12 shadow-lg border-2",
                        connectionState === 'online'
                            ? "bg-primary hover:bg-primary/90 border-primary animate-pulse shadow-primary/20"
                            : "bg-background/20 hover:bg-background/40 border-primary/30",
                        connectionState === 'connecting' && "opacity-80"
                    )}
                    title={connectionState === 'online' ? "Stop Listening" : "Start Voice Control"}
                >
                    {connectionState === 'connecting' ? (
                        <Loader2 className="w-6 h-6 text-primary animate-spin" />
                    ) : connectionState === 'online' ? (
                        <Mic className="w-6 h-6 text-white" />
                    ) : (
                        <MicOff className="w-6 h-6 text-muted-foreground" />
                    )}
                </Button>
                {connectionState === 'online' && (
                    <span className="absolute -inset-1 rounded-full border-2 border-primary/50 animate-ping opacity-20 pointer-events-none" />
                )}
            </div>


            {/* Transcription Modal Dialog */}
            <Dialog
                open={connectionState === 'online' || connectionState === 'connecting' || !!liveTranscript}
                onOpenChange={(open) => {
                    if (!open) stopListening();
                }}
            >
                <DialogContent className="sm:max-w-md bg-card/95 backdrop-blur-xl border-primary/20 shadow-2xl">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-3 text-primary uppercase tracking-widest text-xs font-bold">
                            <div className={cn(
                                "w-2.5 h-2.5 rounded-full",
                                connectionState === 'online' ? "bg-primary animate-pulse shadow-glow" :
                                    connectionState === 'connecting' ? "bg-yellow-400 animate-pulse" : "bg-muted"
                            )} />
                            {connectionState === 'connecting' ? "Connecting..." : (connectionState === 'online' ? "Listening Live" : "Processing")}
                        </DialogTitle>
                        <DialogDescription className="text-[10px] text-muted-foreground opacity-70">
                            Speak clearly and use supported voice commands to control the app.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="flex flex-col items-center justify-center py-8 gap-6">
                        {/* Status Icon/Visualizer */}
                        <div className={cn(
                            "w-16 h-16 rounded-full flex items-center justify-center transition-all duration-500",
                            connectionState === 'online' ? "bg-primary/10 scale-110" : "bg-muted/10"
                        )}>
                            {connectionState === 'connecting' ? (
                                <div className="p-4"><Loader2 className="w-8 h-8 text-primary animate-spin" /></div>
                            ) : (
                                <Mic className={cn(
                                    "w-8 h-8 transition-colors duration-300",
                                    connectionState === 'online' ? "text-primary animate-pulse" : "text-muted-foreground"
                                )} />
                            )}
                        </div>

                        {/* Transcript Area */}
                        <div className="text-center space-y-2 w-full px-2">
                            <div className="text-2xl md:text-3xl font-medium text-foreground text-center min-h-[1.5em] transition-all break-words leading-tight">
                                {liveTranscript ? (
                                    <span className="text-foreground animate-in fade-in zoom-in-95 duration-200">"{liveTranscript}"</span>
                                ) : (
                                    <span className={cn(
                                        "text-muted-foreground/40 italic text-lg",
                                        connectionState === 'online' && "text-primary/60 font-semibold not-italic"
                                    )}>
                                        {connectionState === 'connecting' ? "Connecting to server..." :
                                            connectionState === 'online' ? "Listening..." : "Terminated"}
                                    </span>
                                )}
                            </div>
                        </div>

                        {/* MOBILE GESTURE BUTTON (Crucial for mobile support) */}
                        {pendingAction && (
                            <Button
                                onClick={handlePendingAction}
                                size="lg"
                                className="mt-4 bg-gradient-primary animate-bounce shadow-glow-sm"
                            >
                                <Upload className="w-5 h-5 mr-2" />
                                {pendingAction.label}
                            </Button>
                        )}

                        {/* Status Message */}
                        {status && (
                            <div className="text-xs font-bold text-primary bg-primary/10 px-4 py-1.5 rounded-full animate-fade-in border border-primary/20">
                                {status}
                            </div>
                        )}
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}
