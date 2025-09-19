// src/pages/AuthPage.tsx
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { LoginForm } from '@/components/auth/LoginForm';
import { RegisterForm } from '@/components/auth/RegisterForm';

// Typing animation component
const TypingAnimation: React.FC<{ text: string }> = ({ text }) => {
  const [displayedText, setDisplayedText] = useState('');
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showCursor, setShowCursor] = useState(true);

  useEffect(() => {
    if (currentIndex < text.length) {
      const timeout = setTimeout(() => {
        setDisplayedText(prev => prev + text[currentIndex]);
        setCurrentIndex(prev => prev + 1);
      }, 140); // Typing speed
      return () => clearTimeout(timeout);
    }
  }, [currentIndex, text]);

  // Blinking cursor effect
  useEffect(() => {
    const interval = setInterval(() => {
      setShowCursor(prev => !prev);
    }, 500); // Blink speed
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex items-center justify-center h-8">
      <span className="text-white/80 text-lg font-light tracking-wide">
        {displayedText}
      </span>
      <motion.span
        className="inline-block w-0.5 h-6 bg-white/80 ml-1"
        animate={{ opacity: showCursor ? 1 : 0 }}
        transition={{ duration: 0 }}
      />
    </div>
  );
};

export const AuthPage: React.FC = () => {
  const [isLogin, setIsLogin] = useState(true);

  return (
    <div 
      className="min-h-screen flex items-center justify-center p-6 relative overflow-hidden"
      style={{
        background: 'linear-gradient(135deg, #1e3a8a 0%, #1e40af 25%, #2563eb 50%, #059669 75%, #10b981 100%)',
      }}
    >
      {/* Animated background particles */}
      <div className="absolute inset-0 overflow-hidden">
        {[...Array(30)].map((_, i) => (
          <motion.div
            key={i}
            className="absolute w-1 h-1 bg-white/20 rounded-full"
            initial={{
              x: Math.random() * window.innerWidth,
              y: Math.random() * window.innerHeight,
            }}
            animate={{
              x: Math.random() * window.innerWidth,
              y: Math.random() * window.innerHeight,
            }}
            transition={{
              duration: Math.random() * 20 + 10,
              repeat: Infinity,
              repeatType: 'reverse',
              ease: 'linear',
            }}
          />
        ))}
      </div>

      
      {/* Main Container with Logo and Form Side by Side */}
      <motion.div 
        className="relative z-10 w-full max-w-5xl mx-auto"
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.8, ease: 'easeOut' }}
      >
        <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-3xl shadow-2xl overflow-hidden">
          <div className="grid grid-cols-1 lg:grid-cols-2 min-h-[600px]">
            
            {/* Left Side - Logo Section */}
            <div className="flex flex-col items-center justify-center p-12 relative">
              {/* Animated gradient background for logo section */}
              <div className="absolute inset-0 bg-gradient-to-br from-blue-600/10 to-green-600/10"></div>
              
              <motion.div 
                className="relative z-10 flex flex-col items-center"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8, delay: 0.2 }}
              >
                {/* Logo */}
                <motion.div
                  initial={{ scale: 0, rotate: -180 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{
                    duration: 1,
                    ease: 'easeOut',
                    type: 'spring',
                    stiffness: 100,
                  }}
                  className="mb-8"
                >
                  <img 
                    src="/images/allemny_find_blue.png" 
                    alt="Allemny Find" 
                    className="h-32 w-auto object-contain filter drop-shadow-2xl"
                  />
                </motion.div>

                {/* Typing Animation */}
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.5, delay: 1.5 }}
                  className="w-full"
                >
                  <TypingAnimation text="Knowledge Management" />
                </motion.div>

                {/* Decorative elements */}
                <motion.div
                  className="mt-12 flex space-x-2"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.5, delay: 2 }}
                >
                  {[0, 1, 2].map((i) => (
                    <motion.div
                      key={i}
                      className="w-2 h-2 bg-white/40 rounded-full"
                      animate={{
                        y: [0, -10, 0],
                      }}
                      transition={{
                        duration: 1.5,
                        repeat: Infinity,
                        delay: i * 0.2,
                        ease: 'easeInOut',
                      }}
                    />
                  ))}
                </motion.div>
              </motion.div>

              {/* Mobile separator - shows only on small screens */}
              <div className="lg:hidden absolute bottom-0 left-1/4 right-1/4 h-px bg-gradient-to-r from-transparent via-white/30 to-transparent"></div>
            </div>

            {/* Vertical Separator - Desktop only */}
            <div className="hidden lg:block absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-3/4">
              <div className="w-px h-full bg-gradient-to-b from-transparent via-white/30 to-transparent"></div>
            </div>

            {/* Right Side - Auth Form */}
            <div className="flex items-center justify-center p-8 lg:p-12 relative">
              <div className="w-full max-w-md">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={isLogin ? 'login' : 'register'}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    transition={{ 
                      duration: 0.4, 
                      ease: 'easeInOut',
                    }}
                    className="w-full"
                  >
                    {isLogin ? (
                      <div>
                          <LoginForm onSwitchToRegister={() => setIsLogin(false)} />
                      </div>
                    ) : (
                      <div>
                        <RegisterForm onSwitchToLogin={() => setIsLogin(true)} />
                      </div>
                    )}
                  </motion.div>
                </AnimatePresence>
              </div>
            </div>
          </div>
        </div>

        {/* Additional decorative elements outside the main container */}
        <motion.div
          className="absolute -top-10 -right-10 w-20 h-20 bg-gradient-to-br from-blue-400/20 to-transparent rounded-full blur-xl"
          animate={{
            scale: [1, 1.2, 1],
            opacity: [0.3, 0.6, 0.3],
          }}
          transition={{
            duration: 4,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        />
        <motion.div
          className="absolute -bottom-10 -left-10 w-16 h-16 bg-gradient-to-br from-green-400/20 to-transparent rounded-full blur-xl"
          animate={{
            scale: [1.2, 1, 1.2],
            opacity: [0.6, 0.3, 0.6],
          }}
          transition={{
            duration: 3,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        />
      </motion.div>
    </div>
  );
};