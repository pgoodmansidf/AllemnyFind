// src/components/ui/LogoSplash.tsx
import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface LogoSplashProps {
  onComplete: () => void;
  duration?: number;
}

export const LogoSplash: React.FC<LogoSplashProps> = ({
  onComplete,
  duration = 3000,
}) => {
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsVisible(false);
      setTimeout(onComplete, 500);
    }, duration);

    return () => clearTimeout(timer);
  }, [duration, onComplete]);

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{
            background: 'linear-gradient(135deg, #1e3a8a 0%, #1e40af 25%, #2563eb 50%, #059669 75%, #10b981 100%)',
          }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.5 }}
        >
          {/* Animated background particles */}
          <div className="absolute inset-0 overflow-hidden">
            {[...Array(25)].map((_, i) => (
              <motion.div
                key={i}
                className="absolute w-2 h-2 bg-white/20 rounded-full"
                initial={{
                  x: Math.random() * window.innerWidth,
                  y: Math.random() * window.innerHeight,
                }}
                animate={{
                  x: Math.random() * window.innerWidth,
                  y: Math.random() * window.innerHeight,
                }}
                transition={{
                  duration: Math.random() * 10 + 5,
                  repeat: Infinity,
                  repeatType: 'reverse',
                }}
              />
            ))}
          </div>

          {/* Main logo */}
          <motion.div
            className="relative z-10 flex flex-col items-center"
            initial={{ scale: 0, rotate: -180 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{
              duration: 1.2,
              ease: 'easeOut',
              type: 'spring',
              stiffness: 100,
            }}
          >
            <div className="p-8 rounded-3xl bg-white/10 backdrop-blur-md border border-white/20 shadow-2xl">
              <img 
                src="/images/allemny_full_white_logo.png" 
                alt="Allemny" 
                className="h-56 w-auto object-contain"
              />
            </div>
          </motion.div>

          {/* Loading indicator */}
          <motion.div
            className="absolute bottom-20 flex flex-col items-center space-y-4"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1, duration: 0.5 }}
          >
            <div className="flex space-x-1">
              {[0, 1, 2].map((i) => (
                <motion.div
                  key={i}
                  className="w-2 h-2 bg-white/60 rounded-full"
                  animate={{
                    scale: [1, 1.5, 1],
                    opacity: [0.5, 1, 0.5],
                  }}
                  transition={{
                    duration: 1,
                    repeat: Infinity,
                    delay: i * 0.2,
                  }}
                />
              ))}
            </div>
            <p className="text-white/80 text-sm font-medium">
              Initializing Knowledge Base...
            </p>
          </motion.div>

          {/* Decorative elements */}
          <motion.div
            className="absolute top-10 left-10 w-20 h-20 border border-white/20 rounded-full"
            animate={{ rotate: 360 }}
            transition={{ duration: 20, repeat: Infinity, ease: 'linear' }}
          />
          <motion.div
            className="absolute bottom-10 right-10 w-16 h-16 border border-white/10 rounded-full"
            animate={{ rotate: -360 }}
            transition={{ duration: 15, repeat: Infinity, ease: 'linear' }}
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
};