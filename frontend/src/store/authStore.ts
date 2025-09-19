// src/store/authStore.ts
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { apiService, User, LoginRequest, RegisterRequest } from '@/services/api';
import toast from 'react-hot-toast';

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  showSplash: boolean;
  login: (credentials: LoginRequest) => Promise<boolean>;
  register: (userData: RegisterRequest) => Promise<boolean>;
  logout: () => Promise<void>;
  checkAuth: () => Promise<void>;
  updateUser: (userData: User) => void;
  clearError: () => void;
  setShowSplash: (show: boolean) => void;
  getDefaultRoute: () => string;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      isAuthenticated: false,
      isLoading: false,
      showSplash: false,

      login: async (credentials: LoginRequest): Promise<boolean> => {
        try {
          set({ isLoading: true });
          
          const tokenResponse = await apiService.login(credentials);
          localStorage.setItem('access_token', tokenResponse.access_token);
          
          const user = await apiService.getCurrentUser();
          
          // Set showSplash to true for all users after login
          set({
            user,
            isAuthenticated: true,
            isLoading: false,
            showSplash: true,
          });
          
          toast.success(`Welcome back, ${user.full_name || user.username}!`);
          return true;
        } catch (error) {
          set({ isLoading: false });
          return false;
        }
      },

      register: async (userData: RegisterRequest): Promise<boolean> => {
        try {
          set({ isLoading: true });
          
          const user = await apiService.register(userData);
          
          // Auto-login after registration
          const loginSuccess = await get().login({
            username: userData.username,
            password: userData.password,
          });
          
          if (loginSuccess) {
            toast.success(`Account created successfully! Welcome, ${user.full_name || user.username}!`);
          }
          
          return loginSuccess;
        } catch (error) {
          set({ isLoading: false });
          return false;
        }
      },

      logout: async (): Promise<void> => {
        try {
          await apiService.logout();
        } catch (error) {
          console.error('Logout error:', error);
        } finally {
          set({
            user: null,
            isAuthenticated: false,
            showSplash: false,
          });
          localStorage.removeItem('access_token');
          toast.success('Logged out successfully');
        }
      },

      checkAuth: async (): Promise<void> => {
        const token = localStorage.getItem('access_token');
        if (!token) {
          set({ isAuthenticated: false, user: null, showSplash: false });
          return;
        }

        try {
          const user = await apiService.getCurrentUser();
          set({
            user,
            isAuthenticated: true,
            // Don't show splash on refresh/reload, only on fresh login
            showSplash: false,
          });
        } catch (error) {
          localStorage.removeItem('access_token');
          set({
            user: null,
            isAuthenticated: false,
            showSplash: false,
          });
        }
      },

      updateUser: (userData: User): void => {
        set((state) => ({
          user: userData,
        }));
      },

      setShowSplash: (show: boolean) => {
        set({ showSplash: show });
      },

      getDefaultRoute: (): string => {
        const { user } = get();
        if (!user) return '/login';
        
        // Check if user is admin or super admin
        const isAdmin = user.role === 'admin' || user.role === 'super_admin' || user.role === 'ADMIN' || user.role === 'SUPER_ADMIN';
        
        // Standard users go to search, admins go to dashboard
        return isAdmin ? '/dashboard' : '/search';
      },

      clearError: () => {
        // For future error state management
      },
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({
        user: state.user,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
);