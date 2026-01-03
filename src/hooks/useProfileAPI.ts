import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { apiService, Profile } from '@/lib/api';

export const useProfileAPI = () => {
  const { currentUser } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch profile from backend API
  const fetchProfile = async () => {
    if (!currentUser) {
      setProfile(null);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const response = await apiService.getProfile();

      if (response.success && response.data) {
        setProfile(response.data);
        // Persist profile picture locally for UI resilience across reloads
        try {
          if (response.data.profile_picture) {
            localStorage.setItem('user-profile-picture', response.data.profile_picture);
          } else {
            localStorage.removeItem('user-profile-picture');
          }
        } catch (e) {
          // noop
        }
      } else {
        if (response.error?.includes('404') || response.error?.includes('not found')) {
          // Profile doesn't exist, create it
          console.log('Profile not found, creating new profile...');
          await createProfile();
        } else {
          console.error('Error fetching profile:', response.error);
          setError(response.error || 'Failed to fetch profile');
        }
      }
    } catch (err: any) {
      console.error('Error fetching profile:', err);
      setError(err.message || 'Failed to fetch profile');
    } finally {
      setLoading(false);
    }
  };

  // Create a new profile
  const createProfile = async () => {
    if (!currentUser) return;

    try {
      const newProfileData = {
        user_id: currentUser.uid,
        display_name: currentUser.displayName || null,
        email: currentUser.email || '',
        profile_picture: null,
      };

      console.log('Creating profile for user:', currentUser.uid);

      const response = await apiService.createProfile(newProfileData);

      if (response.success && response.data) {
        console.log('Profile created successfully:', response.data);
        setProfile(response.data);
        try {
          if (response.data.profile_picture) {
            localStorage.setItem('user-profile-picture', response.data.profile_picture);
          } else {
            localStorage.removeItem('user-profile-picture');
          }
        } catch (e) { }
      } else {
        console.error('Error creating profile:', response.error);
        setError(response.error || 'Failed to create profile');
      }
    } catch (err: any) {
      console.error('Error creating profile:', err);
      setError(err.message || 'Failed to create profile');
    }
  };

  // Update profile
  const updateProfile = async (updates: Partial<Profile>) => {
    if (!currentUser || !profile) return;

    try {
      setError(null);

      const response = await apiService.updateProfile(updates);

      if (response.success && response.data) {
        console.log('Profile updated successfully:', response.data);
        setProfile(response.data);
        try {
          if (response.data.profile_picture) {
            localStorage.setItem('user-profile-picture', response.data.profile_picture);
          } else {
            localStorage.removeItem('user-profile-picture');
          }
        } catch (e) { }
        return response.data;
      } else {
        console.error('Error updating profile:', response.error);
        setError(response.error || 'Failed to update profile');
        throw new Error(response.error || 'Failed to update profile');
      }
    } catch (err: any) {
      console.error('Error updating profile:', err);
      setError(err.message || 'Failed to update profile');
      throw err;
    }
  };

  // On init, hydrate any locally persisted profile picture so avatar persists across reloads
  useEffect(() => {
    try {
      const pic = localStorage.getItem('user-profile-picture');
      if (pic && !profile) {
        // Create a minimal profile object with only picture so UI can show it until real profile loads
        setProfile((prev) => prev || ({ id: 'local', user_id: currentUser?.uid || 'local', display_name: null, email: currentUser?.email || '', profile_picture: pic, created_at: new Date().toISOString(), updated_at: new Date().toISOString() } as Profile));
      }
    } catch (e) {
      // noop
    }
  }, []);

  // Update profile picture
  const updateProfilePicture = async (profilePicture: string | null) => {
    return updateProfile({ profile_picture: profilePicture });
  };

  // Update display name
  const updateDisplayName = async (displayName: string | null) => {
    return updateProfile({ display_name: displayName });
  };

  // Delete profile
  const deleteProfile = async () => {
    if (!currentUser) return;

    try {
      setError(null);

      const response = await apiService.deleteProfile();

      if (response.success) {
        console.log('Profile deleted successfully');
        setProfile(null);
      } else {
        console.error('Error deleting profile:', response.error);
        setError(response.error || 'Failed to delete profile');
        throw new Error(response.error || 'Failed to delete profile');
      }
    } catch (err: any) {
      console.error('Error deleting profile:', err);
      setError(err.message || 'Failed to delete profile');
      throw err;
    }
  };

  // Fetch profile when currentUser changes OR when window is focused (cross-device sync)
  useEffect(() => {
    fetchProfile();

    const handleFocus = () => {
      console.log('Window focused, refetching profile for sync...');
      fetchProfile();
    };

    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [currentUser]);

  return {
    profile,
    loading,
    error,
    updateProfile,
    updateProfilePicture,
    updateDisplayName,
    deleteProfile,
    refetch: fetchProfile,
  };
};
