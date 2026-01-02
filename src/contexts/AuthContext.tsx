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
      const cred = await signInWithPopup(auth, provider);
      const additionalInfo = getAdditionalUserInfo(cred);
      const isNewUser = additionalInfo?.isNewUser;

      const email = cred.user.email || (additionalInfo?.profile as any)?.email;

      console.log('Google Auth Discovery:', {
        uid: cred.user.uid,
        extractedEmail: email,
        profileEmail: (additionalInfo?.profile as any)?.email,
        isNewUser
      });

      if (!email) {
        console.warn('Blocking login: No email found in Google credential.');
        await signOut(auth);
        throw new Error('We could not retrieve an email address from your Google account.');
      }

      if (email) {
        console.log(`Verifying account status for: ${email}`);
        const base = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

        try {
          const res = await fetch(`${base}/api/check-password-user?email=${encodeURIComponent(email)}`);
          if (!res.ok) {
            console.error('Account check API returned error:', res.status);
            throw new Error('VERIFICATION_SERVICE_ERROR');
          }

          const data = await res.json();
          console.log('Backend provider check results:', data);

          if (data.has_password) {
            console.log('Conflict confirmed: Email has a password account. Cleaning up session.');

            if (isNewUser) {
              try {
                await deleteUser(cred.user);
                console.log('Duplicate Google user deleted.');
              } catch (delErr) {
                console.error('Failed to delete duplicate user:', delErr);
              }
            }

            await signOut(auth);
            throw new Error('CONFLICT_PASSWORD_EXISTS');
          }
        } catch (checkErr: any) {
          // If it's our own conflict error, rethrow it
          if (checkErr.message === 'CONFLICT_PASSWORD_EXISTS') throw checkErr;

          // For any other error (fetch error, 500 status, etc.), we MUST sign out for safety
          console.error('Account verification failed. Signing out for safety.', checkErr);
          await signOut(auth);

          if (checkErr.message === 'VERIFICATION_SERVICE_ERROR') {
            throw new Error('We couldn\'t verify your account status. Please try again in a moment.');
          }
          throw new Error('An error occurred during verification. Please use your password if this persists.');
        }
      }

      if (isNewUser) {
        try {
          localStorage.removeItem('music-analyzer-library');
        } catch (e) { }
      }
      return cred;
    } catch (err: any) {
      if (err.message === 'CONFLICT_PASSWORD_EXISTS') {
        throw new Error('This email is linked to a password account. Please sign in with your email and password.');
      }

      if (err.code === 'auth/account-exists-with-different-credential') {
        throw new Error('This email is linked to a different sign-in method. Please use your existing account.');
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
