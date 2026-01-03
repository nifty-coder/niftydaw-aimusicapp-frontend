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
  fetchSignInMethodsForEmail,
  getRedirectResult,
  deleteUser,
  getAdditionalUserInfo,
} from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { getFriendlyErrorMessage } from '@/lib/auth-errors';



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
    // Check if account exists with different provider
    const methods = await fetchSignInMethodsForEmail(auth, email);
    if (methods.length > 0) {
      if (methods.includes('google.com')) {
        throw new Error('This email is already linked to a Google account. Please use Google Sign In.');
      }
      if (methods.includes('password')) {
        throw new Error('An account with this email already exists. Please sign in.');
      }
    }

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
    try {
      const methods = await fetchSignInMethodsForEmail(auth, email);
      if (methods.includes('google.com') && !methods.includes('password')) {
        throw new Error('Please sign in with Google.');
      }
    } catch (e: any) {
      if (e.message === 'Please sign in with Google.') throw e;
    }

    try {
      const cred = await signInWithEmailAndPassword(auth, email, password);
      if (!cred.user.emailVerified) {
        await signOut(auth);
        throw new Error('Email not verified. Please check your inbox.');
      }
    } catch (err: any) {
      throw new Error(getFriendlyErrorMessage(err));
    }
  };

  const logout = async () => {
    try {
      localStorage.removeItem('user-profile-picture');
    } catch (e) {
      // noop
    }
    await signOut(auth);
  };

  const signInWithGoogle = async () => {
    const provider = new GoogleAuthProvider();
    provider.addScope('email');
    provider.addScope('profile');
    provider.setCustomParameters({ prompt: 'select_account' });

    try {
      console.log('--- Google Sign-In Phase 1: Starting Popup ---');
      const cred = await signInWithPopup(auth, provider);

      const user = cred.user;
      const additionalInfo = getAdditionalUserInfo(cred);
      const isNewUser = additionalInfo?.isNewUser;

      // Extremely aggressive email detection
      const email = user.email ||
        (user.providerData && user.providerData[0]?.email) ||
        (additionalInfo?.profile as any)?.email;

      if (!email) {
        console.error('--- Google Sign-In Error: No email found ---');
        if (isNewUser) {
          console.log('Cleaning up new user created without email...');
          try { await deleteUser(user); } catch (e) { console.error('Cleanup failed:', e); }
        }
        await signOut(auth);
        throw new Error('We could not retrieve an email address from your Google account. Please ensure your Google account shares your email.');
      }

      const methods = await fetchSignInMethodsForEmail(auth, email);
      const hasPasswordMethod = methods.includes('password');

      // If they have a password account, we block Google sign-in
      // We also check if they have multiple methods. If they have 'password' and this is a 'isNewUser' Google attempt,
      // it means they are trying to use Google for an email that ALREADY has a password.
      if (hasPasswordMethod) {
        // Always attempt cleanup if we have a password method and this Google attempt is new
        // or if Google is not the ONLY method (meaning it was just added as a link/new account)
        if (isNewUser || methods.length > 1) {
          try {
            await deleteUser(user);
          } catch (e) {
            console.error('Deletion failed', e);
          }
        }

        await signOut(auth);
        throw new Error('CONFLICT_PASSWORD_EXISTS');
      }

      // Success
      if (isNewUser) {
        try { localStorage.removeItem('music-analyzer-library'); } catch (e) { }
      } else {
        console.log('--- Google Sign-In Complete: Signed In Existing User ---');
      }

      return cred;
    } catch (err: any) {
      console.error('--- Google Sign-In Phase 4: Error Handler ---', err.code || err.message);

      if (err.message === 'CONFLICT_PASSWORD_EXISTS') {
        throw new Error('This email is already linked to a password account. Please sign in with your email and password.');
      }

      if (err.code === 'auth/account-exists-with-different-credential') {
        // If Firebase blocks it automatically, we still want to inform the user
        throw new Error('This email is already linked to a different sign-in method. Please use your existing account (Email/Password).');
      }

      throw new Error(getFriendlyErrorMessage(err));
    }
  };

  const refreshUser = async () => {
    if (currentUser) {
      await currentUser.reload();
      setCurrentUser({ ...currentUser });
    }
  };

  useEffect(() => {
    let unsub = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      setLoading(false);
    });

    (async () => {
      try {
        const result = await getRedirectResult(auth as any);
        if (result && getAdditionalUserInfo(result)?.isNewUser) {
          localStorage.removeItem('music-analyzer-library');
        }
      } catch (e) { }
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
