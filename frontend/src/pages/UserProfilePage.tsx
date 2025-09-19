// src/pages/UserProfilePage.tsx - UPDATED WITH ENHANCED ERROR HANDLING
import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  User,
  Mail,
  Phone,
  Building,
  Lock,
  Save,
  X,
  Shield,
  Calendar,
  Edit
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { PageLayout } from '@/components/layout/PageLayout';
import { GlassCard } from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useAuthStore } from '@/store/authStore';
import { apiService } from '@/services/api';
import toast from 'react-hot-toast';

// Enhanced error message extractor with better Pydantic handling
const getErrorMessage = (error: any): string => {
  // Add debug logging in development
  if (process.env.NODE_ENV === 'development') {
    console.error('Full error object:', error);
    console.error('Response data:', error?.response?.data || error?.data);
  }

  try {
    // Check if this is an API wrapper response (from apiService.put/post/etc)
    if (error && typeof error === 'object' && error.hasOwnProperty('ok') && !error.ok) {
      // This is from our API wrapper, error data is in error.data
      const data = error.data;

      if (data && typeof data === 'object') {
        // Handle 'detail' field (FastAPI/Pydantic standard)
        if (data.detail !== undefined) {
          const detail = data.detail;

          // If detail is a string, return it directly
          if (typeof detail === 'string') {
            return detail;
          }

          // If detail is an array (Pydantic validation errors)
          if (Array.isArray(detail)) {
            const messages = detail.map((err: any) => {
              // Handle Pydantic validation error format
              if (typeof err === 'object' && err !== null) {
                // Extract the message from the error object
                if (err.msg) return String(err.msg);
                if (err.message) return String(err.message);

                // If there's a 'loc' field, create a descriptive message
                if (err.loc && Array.isArray(err.loc)) {
                  const field = err.loc[err.loc.length - 1] || 'field';
                  return `Validation error in ${field}`;
                }

                return null;
              }
              return String(err);
            }).filter(Boolean);

            return messages.length > 0
              ? messages.join(', ')
              : 'Validation error occurred';
          }

          // If detail is an object (single validation error)
          if (typeof detail === 'object' && detail !== null) {
            if (detail.msg) return String(detail.msg);
            if (detail.message) return String(detail.message);

            if (detail.loc && Array.isArray(detail.loc)) {
              const field = detail.loc[detail.loc.length - 1] || 'field';
              return `Validation error in ${field}`;
            }

            return 'Validation error occurred';
          }
        }

        // Check other common error fields
        if (data.message && typeof data.message === 'string') {
          return data.message;
        }

        if (data.error && typeof data.error === 'string') {
          return data.error;
        }
      }
    }

    // Check if there's a response with data (axios error format)
    if (error?.response?.data) {
      const data = error.response.data;

      // Handle 'detail' field (FastAPI/Pydantic standard)
      if (data.detail !== undefined) {
        const detail = data.detail;

        // If detail is a string, return it directly
        if (typeof detail === 'string') {
          return detail;
        }

        // If detail is an array (Pydantic validation errors)
        if (Array.isArray(detail)) {
          const messages = detail.map((err: any) => {
            // Handle Pydantic validation error format
            if (typeof err === 'object' && err !== null) {
              // Extract the message from the error object
              if (err.msg) return String(err.msg);
              if (err.message) return String(err.message);

              // If there's a 'loc' field, create a descriptive message
              if (err.loc && Array.isArray(err.loc)) {
                const field = err.loc[err.loc.length - 1] || 'field';
                return `Validation error in ${field}`;
              }

              return null;
            }
            return String(err);
          }).filter(Boolean);

          return messages.length > 0
            ? messages.join(', ')
            : 'Validation error occurred';
        }

        // If detail is an object (single validation error)
        if (typeof detail === 'object' && detail !== null) {
          if (detail.msg) return String(detail.msg);
          if (detail.message) return String(detail.message);

          if (detail.loc && Array.isArray(detail.loc)) {
            const field = detail.loc[detail.loc.length - 1] || 'field';
            return `Validation error in ${field}`;
          }

          return 'Validation error occurred';
        }
      }

      // Check other common error fields
      if (data.message && typeof data.message === 'string') {
        return data.message;
      }

      if (data.error && typeof data.error === 'string') {
        return data.error;
      }

      // Check if data itself is a string
      if (typeof data === 'string') {
        return data;
      }
    }

    // Check if error has a message property
    if (error?.message && typeof error.message === 'string') {
      return error.message;
    }

    // Default fallback
    return 'An unexpected error occurred';

  } catch (parseError) {
    // Log parsing error in development
    if (process.env.NODE_ENV === 'development') {
      console.error('Error parsing error message:', parseError);
    }
    return 'An unexpected error occurred';
  }
};

// Wrapper function to ensure toast always gets a string
const showErrorToast = (error: any): void => {
  const message = getErrorMessage(error);
  // Double-check that message is a string
  if (typeof message === 'string') {
    toast.error(message);
  } else {
    console.error('Non-string error message:', message);
    toast.error('An error occurred');
  }
};

export const UserProfilePage: React.FC = () => {
  const navigate = useNavigate();
  const { user, updateUser } = useAuthStore();
  const [isEditing, setIsEditing] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Form states
  const [fullName, setFullName] = useState('');
  const [department, setDepartment] = useState('');
  const [phone, setPhone] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  useEffect(() => {
    if (user) {
      setFullName(user.full_name || '');
      setDepartment(user.department || '');
      setPhone(user.phone || '');
    }
  }, [user]);

  const handleUpdateProfile = async () => {
    setIsLoading(true);
    try {
      // Use the proper API wrapper method with all fields (API expects all fields)
      const result = await apiService.put('/auth/profile', {
        full_name: fullName || null,
        department: department || null,
        phone: phone || null,
        current_password: null,
        new_password: null,
      });

      if (result.ok) {
        updateUser(result.data);
        toast.success('Profile updated successfully');
        setIsEditing(false);
      } else {
        // Handle API error response
        showErrorToast(result);
      }
    } catch (error: any) {
      console.error('Profile update error:', error);
      showErrorToast(error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleChangePassword = async () => {
    // Validate passwords match
    if (newPassword !== confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }

    // Validate password length
    if (newPassword.length < 8) {
      toast.error('Password must be at least 8 characters');
      return;
    }

    setIsLoading(true);
    try {
      // Use the proper API wrapper method with all fields (API expects all fields)
      const result = await apiService.put('/auth/profile', {
        full_name: null,
        department: null,
        phone: null,
        current_password: currentPassword,
        new_password: newPassword,
      });

      if (result.ok) {
        toast.success('Password changed successfully');
        setIsChangingPassword(false);
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
      } else {
        // Handle API error response
        showErrorToast(result);
      }
    } catch (error: any) {
      console.error('Password change error:', error);
      showErrorToast(error);
    } finally {
      setIsLoading(false);
    }
  };

  const cancelEdit = () => {
    setFullName(user?.full_name || '');
    setDepartment(user?.department || '');
    setPhone(user?.phone || '');
    setIsEditing(false);
  };

  const cancelPasswordChange = () => {
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setIsChangingPassword(false);
  };

  return (
    <PageLayout>
      <div className="relative z-10 p-6 pt-20 max-w-4xl mx-auto">
        <h1 className="text-2xl font-bold text-white mb-8">My Profile</h1>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Profile Card */}
          <div className="md:col-span-1">
            <GlassCard className="p-6 text-center">
              <div className="h-24 w-24 mx-auto rounded-full bg-gradient-to-br from-primary-400 to-success-400 flex items-center justify-center mb-4">
                <User className="h-12 w-12 text-white" />
              </div>
              <h2 className="text-xl font-bold text-white mb-1">{user?.full_name || 'User'}</h2>
              <p className="text-white/60 text-sm mb-4">{user?.email || ''}</p>
              
              <div className="space-y-2 text-left">
                <div className="flex items-center space-x-2 text-white/80">
                  <Shield className="h-4 w-4" />
                  <span className="text-sm">Role: {user?.role || 'standard'}</span>
                </div>
                <div className="flex items-center space-x-2 text-white/80">
                  <Calendar className="h-4 w-4" />
                  <span className="text-sm">
                    Joined: {user?.created_at ? new Date(user.created_at).toLocaleDateString() : 'N/A'}
                  </span>
                </div>
                {user?.last_login && (
                  <div className="flex items-center space-x-2 text-white/80">
                    <Calendar className="h-4 w-4" />
                    <span className="text-sm">
                      Last login: {new Date(user.last_login).toLocaleDateString()}
                    </span>
                  </div>
                )}
              </div>
            </GlassCard>
          </div>

          {/* Profile Details */}
          <div className="md:col-span-2 space-y-6">
            {/* Basic Information */}
            <GlassCard className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-white">Basic Information</h3>
                {!isEditing && (
                  <Button
                    variant="glass"
                    size="sm"
                    icon={<Edit className="h-4 w-4" />}
                    onClick={() => setIsEditing(true)}
                  >
                    Edit
                  </Button>
                )}
              </div>

              <div className="space-y-4">
                <Input
                  label="Full Name"
                  icon={<User className="h-5 w-5" />}
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  disabled={!isEditing}
                  placeholder="Enter your full name"
                />
                <Input
                  label="Email"
                  icon={<Mail className="h-5 w-5" />}
                  value={user?.email || ''}
                  disabled
                  placeholder="Your email address"
                />
                <Input
                  label="Department"
                  icon={<Building className="h-5 w-5" />}
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                  disabled={!isEditing}
                  placeholder="Enter your department"
                />
                <Input
                  label="Phone"
                  icon={<Phone className="h-5 w-5" />}
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  disabled={!isEditing}
                  placeholder="Enter your phone number"
                />

                {isEditing && (
                  <div className="flex space-x-2 pt-4">
                    <Button
                      variant="primary"
                      icon={<Save className="h-4 w-4" />}
                      onClick={handleUpdateProfile}
                      disabled={isLoading}
                    >
                      Save Changes
                    </Button>
                    <Button
                      variant="glass"
                      icon={<X className="h-4 w-4" />}
                      onClick={cancelEdit}
                      disabled={isLoading}
                    >
                      Cancel
                    </Button>
                  </div>
                )}
              </div>
            </GlassCard>

            {/* Change Password */}
            <GlassCard className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-white">Security</h3>
                {!isChangingPassword && (
                  <Button
                    variant="glass"
                    size="sm"
                    icon={<Lock className="h-4 w-4" />}
                    onClick={() => setIsChangingPassword(true)}
                  >
                    Change Password
                  </Button>
                )}
              </div>

              {isChangingPassword ? (
                <div className="space-y-4">
                  <Input
                    label="Current Password"
                    type="password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder="Enter current password"
                  />
                  <Input
                    label="New Password"
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Enter new password (min 8 characters)"
                  />
                  <Input
                    label="Confirm New Password"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Confirm new password"
                  />

                  <div className="flex space-x-2">
                    <Button
                      variant="primary"
                      onClick={handleChangePassword}
                      disabled={isLoading}
                    >
                      Update Password
                    </Button>
                    <Button
                      variant="glass"
                      onClick={cancelPasswordChange}
                      disabled={isLoading}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <p className="text-white/60">
                  Keep your account secure by using a strong password.
                </p>
              )}
            </GlassCard>
          </div>
        </div>
      </div>
    </PageLayout>
  );
};