import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { useForm } from 'react-hook-form';
import { User, Lock, Eye, EyeOff } from 'lucide-react';
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
    <GlassCard className="w-full p-8">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
      >
        {/* Header */}
        <div className="text-center mb-8">
          {/*<h2 className="text-3xl font-bold text-white mb-2">Welcome Back</h2>*/}
          <p className="text-white/70 text-lg">Sign in to your account</p>
        </div>

        {/* Form */}
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
                placeholder="Enter your password"
                className="w-full rounded-xl px-4 py-3 pl-11 pr-11 text-white placeholder-white/50 text-base bg-white/10 border border-white/20 backdrop-blur-md hover:bg-white/15 focus:bg-white/20 shadow-lg focus:outline-none focus:ring-2 focus:ring-blue-400 transition-all duration-300"
                {...register('password', {
                  required: 'Password is required',
                  minLength: {
                    value: 6,
                    message: 'Password must be at least 6 characters',
                  },
                })}
              />
              <button
                type="button"
                className="absolute inset-y-0 right-0 pr-3 flex items-center z-10 text-white/60 hover:text-white transition-colors"
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? (
                  <EyeOff className="h-5 w-5" />
                ) : (
                  <Eye className="h-5 w-5" />
                )}
              </button>
            </div>
            {errors.password && (
              <p className="text-sm text-red-400 mt-1">{errors.password.message}</p>
            )}
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

        {/* Footer */}
        <div className="mt-8 text-center">
          <p className="text-white/70">
            Don't have an account?{' '}
            <button
              onClick={onSwitchToRegister}
              className="text-white-400 hover:text-blue-300 font-semibold transition-colors underline"
            >
              Verify Access
            </button>
          </p>
        </div>
      </motion.div>
    </GlassCard>
  );
};