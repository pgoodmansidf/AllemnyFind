// src/components/auth/RegisterForm.tsx
import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { useForm } from 'react-hook-form';
import { User, Lock, Eye, EyeOff, Mail, CheckCircle, AlertCircle } from 'lucide-react';
import { GlassCard } from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useAuthStore } from '@/store/authStore';
import { apiService } from '@/services/api';
import toast from 'react-hot-toast';

interface RegisterFormProps {
  onSwitchToLogin: () => void;
}

interface RegisterData {
  email: string;
  password: string;
  confirmPassword: string;
}

export const RegisterForm: React.FC<RegisterFormProps> = ({ onSwitchToLogin }) => {
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [emailVerified, setEmailVerified] = useState(false);
  const [fullName, setFullName] = useState('');
  const [checkingEmail, setCheckingEmail] = useState(false);
  const { login } = useAuthStore();
  
  const {
    register,
    handleSubmit,
    formState: { errors },
    setError,
    watch,
    clearErrors,
    getValues,
  } = useForm<RegisterData>();

  // Helper function to safely extract error messages
  const extractErrorMessage = (error: any): string => {
    let errorMessage = 'An error occurred. Please try again.';
    
    if (error?.response?.data) {
      const data = error.response.data;
      
      // Handle FastAPI validation errors
      if (data.detail) {
        if (typeof data.detail === 'string') {
          errorMessage = data.detail;
        } else if (Array.isArray(data.detail)) {
          // FastAPI validation errors are arrays of objects
          const firstError = data.detail[0];
          if (firstError) {
            if (typeof firstError === 'string') {
              errorMessage = firstError;
            } else if (firstError.msg) {
              errorMessage = String(firstError.msg);
            } else if (firstError.message) {
              errorMessage = String(firstError.message);
            }
          }
        } else if (typeof data.detail === 'object' && data.detail.msg) {
          errorMessage = String(data.detail.msg);
        }
      } else if (data.message) {
        errorMessage = data.message;
      } else if (typeof data === 'string') {
        errorMessage = data;
      }
    } else if (error?.message) {
      errorMessage = error.message;
    }
    
    return errorMessage;
  };

  const checkEmail = async (email: string) => {
    setCheckingEmail(true);
    clearErrors('email');
    
    try {
      const response = await apiService.api.post('/auth/check-email', { email });
      const data = response.data;
      
      if (!data.authorized) {
        setError('email', { 
          message: data.message || 'Your email is not authorized. Please contact IT at allemny@sidf.gov.sa' 
        });
        setEmailVerified(false);
        return false;
      }
      
      if (data.already_registered) {
        setError('email', { 
          message: data.message || 'This email is already registered. Please login.' 
        });
        setEmailVerified(false);
        return false;
      }
      
      setFullName(data.full_name || '');
      setEmailVerified(true);
      toast.success('Email verified! Please create your password.');
      return true;
      
    } catch (error: any) {
      console.error('Email check error:', error);
      
      const errorMessage = extractErrorMessage(error);
      setError('email', { message: errorMessage });
      setEmailVerified(false);
      return false;
    } finally {
      setCheckingEmail(false);
    }
  };

  const onSubmit = async (data: RegisterData) => {
    // If email is not verified yet, verify it first
    if (!emailVerified) {
      const verified = await checkEmail(data.email);
      if (!verified) return;
      // Don't proceed with registration, just verify email
      return;
    }
    
    if (data.password !== data.confirmPassword) {
      setError('confirmPassword', { message: 'Passwords do not match' });
      return;
    }
    
    try {
      // Create URL-encoded form data (not multipart)
      const params = new URLSearchParams();
      params.append('email', data.email);
      params.append('password', data.password);
      params.append('confirm_password', data.confirmPassword);
      
      const response = await apiService.api.post('/auth/register', params, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      });
      
      if (response.data) {
        toast.success('Registration successful! Logging you in...');
        
        // Auto-login after registration
        setTimeout(async () => {
          try {
            const loginSuccess = await login({
              username: data.email,
              password: data.password,
            });
            
            if (loginSuccess) {
              // The authStore will handle navigation to dashboard with splash screen
            }
          } catch (loginError) {
            console.error('Auto-login failed:', loginError);
            toast.error('Registration successful! Please login manually.');
            onSwitchToLogin();
          }
        }, 1000);
      }
    } catch (error: any) {
      console.error('Registration error:', error);
      console.error('Error response:', error.response?.data);
      
      const errorMessage = extractErrorMessage(error);
      toast.error(errorMessage);
      
      // Don't set email error for general registration errors
      if (errorMessage.toLowerCase().includes('email')) {
        setError('email', { message: errorMessage });
      }
    }
  };

  const password = watch('password');
  const email = watch('email');
  
  // Helper function to safely render error messages
  const renderErrorMessage = (fieldError: any): string => {
    if (!fieldError) return '';
    if (typeof fieldError === 'string') return fieldError;
    if (fieldError.message && typeof fieldError.message === 'string') {
      return fieldError.message;
    }
    if (fieldError.type && typeof fieldError.type === 'string') {
      return `Validation error: ${fieldError.type}`;
    }
    return 'Invalid input';
  };

  // Helper function to determine if error is authorization-related
  const isAuthorizationError = (errorMessage: string): boolean => {
    return errorMessage.toLowerCase().includes('not authorized') || 
           errorMessage.toLowerCase().includes('contact it') ||
           errorMessage.toLowerCase().includes('allemny@sidf.gov.sa');
  };

  // Determine if button should be disabled
  const isButtonDisabled = () => {
    if (checkingEmail) return true;
    if (!emailVerified) {
      // For "Verify Email" - only disable if no email or email has errors
      return !email || !!errors.email;
    }
    // For "Create Account" - disable if passwords don't meet requirements
    return !password || !!errors.password || !!errors.confirmPassword;
  };
  
  return (
    <GlassCard className="w-full p-8">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
      >
        <div className="text-center mb-8">
          <p className="text-white/70 text-lg">Verify your invitation</p>
        </div>
        
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          {/* Email Field with Verification */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-white/90">
              Email Address
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none z-10">
                <Mail className="h-5 w-5 text-white/60" />
              </div>
              <input
                type="email"
                className={`
                  w-full pl-10 pr-12 py-3
                  bg-white/10 backdrop-blur-md
                  border ${errors.email ? 'border-red-500/50' : emailVerified ? 'border-green-500/50' : 'border-white/20'}
                  rounded-lg text-white placeholder-white/50
                  focus:outline-none focus:ring-2
                  ${emailVerified ? 'focus:ring-green-500/50' : 'focus:ring-primary-500/50'}
                  transition-all duration-200
                `}
                placeholder="Enter your email"
                {...register('email', {
                  required: 'Email is required',
                  pattern: {
                    value: /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i,
                    message: 'Invalid email address',
                  },
                })}
                onBlur={(e) => {
                  if (e.target.value && !errors.email && !emailVerified) {
                    checkEmail(e.target.value);
                  }
                }}
                disabled={emailVerified}
              />
              {emailVerified && (
                <div className="absolute inset-y-0 right-0 pr-3 flex items-center">
                  <CheckCircle className="h-5 w-5 text-green-500" />
                </div>
              )}
              {checkingEmail && (
                <div className="absolute inset-y-0 right-0 pr-3 flex items-center">
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                </div>
              )}
            </div>
            {errors.email && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className={`
                  p-3 rounded-lg flex items-start space-x-2 mt-2
                  ${isAuthorizationError(renderErrorMessage(errors.email)) 
                    ? 'bg-yellow-500/20 border border-yellow-500/40 backdrop-blur-sm' 
                    : 'bg-red-500/20 border border-red-500/40 backdrop-blur-sm'
                  }
                `}
              >
                <AlertCircle className={`
                  h-5 w-5 mt-0.5 flex-shrink-0
                  ${isAuthorizationError(renderErrorMessage(errors.email)) ? 'text-yellow-400' : 'text-red-400'}
                `} />
                <p className={`
                  text-sm font-medium
                  ${isAuthorizationError(renderErrorMessage(errors.email)) ? 'text-yellow-200' : 'text-red-200'}
                `}>
                  {renderErrorMessage(errors.email)}
                </p>
              </motion.div>
            )}
          </div>
          
          {/* Show full name if email is verified */}
          {emailVerified && fullName && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              className="p-3 bg-green-500/10 border border-green-500/30 rounded-lg"
            >
              <p className="text-green-400 text-sm">
                Welcome, <strong>{fullName}</strong>! Please create your password.
              </p>
            </motion.div>
          )}
          
          {/* Password Fields - Only show after email verification */}
          {emailVerified && (
            <>
              <div className="space-y-2">
                <label className="block text-sm font-medium text-white/90">
                  Password
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none z-10">
                    <Lock className="h-5 w-5 text-white/60" />
                  </div>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    className={`
                      w-full pl-10 pr-12 py-3
                      bg-white/10 backdrop-blur-md
                      border ${errors.password ? 'border-red-500/50' : 'border-white/20'}
                      rounded-lg text-white placeholder-white/50
                      focus:outline-none focus:ring-2 focus:ring-primary-500/50
                      transition-all duration-200
                    `}
                    placeholder="Create password"
                    {...register('password', {
                      required: 'Password is required',
                      minLength: {
                        value: 8,
                        message: 'Password must be at least 8 characters',
                      },
                      pattern: {
                        value: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/,
                        message: 'Password must contain uppercase, lowercase, number and special character',
                      },
                    })}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center"
                  >
                    {showPassword ? (
                      <EyeOff className="h-5 w-5 text-white/60 hover:text-white transition-colors" />
                    ) : (
                      <Eye className="h-5 w-5 text-white/60 hover:text-white transition-colors" />
                    )}
                  </button>
                </div>
                {errors.password && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="p-2 bg-red-500/20 border border-red-500/40 rounded-lg flex items-start space-x-2 mt-2 backdrop-blur-sm"
                  >
                    <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0 text-red-400" />
                    <p className="text-red-200 text-sm">
                      {renderErrorMessage(errors.password)}
                    </p>
                  </motion.div>
                )}
                {/* Password requirements hint */}
                {!errors.password && emailVerified && (
                  <p className="text-white/50 text-xs">
                    Must be at least 8 characters with uppercase, lowercase, number and special character
                  </p>
                )}
              </div>
              
              <div className="space-y-2">
                <label className="block text-sm font-medium text-white/90">
                  Confirm Password
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none z-10">
                    <Lock className="h-5 w-5 text-white/60" />
                  </div>
                  <input
                    type={showConfirmPassword ? 'text' : 'password'}
                    className={`
                      w-full pl-10 pr-12 py-3
                      bg-white/10 backdrop-blur-md
                      border ${errors.confirmPassword ? 'border-red-500/50' : 'border-white/20'}
                      rounded-lg text-white placeholder-white/50
                      focus:outline-none focus:ring-2 focus:ring-primary-500/50
                      transition-all duration-200
                    `}
                    placeholder="Confirm password"
                    {...register('confirmPassword', {
                      required: 'Please confirm password',
                      validate: (value) =>
                        value === password || 'Passwords do not match',
                    })}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center"
                  >
                    {showConfirmPassword ? (
                      <EyeOff className="h-5 w-5 text-white/60 hover:text-white transition-colors" />
                    ) : (
                      <Eye className="h-5 w-5 text-white/60 hover:text-white transition-colors" />
                    )}
                  </button>
                </div>
                {errors.confirmPassword && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="p-2 bg-red-500/20 border border-red-500/40 rounded-lg flex items-start space-x-2 mt-2 backdrop-blur-sm"
                  >
                    <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0 text-red-400" />
                    <p className="text-red-200 text-sm">
                      {renderErrorMessage(errors.confirmPassword)}
                    </p>
                  </motion.div>
                )}
              </div>
            </>
          )}
          
          <Button
            type="submit"
            variant="primary"
            size="lg"
            fullWidth
            disabled={isButtonDisabled()}
            loading={checkingEmail}
          >
            {emailVerified ? 'Create Account' : 'Verify Email'}
          </Button>
          
          <div className="text-center">
            <button
              type="button"
              onClick={onSwitchToLogin}
              className="text-white/70 hover:text-white transition-colors"
            >
              Already verified? Sign in
            </button>
          </div>
        </form>
      </motion.div>
    </GlassCard>
  );
};