/**
 * Maps cryptic Firebase error codes to user-friendly, customer-centric messages.
 * This prevents users from seeing technical jargon like "auth/invalid-credential".
 */
export const getFriendlyErrorMessage = (error: any): string => {
    const errorCode = error?.code || '';
    const message = error?.message || '';

    // Handle common Firebase Auth error codes
    switch (errorCode) {
        case 'auth/invalid-credential':
        case 'auth/wrong-password':
        case 'auth/user-not-found':
            return 'Incorrect email or password. Please check your details and try again.';

        case 'auth/invalid-email':
            return 'That email address doesn\'t look quite right. Please check for typos.';

        case 'auth/user-disabled':
            return 'This account has been disabled. Please contact support for assistance.';

        case 'auth/email-already-in-use':
            return 'An account with this email already exists. Try signing in instead.';

        case 'auth/operation-not-allowed':
            return 'This sign-in method is currently unavailable. Please try another way.';

        case 'auth/weak-password':
            return 'Your password is too weak. Please use at least 8 characters with a mix of letters and numbers.';

        case 'auth/too-many-requests':
            return 'Too many unsuccessful attempts. Please wait a moment before trying again.';

        case 'auth/requires-recent-login':
            return 'For your security, please log out and log back in before making this change.';

        case 'auth/popup-blocked':
            return 'The sign-in popup was blocked by your browser. Please allow popups for this site.';

        case 'auth/popup-closed-by-user':
            return 'Sign-in was cancelled. Please try again to continue.';

        case 'auth/network-request-failed':
            return 'Connection lost. Please check your internet and try again.';

        default:
            // If it's a generic "Firebase: Error (auth/...)" message, clean it up
            if (message.includes('Firebase: Error (auth/')) {
                const match = message.match(/\(auth\/([^)]+)\)/);
                if (match) {
                    const code = match[1].replace(/-/g, ' ');
                    return `Authentication issue: ${code}. Please try again.`;
                }
            }

            return message || 'An unexpected error occurred. Please try again.';
    }
};
