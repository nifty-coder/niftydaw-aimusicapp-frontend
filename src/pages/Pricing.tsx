import React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Zap, Star, ShieldCheck, Crown, Clock } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

const Pricing = () => {
    const navigate = useNavigate();

    return (
        <div className="min-h-screen bg-gradient-hero p-4 md:p-8 flex items-center justify-center">
            <div className="max-w-4xl w-full mx-auto">
                {/* Header/Back Button */}
                <div className="absolute top-8 left-8">
                    <Button
                        variant="ghost"
                        size="sm"
                        className="text-white hover:bg-white/10"
                        onClick={() => navigate("/")}
                    >
                        <ArrowLeft className="mr-2 h-4 w-4" />
                        Back to App
                    </Button>
                </div>

                <div className="text-center mb-12">
                    <div className="inline-flex items-center justify-center w-20 h-20 rounded-3xl bg-primary/20 backdrop-blur-xl border border-primary/30 mb-8 animate-pulse">
                        <Star className="w-10 h-10 text-primary" />
                    </div>
                    <h1 className="text-5xl md:text-6xl font-bold text-white mb-6 tracking-tight">
                        Premium Features <br />
                        <span className="text-primary">Coming Soon</span>
                    </h1>
                    <p className="text-xl text-white/70 max-w-2xl mx-auto leading-relaxed">
                        Get ready for higher quality exports, higher processing speeds, and advanced AI features.
                    </p>
                </div>

                {/* Coming Soon Cards - Visual Teasers */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
                    {[
                        { name: "Plus", icon: Star, color: "text-purple-400" },
                        { name: "Pro", icon: ShieldCheck, color: "text-indigo-400" },
                        { name: "Elite", icon: Crown, color: "text-amber-400" }
                    ].map((tier) => (
                        <div
                            key={tier.name}
                            className="p-6 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-glass flex flex-col items-center text-center group hover:border-primary/50 transition-all duration-500"
                        >
                            <div className={cn("w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform", tier.color)}>
                                <tier.icon className="w-6 h-6" />
                            </div>
                            <h3 className="text-lg font-bold text-white mb-2">{tier.name}</h3>
                            <div className="text-xs font-medium text-primary uppercase tracking-widest opacity-60">Pending</div>
                        </div>
                    ))}
                </div>

                {/* Current Status */}
                <Card className="bg-white/10 backdrop-blur-glass border-white/20 text-white overflow-hidden max-w-lg mx-auto">
                    <CardHeader className="text-center pb-2">
                        <div className="flex items-center justify-center gap-2 mb-2">
                            <Clock className="w-4 h-4 text-blue-400" />
                            <span className="text-xs font-bold uppercase tracking-tighter text-blue-400">Current Alpha Phase</span>
                        </div>
                        <CardTitle className="text-2xl font-bold">Free Unlimited Access</CardTitle>
                        <CardDescription className="text-white/60">
                            During our early release, everyone enjoys standard features for free.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="text-center">
                        <p className="text-sm text-white/80">
                            No credit card required. Just start creating.
                        </p>
                    </CardContent>
                    <CardFooter className="flex justify-center pb-8">
                        <Button
                            onClick={() => navigate("/")}
                            className="bg-primary hover:bg-primary/90 text-white font-bold px-8 h-12 rounded-xl"
                        >
                            Start Creating Now
                        </Button>
                    </CardFooter>
                </Card>

                {/* Brand Footer */}
                <div className="mt-16 text-center">
                    <p className="text-sm text-white/30">
                        A product by{' '}
                        <a
                            href="https://niftysoftsol.com"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary hover:underline font-medium"
                        >
                            Nifty Software Solutions
                        </a>
                    </p>
                </div>
            </div>
        </div>
    );
};

export default Pricing;
