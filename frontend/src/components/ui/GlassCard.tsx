import React from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

interface GlassCardProps {
  children: React.ReactNode;
  className?: string;
  hover?: boolean;
  onClick?: () => void; // Added onClick property
}

export const GlassCard: React.FC<GlassCardProps> = ({
  children,
  className,
  hover = true,
  onClick, // Destructure onClick
}) => {
  return (
    <motion.div
      className={cn(
        'rounded-2xl border border-white/20 shadow-2xl',
        'bg-white/10 backdrop-blur-md',
        hover && 'hover:bg-white/15 hover:border-white/30 transition-all duration-300',
        className
      )}
      whileHover={hover ? { y: -5, scale: 1.02 } : {}}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      onClick={onClick} // Pass onClick to the div
    >
      {children}
    </motion.div>
  );
};