import React from 'react';
import { motion } from 'framer-motion';
import { Search, Database, Zap } from 'lucide-react';

interface LogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showText?: boolean;
  animated?: boolean;
}

export const Logo: React.FC<LogoProps> = ({
  size = 'md',
  showText = true,
  animated = true,
}) => {
  const sizes = {
    sm: { container: 'h-8', icon: 'h-6 w-6', text: 'text-lg' },
    md: { container: 'h-12', icon: 'h-8 w-8', text: 'text-2xl' },
    lg: { container: 'h-16', icon: 'h-12 w-12', text: 'text-3xl' },
    xl: { container: 'h-24', icon: 'h-16 w-16', text: 'text-5xl' },
  };

  const containerVariants = {
    initial: { scale: 0, rotate: -180 },
    animate: {
      scale: 1,
      rotate: 0,
      transition: {
        duration: 0.8,
        ease: 'easeOut',
        staggerChildren: 0.2,
      },
    },
  };

  const iconVariants = {
    initial: { scale: 0, rotate: 90 },
    animate: {
      scale: 1,
      rotate: 0,
      transition: { duration: 0.5, ease: 'easeOut' },
    },
  };

  const textVariants = {
    initial: { opacity: 0, x: -20 },
    animate: {
      opacity: 1,
      x: 0,
      transition: { duration: 0.5, ease: 'easeOut' },
    },
  };

  return (
    <motion.div
      className={`flex items-center space-x-3 ${sizes[size].container}`}
      variants={animated ? containerVariants : {}}
      initial={animated ? 'initial' : ''}
      animate={animated ? 'animate' : ''}
    >
      {/* Logo Icon */}
      <motion.div
        className="relative flex items-center justify-center"
        variants={animated ? iconVariants : {}}
      >
        {/* Background gradient circle */}
        <div
          className={`absolute inset-0 rounded-full bg-gradient-to-br from-primary-400 via-primary-500 to-success-500 ${sizes[size].icon}`}
        />
        
        {/* Glass overlay */}
        <div
          className={`absolute inset-0 rounded-full bg-white/20 backdrop-blur-sm border border-white/30 ${sizes[size].icon}`}
        />
        
        {/* Main icon */}
        <div className="relative z-10 flex items-center justify-center">
          <Search className={`text-white ${sizes[size].icon.replace('h-', 'h-').replace('w-', 'w-')}`} />
        </div>
        
        {/* Floating accent icons */}
        <motion.div
          className="absolute -top-1 -right-1"
          animate={animated ? { rotate: 360 } : {}}
          transition={{ duration: 8, repeat: Infinity, ease: 'linear' }}
        >
          <Database className="h-3 w-3 text-success-400" />
        </motion.div>
        
        <motion.div
          className="absolute -bottom-1 -left-1"
          animate={animated ? { rotate: -360 } : {}}
          transition={{ duration: 6, repeat: Infinity, ease: 'linear' }}
        >
          <Zap className="h-3 w-3 text-primary-400" />
        </motion.div>
      </motion.div>

      {/* Logo Text */}
      {showText && (
        <motion.div
          className="flex flex-col"
          variants={animated ? textVariants : {}}
        >
          <h1 className={`font-bold text-white ${sizes[size].text}`}>
            Allemny
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary-400 to-success-400">
              Find
            </span>
          </h1>
          {size === 'xl' && (
            <p className="text-sm text-white/60 -mt-1">Knowledge Management</p>
          )}
        </motion.div>
      )}
    </motion.div>
  );
};