import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { updateProfile as firebaseUpdateProfile } from 'firebase/auth'; // Renamed to avoid confusion
import { useProfileAPI } from '@/hooks/useProfileAPI';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { Loader2, User, Mail, Calendar, Edit3, Save, X, LogOut, ArrowLeft } from 'lucide-react';

const Profile = () => {
  const { currentUser, logout } = useAuth();
  const { profile, loading: profileApiLoading, updateDisplayName, updateProfilePicture } = useProfileAPI();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false); // Renamed to "saving" for clarity
  const [formData, setFormData] = useState({
    displayName: '',
    email: '',
  });

  // Update form data when profile changes
  useEffect(() => {
    if (profile) {
      setFormData({
        displayName: profile.display_name || '',
        email: profile.email || '',
      });
    }
  }, [profile]);

  // Image upload logic
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const resizeImageToDataUrl = (file: File, maxWidth = 800, quality = 0.8): Promise<string> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const reader = new FileReader();
      reader.onload = (e) => {
        if (!e.target) return reject(new Error('FileReader error'));
        img.src = e.target.result as string;
      };
      reader.onerror = (e) => reject(new Error('Failed to read file'));
      reader.readAsDataURL(file);

      img.onload = () => {
        const canvas = document.createElement('canvas');
        const scale = Math.min(1, maxWidth / img.width);
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject(new Error('Canvas not supported'));
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        resolve(dataUrl);
      };
      img.onerror = () => reject(new Error('Invalid image'));
    });
  };

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const displayName = profile?.display_name || currentUser?.displayName || currentUser?.email?.split('@')[0] || 'User';
  const userEmail = profile?.email || currentUser?.email || 'No email';
  const userCreatedAt = currentUser?.metadata?.creationTime
    ? new Date(currentUser.metadata.creationTime).toLocaleDateString()
    : 'Unknown';

  const handleEdit = () => {
    setIsEditing(true);
    // Reset form data to current profile values when entering edit mode
    if (profile) {
      setFormData({
        displayName: profile.display_name || '',
        email: profile.email || '',
      });
    }
  };

  const handleCancel = () => {
    setIsEditing(false);
    // Reset form data to current profile values when canceling
    if (profile) {
      setFormData({
        displayName: profile.display_name || '',
        email: profile.email || '',
      });
    }
  };

  const handleSave = async () => {
    if (!currentUser) return;

    const newDisplayName = formData.displayName.trim() || null;

    setSaving(true);
    try {
      // Update the display name via the API
      await updateDisplayName(newDisplayName);

      // Also update Firebase profile for consistency
      await firebaseUpdateProfile(currentUser, {
        displayName: newDisplayName,
      });

      toast({
        title: 'Success',
        description: 'Profile updated successfully!',
      });
      setIsEditing(false);
    } catch (error: any) {
      console.error('Profile update error:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to update profile',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleChoosePhoto = () => {
    if (!fileInputRef.current) return;
    fileInputRef.current.click();
  };

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast({ title: 'Invalid file', description: 'Please choose an image file', variant: 'destructive' });
      return;
    }

    setSaving(true);
    try {
      const dataUrl = await resizeImageToDataUrl(file, 800, 0.8);
      await updateProfilePicture(dataUrl);
      toast({ title: 'Profile picture updated', description: 'Your profile picture was updated successfully' });
    } catch (err: any) {
      console.error('Failed to upload profile picture', err);
      toast({ title: 'Upload failed', description: err?.message || 'Could not upload picture', variant: 'destructive' });
    } finally {
      setSaving(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleRemovePhoto = async () => {
    setSaving(true);
    try {
      await updateProfilePicture(null);
      toast({ title: 'Profile picture removed', description: 'Your profile picture was removed' });
    } catch (err: any) {
      console.error('Failed to remove profile picture', err);
      toast({ title: 'Remove failed', description: err?.message || 'Could not remove picture', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = async () => {
    try {
      await logout();
      toast({
        title: 'Success',
        description: 'Successfully logged out!',
      });
      navigate('/auth'); // Redirect after logout
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to logout',
        variant: 'destructive',
      });
    }
  };

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const loadingState = profileApiLoading || saving;

  return (
    <div className="min-h-screen bg-gradient-hero p-4">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center mb-4">
            <Button
              variant="ghost"
              size="sm"
              className="text-white hover:bg-white/10 mr-4"
              onClick={() => navigate('/')}
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to App
            </Button>
          </div>
          <h1 className="text-4xl font-bold text-white mb-2">Profile</h1>
          <p className="text-white/80">Manage your account settings and preferences</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Profile Card */}
          <div className="lg:col-span-1">
            <Card className="bg-white/10 backdrop-blur-sm border-white/20">
              <CardHeader className="text-center pb-4">
                <div className="relative mx-auto mb-4">
                  <Avatar className="h-24 w-24 mx-auto">
                    <AvatarImage
                      src={profile?.profile_picture || currentUser?.photoURL || undefined}
                      alt={displayName}
                    />
                    <AvatarFallback className="text-2xl font-semibold bg-primary text-primary-foreground">
                      {getInitials(displayName)}
                    </AvatarFallback>
                  </Avatar>
                </div>
                <CardTitle className="text-xl text-white">{displayName}</CardTitle>
                <CardDescription className="text-white/70">{userEmail}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center space-x-3 text-white/80">
                  <Calendar className="h-4 w-4" />
                  <span className="text-sm">Member since {userCreatedAt}</span>
                </div>

                <Separator className="bg-white/20" />
                <Button
                  variant="outline"
                  className="w-full border-white/20 text-white hover:bg-white/10"
                  onClick={handleLogout}
                  disabled={loadingState}
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  Sign Out
                </Button>
              </CardContent>
            </Card>
          </div>

          {/* Profile Details */}
          <div className="lg:col-span-2">
            <Card className="bg-white/10 backdrop-blur-sm border-white/20">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-2xl text-white">Profile Information</CardTitle>
                    <CardDescription className="text-white/70">
                      Update your personal information and preferences
                    </CardDescription>
                  </div>
                  {!isEditing ? (
                    <Button
                      variant="outline"
                      className="border-white/20 text-white hover:bg-white/10"
                      onClick={handleEdit}
                    >
                      <Edit3 className="mr-2 h-4 w-4" />
                      Edit Profile
                    </Button>
                  ) : (
                    <div className="flex space-x-2">
                      <Button
                        variant="outline"
                        className="border-white/20 text-white hover:bg-white/10"
                        onClick={handleCancel}
                        disabled={loadingState}
                      >
                        <X className="mr-2 h-4 w-4" />
                        Cancel
                      </Button>
                      <Button
                        onClick={handleSave}
                        disabled={loadingState}
                      >
                        {loadingState && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        <Save className="mr-2 h-4 w-4" />
                        Save Changes
                      </Button>
                    </div>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Display Name */}
                <div className="space-y-2">
                  <Label htmlFor="displayName" className="text-white">
                    <User className="inline mr-2 h-4 w-4" />
                    Display Name
                  </Label>
                  <p className="text-xs text-white/60">
                    Leave empty to use your email address as display name
                  </p>
                  {isEditing ? (
                    <Input
                      id="displayName"
                      value={formData.displayName}
                      onChange={(e) => handleInputChange('displayName', e.target.value)}
                      className="bg-white/10 border-white/20 text-white placeholder:text-white/50"
                      placeholder="Enter your display name"
                      disabled={loadingState}
                    />
                  ) : (
                    <div className="p-3 bg-white/10 rounded-md border border-white/20">
                      <span className="text-white">{displayName}</span>
                    </div>
                  )}
                </div>

                {/* Email */}
                <div className="space-y-2">
                  <Label htmlFor="email" className="text-white">
                    <Mail className="inline mr-2 h-4 w-4" />
                    Email Address
                  </Label>
                  <div className="p-3 bg-white/10 rounded-md border border-white/20">
                    <span className="text-white">{userEmail}</span>
                  </div>
                  <p className="text-xs text-white/60">
                    Your email address cannot be changed for security reasons
                  </p>
                </div>

                {/* Profile Picture */}
                <div className="space-y-2">
                  <Label className="text-white">
                    Profile Picture
                  </Label>
                  <div className="p-3 bg-white/10 rounded-md border border-white/20">
                    <div className="flex items-center justify-between">
                      <span className="text-white">
                        {currentUser?.providerData?.[0]?.providerId === 'google.com' && currentUser?.photoURL
                          ? 'Using Google profile picture'
                          : profile?.profile_picture
                            ? 'Custom profile picture'
                            : 'Default avatar (initials)'
                        }
                      </span>
                    </div>
                  </div>
                  {isEditing && (
                    <div className="mt-3 flex space-x-2">
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={handleFileSelected}
                      />
                      <Button onClick={handleChoosePhoto} disabled={loadingState} variant="outline" className="border-white/20 text-white hover:bg-white/10">
                        Upload Photo
                      </Button>
                      <Button onClick={handleRemovePhoto} disabled={loadingState || !profile?.profile_picture} variant="ghost" className="text-white">
                        Remove Photo
                      </Button>
                    </div>
                  )}
                </div>

                {/* Account Type */}
                <div className="space-y-2">
                  <Label className="text-white">Account Type</Label>
                  <div className="p-3 bg-white/10 rounded-md border border-white/20">
                    <span className="text-white">
                      {currentUser?.providerData[0]?.providerId === 'google.com'
                        ? 'Google Account'
                        : 'Email & Password'
                      }
                    </span>
                  </div>
                </div>

                {/* Email Verification Status */}
                <div className="space-y-2">
                  <Label className="text-white">Email Verification</Label>
                  <div className="p-3 bg-white/10 rounded-md border border-white/20">
                    <span className="text-sm text-green-400">
                      ✓ Email Verified
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Profile;