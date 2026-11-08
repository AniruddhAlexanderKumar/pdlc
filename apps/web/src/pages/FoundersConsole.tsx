import { ShieldCheck, UserPlus, Lock, Globe, Settings, Trash2, BookOpen } from 'lucide-react';
import { useNavigate } from 'react-router';
import { useSession } from '../api/hooks';
import { useToast } from '../components/Toast';
import { Button, Card, Input } from '../components/ui';
import { useEffect, useState, type FormEvent } from 'react';

export function FoundersConsolePage() {
  const me = useSession();
  const navigate = useNavigate();
  const toast = useToast();
  const [organizations, setOrganizations] = useState<Array<{ id: string; name: string; memberCount: number; role: string }>>([]);
  const [users, setUsers] = useState<Array<{ id: string; email: string; name: string; role: string; workspaceId: string }>>([]);
  const [selectedTab, setSelectedTab] = useState<'organizations' | 'users' | 'settings'>('organizations');
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);
  const [newOrgName, setNewOrgName] = useState('');

  const workspaceId = me.workspace.id;

  // Fetch organizations
  useEffect(() => {
    async function fetchOrganizations() {
      try {
        const res = await fetch('/api/founders/organizations', {
          headers: { 'x-workspace-id': workspaceId }
        });
        if (!res.ok) throw new Error('Failed to fetch organizations');
        const json = await res.json();
        setOrganizations(json.organizations || []);
      } catch (err) {
        toast.error((err as Error).message);
      }
    }
    fetchOrganizations();
  }, [workspaceId, toast]);

  // Fetch users
  useEffect(() => {
    async function fetchUsers() {
      try {
        const res = await fetch('/api/founders/users', {
          headers: { 'x-workspace-id': workspaceId }
        });
        if (!res.ok) throw new Error('Failed to fetch users');
        const json = await res.json();
        setUsers(json.users || []);
      } catch (err) {
        toast.error((err as Error).message);
      }
    }
    fetchUsers();
  }, [workspaceId, toast]);

  // Create organization
  const handleCreateOrg = async (e: FormEvent) => {
    e.preventDefault();
    setCreating(true);
    try {
      const res = await fetch('/api/founders/organizations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-workspace-id': workspaceId },
        body: JSON.stringify({ name: newOrgName })
      });
      if (!res.ok) throw new Error('Failed to create organization');
      setNewOrgName('');
      setOrganizations([...organizations, { id: Date.now().toString(), name: newOrgName, memberCount: 1, role: 'owner' }]);
      setCreating(false);
      toast.success('Organization created successfully');
    } catch (err) {
      setCreating(false);
      toast.error((err as Error).message);
    }
  };

  // Delete organization
  const handleDeleteOrg = async (orgId: string) => {
    if (!window.confirm('Are you sure you want to delete this organization?')) return;
    try {
      const res = await fetch(`/api/founders/organizations/${orgId}`, {
        method: 'DELETE',
        headers: { 'x-workspace-id': workspaceId }
      });
      if (!res.ok) throw new Error('Failed to delete organization');
      setOrganizations(organizations.filter(o => o.id !== orgId));
      toast.success('Organization deleted successfully');
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  // Delete user
  const handleDeleteUser = async (userId: string) => {
    if (!window.confirm('Are you sure you want to remove this user?')) return;
    try {
      const res = await fetch(`/api/founders/users/${userId}`, {
        method: 'DELETE',
        headers: { 'x-workspace-id': workspaceId }
      });
      if (!res.ok) throw new Error('Failed to remove user');
      setUsers(users.filter(u => u.id !== userId));
      toast.success('User removed successfully');
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="border-b border-gray-200 bg-white shadow-sm">
        <div className="max-w-7xl mx-auto flex items-center justify-between h-14 px-6">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-semibold text-gray-800">Founders Console</h1>
            <ShieldCheck className="h-5 w-5 text-indigo-600" />
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setSelectedTab('organizations')}
              className={selectedTab === 'organizations' ? 'text-indigo-600' : 'text-gray-500'}
            >
              Organizations
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setSelectedTab('users')}
              className={selectedTab === 'users' ? 'text-indigo-600' : 'text-gray-500'}
            >
              Users
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setSelectedTab('settings')}
              className={selectedTab === 'settings' ? 'text-indigo-600' : 'text-gray-500'}
            >
              Settings
            </Button>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="max-w-7xl mx-auto p-6">
        {/* Tab content */}
        {selectedTab === 'organizations' && (
          <Card className="p-6">
            <h2 className="font-medium text-gray-700 mb-4">Organizations</h2>
            
            {creating && (
              <p className="text-sm text-gray-500 mb-4">Creating organization...</p>
            )}
            
            <form onSubmit={handleCreateOrg} className="mb-6">
              <Input
                placeholder="Organization name"
                value={newOrgName}
                onChange={(e) => setNewOrgName(e.target.value)}
                disabled={creating}
                className="w-full mb-3"
              />
              <Button type="submit" disabled={creating || !newOrgName.trim()}>
                {creating ? 'Creating...' : 'Create Organization'}
              </Button>
            </form>

            {/* Organizations table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="pb-2 font-medium text-gray-600">Name</th>
                    <th className="pb-2 text-right font-medium text-gray-600">Members</th>
                    <th className="pb-2 text-right font-medium text-gray-600">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {organizations.map((org) => (
                    <tr key={org.id} className="hover:bg-gray-50">
                      <td className="py-2.5 text-gray-900">{org.name}</td>
                      <td className="py-2.5 text-right text-sm text-gray-500">{org.memberCount}</td>
                      <td className="py-2.5 text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteOrg(org.id)}
                          className="text-rose-600 hover:text-rose-500"
                        >
                          <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete
                        </Button>
                      </td>
                    </tr>
                  ))}
                  {organizations.length === 0 && (
                    <tr>
                      <td colSpan={3} className="text-center text-gray-500 py-8">
                        No organizations found. Create one above.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        )}

        {selectedTab === 'users' && (
          <Card className="p-6">
            <h2 className="font-medium text-gray-700 mb-4">Users</h2>
            
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="pb-2 font-medium text-gray-600">Email</th>
                    <th className="pb-2 font-medium text-gray-600">Name</th>
                    <th className="pb-2 text-right font-medium text-gray-600">Role</th>
                    <th className="pb-2 text-right font-medium text-gray-600">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {users.map((user) => (
                    <tr key={user.id} className="hover:bg-gray-50">
                      <td className="py-2.5 text-gray-900">{user.email}</td>
                      <td className="py-2.5 text-gray-700">{user.name || user.email.split('@')[0]}</td>
                      <td className="py-2.5 text-right text-sm text-gray-500">{user.role}</td>
                      <td className="py-2.5 text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteUser(user.id)}
                          className="text-rose-600 hover:text-rose-500"
                        >
                          <Trash2 className="h-3.5 w-3.5 mr-1" /> Remove
                        </Button>
                      </td>
                    </tr>
                  ))}
                  {users.length === 0 && (
                    <tr>
                      <td colSpan={4} className="text-center text-gray-500 py-8">
                        No users found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        )}

        {selectedTab === 'settings' && (
          <Card className="p-6">
            <h2 className="font-medium text-gray-700 mb-4">Settings</h2>
            <p className="text-sm text-gray-500 mb-6">
              Founders console settings. Manage organization and user permissions.
            </p>
            <div className="space-y-4">
              <div>
                <h3 className="font-medium text-gray-700 mb-1">API Access</h3>
                <p className="text-xs text-gray-400">Your NVIDIA API key configuration</p>
              </div>
              <div>
                <h3 className="font-medium text-gray-700 mb-1">Security</h3>
                <p className="text-xs text-gray-400">
                  Founders console is restricted to workspace owners and system administrators.
                </p>
              </div>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
