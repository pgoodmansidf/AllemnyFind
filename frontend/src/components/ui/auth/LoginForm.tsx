import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { useForm } from 'react-hook-form';
import { User, Lock, Mail, Eye, EyeOff } from 'lucide-react';
import { GlassCard } from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useAuthStore } from '@/store/authStore';
import { LoginRequest } from '@/services/api';

interface LoginFormProps {
  onSwitchToRegister: () => void;
}

export const LoginForm: React.FC<LoginFormProps> = ({ onSwitchToRegister }) => {
  const [showPassword, setShowPassword] = useState(false);
  const { login, isLoading } = useAuthStore();

  const {
    register,
    handleSubmit,
    formState: { errors },
    setError,
  } = useForm<LoginRequest>();

  const onSubmit = async (data: LoginRequest) => {
    const success = await login(data);
    if (!success) {
      setError('username', { message: 'Invalid credentials' });
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
    >
      <GlassCard className="w-full max-w-md p-8">
        <div className="text-center mb-8">
          <h2 className="text-3xl font-bold text-white mb-2">Welcome Back</h2>
          <p className="text-white/70">Sign in to your account</p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          <Input
            label="Username"
            icon={<User className="h-5 w-5" />}
            placeholder="Enter your username"
            {...register('username', {
              required: 'Username is required',
              minLength: {
                value: 3,
                message: 'Username must be at least 3 characters',
              },
            })}
            error={errors.username?.message}
          />

          <div>
            <Input
              label="Password"
              type={showPassword ? 'text' : 'password'}
              icon={<Lock className="h-5 w-5" />}
              placeholder="Enter your password"
              {...register('password', {
                required: 'Password is required',
                minLength: {
                  value: 6,
                  message: 'Password must be at least 6 characters',
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

          <Button
            type="submit"
            variant="primary"
            size="lg"
            loading={isLoading}
            className="w-full"
          >
            Sign In
          </Button>
        </form>

        <div className="mt-6 text-center">
          <p className="text-white/70">
            Don't have an account?{' '}
            <button
              onClick={onSwitchToRegister}
              className="text-primary-400 hover:text-primary-300 font-medium transition-colors"
            >
              Sign up
            </button>
          </p>
        </div>
      </GlassCard>
    </motion.div>
  );
};