import React, { useEffect, useState } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, CheckCircle2, XCircle } from 'lucide-react';

const ActivationPage = () => {
    const [searchParams] = useSearchParams();
    const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
    const [message, setMessage] = useState('');
    const navigate = useNavigate();
    const token = searchParams.get('token');

    useEffect(() => {
        const activateAccount = async () => {
            if (!token) {
                setStatus('error');
                setMessage('Missing activation token.');
                return;
            }

            try {
                const base = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';
                const res = await fetch(`${base}/api/activate`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ token }),
                });

                const data = await res.json();

                if (res.ok) {
                    setStatus('success');
                    setMessage(data.message || 'Account activated successfully!');
                } else {
                    setStatus('error');
                    setMessage(data.detail || 'Activation failed.');
                }
            } catch (error: any) {
                setStatus('error');
                setMessage(error.message || 'An error occurred during activation.');
            }
        };

        activateAccount();
    }, [token]);

    return (
        <div className="min-h-screen bg-background flex items-center justify-center p-4">
            <Card className="w-full max-w-md">
                <CardHeader className="text-center">
                    <CardTitle className="text-2xl font-bold">Account Activation</CardTitle>
                    <CardDescription>
                        {status === 'loading' && 'Verifying your activation token...'}
                        {status === 'success' && 'Your account is now active.'}
                        {status === 'error' && 'Something went wrong.'}
                    </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col items-center space-y-6 pt-4">
                    {status === 'loading' && (
                        <Loader2 className="w-12 h-12 text-primary animate-spin" />
                    )}

                    {status === 'success' && (
                        <>
                            <CheckCircle2 className="w-16 h-16 text-green-500" />
                            <p className="text-center text-muted-foreground">{message}</p>
                            <Button asChild className="w-full">
                                <Link to="/auth">Go to Login</Link>
                            </Button>
                        </>
                    )}

                    {status === 'error' && (
                        <>
                            <XCircle className="w-16 h-16 text-destructive" />
                            <p className="text-center text-muted-foreground">{message}</p>
                            <Button asChild variant="outline" className="w-full">
                                <Link to="/auth">Back to Signup</Link>
                            </Button>
                        </>
                    )}
                </CardContent>
            </Card>
        </div>
    );
};

export default ActivationPage;
