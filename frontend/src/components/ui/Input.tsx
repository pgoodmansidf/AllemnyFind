import React, { InputHTMLAttributes } from 'react';
import { cn } from '@/lib/utils'; // Assuming cn utility is correctly imported from your lib

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  icon?: React.ReactNode;
  glass?: boolean;
}

// Use React.forwardRef to allow react-hook-form to attach its ref
export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, icon, glass = true, className, ...props }, ref) => {
    return (
      <div className="w-full space-y-2">
        {label && (
          <label className="block text-sm font-medium text-white/90">
            {label}
          </label>
        )}
        <div className="relative">
          {icon && (
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none z-10">
              {/* Ensure icon itself doesn't have conflicting styles if it's a component */}
              <span className="text-white/60">{icon}</span>
            </div>
          )}
          <input
            // Attach the ref here so react-hook-form can manage the input
            ref={ref}
            className={cn(
              'w-full rounded-xl px-4 py-3 text-white placeholder-white/50 text-base',
              'focus:outline-none focus:ring-2 focus:ring-primary-400 focus:ring-offset-0',
              'transition-all duration-300 border',
              glass
                ? 'bg-white/10 border-white/20 backdrop-blur-md hover:bg-white/15 focus:bg-white/20 shadow-lg'
                : 'bg-gray-800 border-gray-600 hover:border-gray-500 focus:border-primary-500',
              icon && 'pl-11', // Add padding if an icon is present
              error && 'border-red-400 focus:ring-red-400', // Highlight border on error
              className
            )}
            {...props}
          />
        </div>
        {/* Display error message below the input */}
        {error && (
          <p className="text-sm text-red-400 mt-1">
            {error}
          </p>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input'; // Recommended for better debugging with React DevTools
