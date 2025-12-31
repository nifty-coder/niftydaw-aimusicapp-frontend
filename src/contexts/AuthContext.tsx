import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  User,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
} from 'firebase/auth';
import { auth } from '@/lib/firebase';

interface AuthContextType {
  currentUser: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<any>;
  logout: () => Promise<void>;
  signInWithGoogle: () => Promise<any>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

interface AuthProviderProps {
  children: React.ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const signUp = async (email: string, password: string) => {
    const base = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';
    const res = await fetch(`${base}/api/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.detail || 'Signup failed');
    }

    const data = await res.json();
    return data;
  };

  const signIn = async (email: string, password: string) => {
    const cred = await signInWithEmailAndPassword(auth, email, password);
    if (!cred.user.emailVerified) {
      await signOut(auth);
      throw new Error('Email not verified. Please check your inbox.');
    }
  };

  const logout = async () => {
    await signOut(auth);
  };

  const signInWithGoogle = async () => {
    const provider = new GoogleAuthProvider();

    // Add custom parameters for better error handling
    provider.setCustomParameters({
      prompt: 'select_account'
    });

    try {
      const cred = await signInWithPopup(auth, provider);
      // If this is a newly created user via Google, clear any existing local library
      try {
        if ((cred as any)?.additionalUserInfo?.isNewUser) {
          localStorage.removeItem('music-analyzer-library');
        }
      } catch (e) {
        // noop
      }
      return cred;
    } catch (err: any) {
      // Check for specific OAuth configuration errors
      const errorCode = err?.code;
      const errorMessage = err?.message || '';

      // Provide helpful error messages for common OAuth issues
      if (errorCode === 'auth/unauthorized-domain' || errorMessage.includes('invalid') || errorMessage.includes('blocked')) {
        const currentDomain = window.location.hostname;
        const helpfulMessage = `
Google Sign-In Configuration Error:

Your domain "${currentDomain}" is not authorized in Firebase Console.

To fix this:
1. Go to Firebase Console: https://console.firebase.google.com/
2. Select your project
3. Go to Authentication > Settings > Authorized domains
4. Click "Add domain" and add:
   - ${currentDomain}
   - localhost (if testing locally)
   - Your production domain (if deployed)

5. Also ensure Google Sign-In is enabled:
   - Go to Authentication > Sign-in method
   - Enable "Google" provider
   - Add your OAuth client ID if required

6. In Google Cloud Console:
   - Go to APIs & Services > Credentials
   - Find your OAuth 2.0 Client ID
   - Add authorized JavaScript origins:
     * http://localhost:8080 (for local dev)
     * https://${currentDomain} (for production)
   - Add authorized redirect URIs:
     * http://localhost:8080 (for local dev)
     * https://${currentDomain} (for production)
        `.trim();

        console.error(helpfulMessage);
        throw new Error(helpfulMessage);
      }

      // Some hosting environments / browser policies (Cross-Origin-Opener-Policy/Cross-Origin-Embedder-Policy)
      // can block popup usage. Fall back to redirect flow in that case.
      if (errorCode === 'auth/popup-blocked' || errorCode === 'auth/popup-closed-by-user') {
        console.warn('signInWithPopup failed, falling back to redirect. Error:', err);
        try {
          await signInWithRedirect(auth, provider);
        } catch (redirectErr) {
          console.error('signInWithRedirect also failed:', redirectErr);
          throw redirectErr;
        }
        return null;
      }

      // Re-throw other errors
      throw err;
    }
  };

  const refreshUser = async () => {
    if (currentUser) {
      await currentUser.reload();
      // Force update the currentUser state to ensure UI reflects changes immediately
      setCurrentUser({ ...currentUser });
    }
  };

  useEffect(() => {
    let unsub = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      setLoading(false);
    });

    // If user was redirected back from a provider (signInWithRedirect), process the result
    (async () => {
      try {
        const result = await getRedirectResult(auth as any);
        if (result && (result as any).additionalUserInfo?.isNewUser) {
          try {
            localStorage.removeItem('music-analyzer-library');
          } catch (e) {
            // noop
          }
        }
      } catch (e) {
        // ignore: no redirect result available is normal
      }
    })();

    return () => {
      if (typeof unsub === 'function') unsub();
    };
  }, []);

  const value: AuthContextType = {
    currentUser,
    loading,
    signIn,
    signUp,
    logout,
    signInWithGoogle,
    refreshUser,
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
};
