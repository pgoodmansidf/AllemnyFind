// src/pages/UserAdminPage.tsx - UPDATED WITH STANDALONE SIDEBAR
import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Users,
  UserPlus,
  Upload,
  Download,
  Search,
  Shield,
  Lock,
  Edit,
  Trash2,
  CheckCircle,
  XCircle,
  X,
  AlertTriangle,
  Mail,
  User,
  Phone,
  Building,
  Calendar
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { PageLayout, NavigationItem } from '@/components/Layout/PageLayout';
import { GlassCard } from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useAuthStore } from '@/store/authStore';
import { apiService } from '@/services/api';
import toast from 'react-hot-toast';

// Helper function to extract error messages from API responses
const getErrorMessage = (error: any): string => {
  if (error.response?.data?.detail) {
    // Handle string detail
    if (typeof error.response.data.detail === 'string') {
      return error.response.data.detail;
    }
    // Handle array of validation errors
    if (Array.isArray(error.response.data.detail)) {
      return error.response.data.detail
        .map((err: any) => err.msg || err.message || String(err))
        .join(', ');
    }
    // Handle object detail
    if (typeof error.response.data.detail === 'object') {
      return error.response.data.detail.msg || error.response.data.detail.message || 'Validation error';
    }
  }
  // Fallback to generic message
  return error.message || 'An unexpected error occurred';
};

interface PrescreenedUser {
  id: number;
  email: string;
  full_name: string;
  created_at: string;
  is_registered: boolean;
}

interface SystemUser {
  id: number;
  username: string;
  email: string;
  full_name: string;
  role: string;
  department: string | null;
  phone: string | null;
  is_active: boolean;
  created_at: string;
  last_login: string | null;
}

export const UserAdminPage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [activeTab, setActiveTab] = useState<'users' | 'prescreened'>('users');
  const [users, setUsers] = useState<SystemUser[]>([]);
  const [prescreenedUsers, setPrescreenedUsers] = useState<PrescreenedUser[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showResetModal, setShowResetModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState<SystemUser | null>(null);

  // Form states
  const [newPrescreenedEmail, setNewPrescreenedEmail] = useState('');
  const [newPrescreenedName, setNewPrescreenedName] = useState('');
  const [newPassword, setNewPassword] = useState('');

  // Custom navigation items for admin page
  const customNavigationItems: NavigationItem[] = [
    {
      path: '/dashboard',
      label: 'Dashboard',
      icon: <Users className="h-5 w-5" />,
      show: true
    },
    {
      path: '/admin/users',
      label: 'User Admin',
      icon: <Shield className="h-5 w-5" />,
      show: true
    },
    {
      path: '/profile',
      label: 'My Profile',
      icon: <User className="h-5 w-5" />,
      show: true
    }
  ];

  useEffect(() => {
    loadData();
  }, [activeTab]);

  const loadData = async () => {
    setIsLoading(true);
    try {
      if (activeTab === 'users') {
        const response = await apiService.api.get('/admin/users');
        setUsers(response.data);
      } else {
        const response = await apiService.api.get('/admin/prescreened-users');
        setPrescreenedUsers(response.data);
      }
    } catch (error) {
      console.error('Error loading data:', error);
      toast.error('Failed to load data');
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddPrescreenedUser = async () => {
    if (!newPrescreenedEmail || !newPrescreenedName) {
      toast.error('Please fill in all fields');
      return;
    }

    try {
      await apiService.api.post('/admin/prescreened-users', {
        email: newPrescreenedEmail,
        full_name: newPrescreenedName,
      });
      toast.success('Prescreened user added successfully');
      setShowAddModal(false);
      setNewPrescreenedEmail('');
      setNewPrescreenedName('');
      loadData();
    } catch (error: any) {
      const errorMessage = getErrorMessage(error);
      toast.error(errorMessage);
    }
  };

  const handleBulkUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await apiService.api.post('/admin/prescreened-users/bulk-upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      toast.success(response.data.message);
      loadData();
    } catch (error: any) {
      const errorMessage = getErrorMessage(error);
      toast.error(errorMessage);
    }
  };

  const handleDeletePrescreenedUser = async (userId: number) => {
    if (!confirm('Are you sure you want to delete this prescreened user?')) return;

    try {
      await apiService.api.delete(`/admin/prescreened-users/${userId}`);
      toast.success('Prescreened user deleted');
      loadData();
    } catch (error: any) {
      const errorMessage = getErrorMessage(error);
      toast.error(errorMessage);
    }
  };

  const handleToggleUserStatus = async (userId: number, currentStatus: boolean) => {
    try {
      // Find the user to get current role
      const currentUser = users.find(u => u.id === userId);
      if (!currentUser) {
        toast.error('User not found');
        return;
      }

      await apiService.api.put(`/admin/users/${userId}/status`, {
        is_active: !currentStatus,
        role: currentUser.role // Keep current role
      });
      toast.success(`User ${!currentStatus ? 'activated' : 'deactivated'}`);
      loadData();
    } catch (error: any) {
      const errorMessage = getErrorMessage(error);
      toast.error(errorMessage);
    }
  };

  const handleChangeUserRole = async (userId: number, newRole: string) => {
    try {
      // Find the user to get current status
      const currentUser = users.find(u => u.id === userId);
      if (!currentUser) {
        toast.error('User not found');
        return;
      }

      await apiService.api.put(`/admin/users/${userId}/status`, {
        is_active: currentUser.is_active, // Keep current status
        role: newRole,
      });
      toast.success('User role updated');
      loadData();
    } catch (error: any) {
      const errorMessage = getErrorMessage(error);
      toast.error(errorMessage);
    }
  };

  const handleResetPassword = async () => {
    if (!selectedUser || !newPassword) {
      toast.error('Please enter a new password');
      return;
    }

    try {
      await apiService.api.post(`/admin/users/${selectedUser.id}/reset-password`, {
        user_id: selectedUser.id,
        new_password: newPassword,
      });
      toast.success('Password reset successfully');
      setShowResetModal(false);
      setSelectedUser(null);
      setNewPassword('');
    } catch (error: any) {
      const errorMessage = getErrorMessage(error);
      toast.error(errorMessage);
    }
  };

  const handleDeleteUser = async (userId: number) => {
    if (!confirm('Are you sure you want to delete this user? This action cannot be undone.')) return;

    try {
      await apiService.api.delete(`/admin/users/${userId}`);
      toast.success('User deleted successfully');
      loadData();
    } catch (error: any) {
      const errorMessage = getErrorMessage(error);
      toast.error(errorMessage);
    }
  };

  const downloadTemplate = () => {
    const csvContent = "email,full_name\njohn.doe@example.com,John Doe\njane.smith@example.com,Jane Smith";
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'prescreened_users_template.csv';
    link.click();
  };

  const filteredUsers = users.filter(u =>
    u.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
    u.full_name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredPrescreened = prescreenedUsers.filter(u =>
    u.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
    u.full_name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (user?.role !== 'admin' && user?.role !== 'super_admin') {
    return (
      <PageLayout navigationItems={customNavigationItems}>
        <div className="min-h-screen flex items-center justify-center">
          <GlassCard className="p-8 text-center">
            <AlertTriangle className="h-16 w-16 text-yellow-500 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-white mb-2">Access Denied</h2>
            <p className="text-white/70 mb-6">You don't have permission to access this page.</p>
            <Button onClick={() => navigate('/dashboard')}>
              Return to Dashboard
            </Button>
          </GlassCard>
        </div>
      </PageLayout>
    );
  }

  return (
    <PageLayout navigationItems={customNavigationItems}>
      <div className="relative z-10 p-6 pt-20">
        <GlassCard className="max-w-7xl mx-auto">
          {/* Tabs */}
          <div className="flex border-b border-white/20">
            <button
              onClick={() => setActiveTab('users')}
              className={`px-6 py-3 text-sm font-medium transition-colors ${
                activeTab === 'users'
                  ? 'text-white border-b-2 border-primary-500'
                  : 'text-white/60 hover:text-white'
              }`}
            >
              <div className="flex items-center space-x-2">
                <Users className="h-4 w-4" />
                <span>Registered Users</span>
              </div>
            </button>
            <button
              onClick={() => setActiveTab('prescreened')}
              className={`px-6 py-3 text-sm font-medium transition-colors ${
                activeTab === 'prescreened'
                  ? 'text-white border-b-2 border-primary-500'
                  : 'text-white/60 hover:text-white'
              }`}
            >
              <div className="flex items-center space-x-2">
                <Shield className="h-4 w-4" />
                <span>Prescreened Users</span>
              </div>
            </button>
          </div>

          {/* Actions Bar */}
          <div className="p-4 flex items-center justify-between">
            <div className="flex-1 max-w-md">
              <Input
                icon={<Search className="h-5 w-5" />}
                placeholder="Search users..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>

            {activeTab === 'prescreened' && (
              <div className="flex items-center space-x-2">
                <Button
                  variant="glass"
                  size="sm"
                  icon={<UserPlus className="h-4 w-4" />}
                  onClick={() => setShowAddModal(true)}
                >
                  Add User
                </Button>
                <Button
                  variant="glass"
                  size="sm"
                  icon={<Upload className="h-4 w-4" />}
                  onClick={() => fileInputRef.current?.click()}
                >
                  Upload CSV
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv"
                  onChange={handleBulkUpload}
                  className="hidden"
                />
                <Button
                  variant="glass"
                  size="sm"
                  icon={<Download className="h-4 w-4" />}
                  onClick={downloadTemplate}
                >
                  Template
                </Button>
              </div>
            )}
          </div>

          {/* Content */}
          <div className="p-4">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
              </div>
            ) : activeTab === 'users' ? (
              <div className="space-y-2">
                {filteredUsers.map((user) => (
                  <motion.div
                    key={user.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="p-4 bg-white/5 backdrop-blur-sm rounded-lg border border-white/10"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center space-x-3">
                          <div className="h-10 w-10 rounded-full bg-gradient-to-br from-primary-400 to-success-400 flex items-center justify-center">
                            <User className="h-5 w-5 text-white" />
                          </div>
                          <div>
                            <h3 className="text-white font-medium">{user.full_name}</h3>
                            <p className="text-white/60 text-sm">{user.email}</p>
                          </div>
                        </div>
                        <div className="mt-2 flex items-center space-x-4 text-xs text-white/50">
                          <span className="flex items-center">
                            <Shield className="h-3 w-3 mr-1" />
                            {user.role}
                          </span>
                          {user.department && (
                            <span className="flex items-center">
                              <Building className="h-3 w-3 mr-1" />
                              {user.department}
                            </span>
                          )}
                          {user.last_login && (
                            <span className="flex items-center">
                              <Calendar className="h-3 w-3 mr-1" />
                              Last login: {new Date(user.last_login).toLocaleDateString()}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center space-x-2">
                        <button
                          onClick={() => handleToggleUserStatus(user.id, user.is_active)}
                          className={`p-2 rounded-lg transition-colors ${
                            user.is_active
                              ? 'bg-green-500/20 hover:bg-green-500/30 text-green-400'
                              : 'bg-red-500/20 hover:bg-red-500/30 text-red-400'
                          }`}
                        >
                          {user.is_active ? (
                            <CheckCircle className="h-4 w-4" />
                          ) : (
                            <XCircle className="h-4 w-4" />
                          )}
                        </button>
                        
                        <select
                          value={user.role}
                          onChange={(e) => handleChangeUserRole(user.id, e.target.value)}
                          className="px-3 py-1 bg-white/10 border border-white/20 rounded-lg text-white text-sm"
                        >
                          <option value="standard">Standard</option>
                          <option value="admin">Admin</option>
                          {user?.role === 'super_admin' && (
                            <option value="super_admin">Super Admin</option>
                          )}
                        </select>

                        <button
                          onClick={() => {
                            setSelectedUser(user);
                            setShowResetModal(true);
                          }}
                          className="p-2 rounded-lg bg-white/10 hover:bg-white/20 transition-colors text-white/60"
                        >
                          <Lock className="h-4 w-4" />
                        </button>

                        <button
                          onClick={() => handleDeleteUser(user.id)}
                          className="p-2 rounded-lg bg-red-500/20 hover:bg-red-500/30 transition-colors text-red-400"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            ) : (
              <div className="space-y-2">
                {filteredPrescreened.map((user) => (
                  <motion.div
                    key={user.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="p-4 bg-white/5 backdrop-blur-sm rounded-lg border border-white/10"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-white font-medium">{user.full_name}</h3>
                        <p className="text-white/60 text-sm">{user.email}</p>
                        <div className="mt-1">
                          {user.is_registered ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-green-500/20 text-green-400">
                              <CheckCircle className="h-3 w-3 mr-1" />
                              Registered
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-yellow-500/20 text-yellow-400">
                              Pending Registration
                            </span>
                          )}
                        </div>
                      </div>

                      {!user.is_registered && (
                        <button
                          onClick={() => handleDeletePrescreenedUser(user.id)}
                          className="p-2 rounded-lg bg-red-500/20 hover:bg-red-500/30 transition-colors text-red-400"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </div>
        </GlassCard>
      </div>

      {/* Add Prescreened User Modal */}
      <AnimatePresence>
        {showAddModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
            onClick={() => setShowAddModal(false)}
          >
            <motion.div
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.9 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md"
            >
              <GlassCard className="p-6">
                <h2 className="text-xl font-bold text-white mb-4">Add Prescreened User</h2>
                <div className="space-y-4">
                  <Input
                    label="Email Address"
                    type="email"
                    value={newPrescreenedEmail}
                    onChange={(e) => setNewPrescreenedEmail(e.target.value)}
                    placeholder="user@example.com"
                  />
                  <Input
                    label="Full Name"
                    value={newPrescreenedName}
                    onChange={(e) => setNewPrescreenedName(e.target.value)}
                    placeholder="John Doe"
                  />
                  <div className="flex space-x-2">
                    <Button
                      variant="primary"
                      fullWidth
                      onClick={handleAddPrescreenedUser}
                    >
                      Add User
                    </Button>
                    <Button
                      variant="glass"
                      fullWidth
                      onClick={() => setShowAddModal(false)}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              </GlassCard>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Reset Password Modal */}
      <AnimatePresence>
        {showResetModal && selectedUser && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
            onClick={() => setShowResetModal(false)}
          >
            <motion.div
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.9 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md"
            >
              <GlassCard className="p-6">
                <h2 className="text-xl font-bold text-white mb-2">Reset Password</h2>
                <p className="text-white/60 text-sm mb-4">
                  Reset password for {selectedUser.full_name} ({selectedUser.email})
                </p>
                <div className="space-y-4">
                  <Input
                    label="New Password"
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Enter new password"
                  />
                  <div className="flex space-x-2">
                    <Button
                      variant="primary"
                      fullWidth
                      onClick={handleResetPassword}
                    >
                      Reset Password
                    </Button>
                    <Button
                      variant="glass"
                      fullWidth
                      onClick={() => {
                        setShowResetModal(false);
                        setSelectedUser(null);
                        setNewPassword('');
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              </GlassCard>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </PageLayout>
  );
};