// src/App.tsx
import React, { useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthPage } from '@/pages/AuthPage';
import { Dashboard } from '@/pages/Dashboard';
import { IngestionPage } from '@/pages/IngestionPage';
import { SearchPage } from '@/pages/SearchPage';
import { StarredDocumentsPage } from '@/pages/StarredDocumentsPage';
import { Layout } from '@/components/Layout/Layout';
import { LogoSplash } from '@/components/ui/LogoSplash';
import { useAuthStore } from '@/store/authStore';
import { SummarizationPage } from '@/pages/SummarizationPage';
import { LeaderboardPage } from "@/pages/LeaderboardPage";
import { SmartMatchPage } from '@/pages/SmartMatchPage';
import { TechVaultPage } from '@/pages/TechVaultPage';
import { KnowledgeScope } from '@/pages/KnowledgeScope';
import { UserAdminPage } from '@/pages/UserAdminPage';
import { UserProfilePage } from '@/pages/UserProfilePage';
import { InnovateAllemny } from "@/pages/InnovateAllemny";
import { AllemnyChat } from "@/pages/AllemnyChat";

function AppContent() {
  const [isInitialized, setIsInitialized] = useState(false);
  const { isAuthenticated, user, checkAuth, showSplash, setShowSplash, getDefaultRoute } = useAuthStore();
  const navigate = useNavigate();

  useEffect(() => {
    const initializeApp = async () => {
      await checkAuth();
      setIsInitialized(true);
    };

    initializeApp();
  }, [checkAuth]);

  const handleSplashComplete = () => {
    setShowSplash(false);
    // Navigate to the appropriate route based on user role
    const defaultRoute = getDefaultRoute();
    navigate(defaultRoute);
  };

  // Show splash screen if needed
  if (showSplash && isAuthenticated) {
    return <LogoSplash onComplete={handleSplashComplete} duration={3000} />;
  }

  // Show loading while initializing
  if (!isInitialized) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary-900 to-success-900">
        <div className="flex flex-col items-center space-y-4">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
          <p className="text-white/70">Loading...</p>
        </div>
      </div>
    );
  }

  // Check if user is admin
  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin' || user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN';

  return (
    <Routes>
      <Route
        path="/login"
        element={!isAuthenticated ? <AuthPage /> : <Navigate to={getDefaultRoute()} />}
      />
      
      {/* Dashboard - Admin only (KEEP LAYOUT TEMPORARILY) */}
      <Route
        path="/dashboard"
        element={
          isAuthenticated ? (
            isAdmin ? (
              <Layout>
                <Dashboard />
              </Layout>
            ) : (
              <Navigate to="/search" />
            )
          ) : (
            <Navigate to="/login" />
          )
        }
      />
      
      {/* Search - Available to all authenticated users */}
      <Route
        path="/search"
        element={
          isAuthenticated ? (
            <SearchPage />
          ) : (
            <Navigate to="/login" />
          )
        }
      />
      
      {/* Ingestion - Admin only (KEEP LAYOUT TEMPORARILY) */}
      <Route
        path="/ingestion"
        element={
          isAuthenticated ? (
            isAdmin ? (
              <Layout>
                <IngestionPage />
              </Layout>
            ) : (
              <Navigate to="/search" />
            )
          ) : (
            <Navigate to="/login" />
          )
        }
      />
      
      {/* Starred Documents - All authenticated users */}
      <Route
        path="/starred-documents"
        element={
          isAuthenticated ? (
            <StarredDocumentsPage />
          ) : (
            <Navigate to="/login" />
          )
        }
      />
      
      {/* TechVault - All authenticated users */}
      <Route
        path="/techvault"
        element={
          isAuthenticated ? (
            <TechVaultPage />
          ) : (
            <Navigate to="/login" />
          )
        }
      />
      
      {/* Summarization - Admin only */}
      <Route
        path="/summarization"
        element={
          isAuthenticated ? (
            isAdmin ? (
              <SummarizationPage />
            ) : (
              <Navigate to="/search" />
            )
          ) : (
            <Navigate to="/login" />
          )
        }
      />
      
      {/* SmartMatch - All authenticated users */}
      <Route
        path="/smartmatch"
        element={
          isAuthenticated ? (
            <SmartMatchPage />
          ) : (
            <Navigate to="/login" />
          )
        }
      />
      
      {/* KnowledgeScope - Admin only */}
      <Route
        path="/knowledgescope"
        element={
          isAuthenticated ? (
            isAdmin ? (
              <KnowledgeScope />
            ) : (
              <Navigate to="/search" />
            )
          ) : (
            <Navigate to="/login" />
          )
        }
      />

      {/* Leaderboard - All authenticated users */}
      <Route
        path="/leaderboard"
        element={
          isAuthenticated ? (
            <LeaderboardPage />
          ) : (
            <Navigate to="/login" />
          )
        }
      />

      {/* AI Chat - Admin only */}
      <Route
        path="/chat"
        element={
          isAuthenticated ? (
            isAdmin ? (
              <AllemnyChat />
            ) : (
              <Navigate to="/search" />
            )
          ) : (
            <Navigate to="/login" />
          )
        }
      />

      {/* Innovate Allemny - All authenticated users */}
      <Route
        path="/innovate"
        element={
          isAuthenticated ? (
            <InnovateAllemny />
          ) : (
            <Navigate to="/login" />
          )
        }
      />
      
      {/* User Admin - Admin only */}
      <Route
        path="/admin/users"
        element={
          isAuthenticated ? (
            isAdmin ? (
              <UserAdminPage />
            ) : (
              <Navigate to="/search" />
            )
          ) : (
            <Navigate to="/login" />
          )
        }
      />
      
      {/* User Profile - All authenticated users */}
      <Route
        path="/profile"
        element={
          isAuthenticated ? (
            <UserProfilePage />
          ) : (
            <Navigate to="/login" />
          )
        }
      />
      
      {/* Default route */}
      <Route
        path="/"
        element={<Navigate to={isAuthenticated ? getDefaultRoute() : "/login"} />}
      />
    </Routes>
  );
}

function App() {
  return (
    <Router>
      <div className="App">
        <AppContent />
        <Toaster
          position="top-right"
          toastOptions={{
            duration: 4000,
            style: {
              background: 'rgba(255, 255, 255, 0.1)',
              backdropFilter: 'blur(10px)',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              color: 'white',
            },
          }}
        />
      </div>
    </Router>
  );
}

export default App;