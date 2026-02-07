import React from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, AlertCircle, ArrowLeft, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

const GoogleAuthVerify = () => {
    const { signInWithGoogle } = useAuth();
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();

    // The 'step' is driven purely by the URL parameters
    const step = searchParams.get('step') || 'idle';
    const errorMsg = searchParams.get('error');

    const startLogin = async () => {
        // Move to 'authenticating' step via URL
        setSearchParams({ step: 'authenticating' });

        try {
            const result = await signInWithGoogle();

            if (result) {
                // If it returns, we passed all checks
                setSearchParams({ step: 'success' });
                setTimeout(() => navigate('/'), 1200);
            }
        } catch (err: any) {
            console.error('GoogleAuthVerify: Caught error:', err);

            const errorMessage = err.message || 'Authentication failed';
            const isConflict = errorMessage.includes('password account') ||
                errorMessage.includes('different sign-in method');

            // Show error step in this page first
            setSearchParams({
                step: 'error',
                error: errorMessage
            });

            // After a delay, redirect back to login page so the error is visible there too
            setTimeout(() => {
                const msg = encodeURIComponent(errorMessage);
                navigate(`/auth?error=${msg}`);
            }, isConflict ? 3500 : 3000);
        }
    };

    return (
        <div className="min-h-screen bg-gradient-hero flex items-center justify-center p-4">
            <Card className="w-full max-w-md bg-white/10 backdrop-blur-md border-white/20 text-white shadow-2xl">
                <CardHeader className="text-center">
                    <div className="mx-auto w-12 h-12 bg-primary/20 rounded-full flex items-center justify-center mb-4">
                        <ShieldCheck className="h-6 w-6 text-primary" />
                    </div>
                    <CardTitle className="text-2xl font-bold">Google Authentication</CardTitle>
                    <CardDescription className="text-white/70">
                        {step === 'idle' && 'Click the button below to continue with Google'}
                        {step === 'authenticating' && 'Authenticating with Google...'}
                        {step === 'checking' && 'Verifying your account status...'}
                        {step === 'success' && 'Authentication successful!'}
                        {step === 'error' && 'Authentication failed'}
                    </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col items-center space-y-6">
                    {step === 'idle' && (
                        <div className="w-full space-y-4 py-4">
                            <Button
                                onClick={startLogin}
                                className="w-full h-12 text-lg bg-white text-black hover:bg-white/90 font-semibold"
                            >
                                <svg className="mr-2 h-5 w-5" viewBox="0 0 24 24">
                                    <path
                                        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                                        fill="#4285F4"
                                    />
                                    <path
                                        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                                        fill="#34A853"
                                    />
                                    <path
                                        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                                        fill="#FBBC05"
                                    />
                                    <path
                                        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                                        fill="#EA4335"
                                    />
                                </svg>
                                Continue with Google
                            </Button>
                            <Button
                                variant="ghost"
                                onClick={() => navigate('/auth')}
                                className="w-full text-white hover:bg-white/10"
                            >
                                <ArrowLeft className="mr-2 h-4 w-4" />
                                Cancel and Go Back
                            </Button>
                        </div>
                    )}

                    {(step === 'authenticating' || step === 'checking') && (
                        <div className="py-8 flex flex-col items-center space-y-4">
                            <Loader2 className="h-12 w-12 animate-spin text-primary" />
                            <p className="text-sm text-white/60 animate-pulse">
                                Please follow the prompts in the Google window...
                            </p>
                        </div>
                    )}

                    {step === 'success' && (
                        <div className="py-8 text-center space-y-4 w-full">
                            <div className="h-16 w-16 bg-green-500 rounded-full flex items-center justify-center mx-auto shadow-lg shadow-green-500/20">
                                <svg className="h-10 w-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                </svg>
                            </div>
                            <div className="space-y-2">
                                <p className="text-xl font-bold">Signed in Successfully</p>
                                <p className="text-sm text-white/60">Redirecting to your music library...</p>
                            </div>
                        </div>
                    )}

                    {step === 'error' && (
                        <div className="w-full space-y-6">
                            <Alert variant="destructive" className="bg-red-500/20 border-red-500/50 text-white">
                                <AlertCircle className="h-4 w-4 text-red-400" />
                                <AlertTitle className="font-bold">Login Check Found an Issue</AlertTitle>
                                <AlertDescription className="text-red-100 mt-2">
                                    {errorMsg}
                                </AlertDescription>
                            </Alert>

                            <div className="flex flex-col space-y-3">
                                <Button
                                    onClick={startLogin}
                                    className="w-full h-11 bg-white text-black hover:bg-white/90 font-semibold"
                                >
                                    Try Again with Google
                                </Button>
                                <Button
                                    variant="outline"
                                    onClick={() => navigate('/auth')}
                                    className="w-full h-11 border-white/20 text-white hover:bg-white/10"
                                >
                                    <ArrowLeft className="mr-2 h-4 w-4" />
                                    Return to Login Screen
                                </Button>
                            </div>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
};

export default GoogleAuthVerify;
