import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { useForm } from 'react-hook-form';
import { User, Lock, Mail, Eye, EyeOff, UserPlus } from 'lucide-react';
import { GlassCard } from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useAuthStore } from '@/store/authStore';
import { RegisterRequest } from '@/services/api';

interface RegisterFormProps {
  onSwitchToLogin: () => void;
}

export const RegisterForm: React.FC<RegisterFormProps> = ({ onSwitchToLogin }) => {
  const [showPassword, setShowPassword] = useState(false);
  const { register: registerUser, isLoading } = useAuthStore();

  const {
    register,
    handleSubmit,
    formState: { errors },
    watch,
  } = useForm<RegisterRequest & { confirmPassword: string }>();

  const password = watch('password');

  const onSubmit = async (data: RegisterRequest & { confirmPassword: string }) => {
    const { confirmPassword, ...registerData } = data;
    await registerUser(registerData);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
    >
      <GlassCard className="w-full max-w-md p-8">
        <div className="text-center mb-8">
          <h2 className="text-3xl font-bold text-white mb-2">Create Account</h2>
          <p className="text-white/70">Join Allemny Find today</p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          <Input
            label="Username"
            icon={<User className="h-5 w-5" />}
            placeholder="Choose a username"
            {...register('username', {
              required: 'Username is required',
              minLength: {
                value: 3,
                message: 'Username must be at least 3 characters',
              },
              pattern: {
                value: /^[a-zA-Z0-9_]+$/,
                message: 'Username can only contain letters, numbers, and underscores',
              },
            })}
            error={errors.username?.message}
          />

          <Input
            label="Email (Optional)"
            type="email"
            icon={<Mail className="h-5 w-5" />}
            placeholder="Enter your email"
            {...register('email', {
              pattern: {
                value: /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i,
                message: 'Invalid email address',
              },
            })}
            error={errors.email?.message}
          />

          <Input
            label="Full Name (Optional)"
            icon={<UserPlus className="h-5 w-5" />}
            placeholder="Enter your full name"
            {...register('full_name')}
          />

          <div className="relative">
            <Input
              label="Password"
              type={showPassword ? 'text' : 'password'}
              icon={<Lock className="h-5 w-5" />}
              placeholder="Create a password"
              {...register('password', {
                required: 'Password is required',
                minLength: {
                  value: 6,
                  message: 'Password must be at least 6 characters',
                },
                pattern: {
                  value: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
                  message: 'Password must contain at least one lowercase letter, one uppercase letter, and one number',
                },
              })}
              error={errors.password?.message}
            />
            <button
              type="button"
              className="absolute right-3 top-11 text-white/60 hover:text-white"
              onClick={() => setShowPassword(!showPassword)}
            >
              {showPassword ? (
                <EyeOff className="h-5 w-5" />
              ) : (
                <Eye className="h-5 w-5" />
              )}
            </button>
          </div>

          <Input
            label="Confirm Password"
            type="password"
            icon={<Lock className="h-5 w-5" />}
            placeholder="Confirm your password"
            {...register('confirmPassword', {
              required: 'Please confirm your password',
              validate: (value) =>
                value === password || 'Passwords do not match',
            })}
            error={errors.confirmPassword?.message}
          />

          <Button
            type="submit"
            variant="success"
            size="lg"
            loading={isLoading}
            className="w-full"
          >
            Create Account
          </Button>
        </form>

        <div className="mt-6 text-center">
          <p className="text-white/70">
            Already have an account?{' '}
            <button
              onClick={onSwitchToLogin}
              className="text-primary-400 hover:text-primary-300 font-medium transition-colors"
            >
              Sign in
            </button>
          </p>
        </div>
      </GlassCard>
    </motion.div>
  );
};