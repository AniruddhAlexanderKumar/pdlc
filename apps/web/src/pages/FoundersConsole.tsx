import { FcShieldCheck, FcUserPlus, FcLock, FcGlobe, FcSettings, FcDelete, FcBook } from 'lucide-react';
import { useSession, useNavigate, useParams } from 'react-router';
import { useToast } from './Toast';
import { Button, Card, Table, TableRow, TableCell, TableHead, Input, Select, Option } from './ui';
import { useEffect, useState } from 'react';

export function FoundersConsolePage() {
  const { data, status } = useSession();
  const navigate = useNavigate();
  const toast = useToast();
  const [organizations, setOrganizations] = useState<Array<{ id: string; name: string; memberCount: number; role: string }>>([]);
  const [users, setUsers] = useState<Array<{ id: string; email: string; name: string; role: string; workspaceId: string }>>([]);
  const [selectedTab, setSelectedTab] = useState<'organizations' | 'users' | 'settings'>('organizations');
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);
  const [newOrgName, setNewOrgName] = useState('');

  // Fetch organizations
  useEffect(() => {
    async function fetchOrganizations() {
      try {
        const res = await fetch('/api/founders/organizations', {
          headers: { 'x-workspace-id': data?.workspace?.id || '' }
        });
        if (!res.ok) throw new Error('Failed to fetch organizations');
        const data = await res.json();
        setOrganizations(data.organizations || []);
      } catch (err) {
        toast({ title: 'Error', description: (err as Error).message, variant: 'destructive' });
      }
    }
    fetchOrganizations();
  }, [data, toast]);

  // Fetch users
  useEffect(() => {
    async function fetchUsers() {
      try {
        const res = await fetch('/api/founders/users', {
          headers: { 'x-workspace-id': data?.workspace?.id || '' }
        });
        if (!res.ok) throw new Error('Failed to fetch users');
        const data = await res.json();
        setUsers(data.users || []);
      } catch (err) {
        toast({ title: 'Error', description: (err as Error).message, variant: 'destructive' });
      }
    }
    fetchUsers();
  }, [data, toast]);

  // Create organization
  const handleCreateOrg = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    try {
      const res = await fetch('/api/founders/organizations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-workspace-id': data?.workspace?.id || '' },
        body: JSON.stringify({ name: newOrgName })
      });
      if (!res.ok) throw new Error('Failed to create organization');
      setNewOrgName('');
      setOrganizations([...organizations, { id: Date.now().toString(), name: newOrgName, memberCount: 1, role: 'owner' }]);
      setCreating(false);
      toast({ title: 'Success', description: 'Organization created successfully' });
    } catch (err) {
      setCreating(false);
      toast({ title: 'Error', description: (err as Error).message, variant: 'destructive' });
    }
  };

  // Delete organization
  const handleDeleteOrg = async (orgId: string) => {
    if (!window.confirm('Are you sure you want to delete this organization?')) return;
    try {
      const res = await fetch(`/api/founders/organizations/${orgId}`, {
        method: 'DELETE',
        headers: { 'x-workspace-id': data?.workspace?.id || '' }
      });
      if (!res.ok) throw new Error('Failed to delete organization');
      setOrganizations(organizations.filter(o => o.id !== orgId));
      toast({ title: 'Success', description: 'Organization deleted successfully' });
    } catch (err) {
      toast({ title: 'Error', description: (err as Error).message, variant: 'destructive' });
    }
  };

  // Delete user
  const handleDeleteUser = async (userId: string) => {
    if (!window.confirm('Are you sure you want to remove this user?')) return;
    try {
      const res = await fetch(`/api/founders/users/${userId}`, {
        method: 'DELETE',
        headers: { 'x-workspace-id': data?.workspace?.id || '' }
      });
      if (!res.ok) throw new Error('Failed to remove user');
      setUsers(users.filter(u => u.id !== userId));
      toast({ title: 'Success', description: 'User removed successfully' });
    } catch (err) {
      toast({ title: 'Error', description: (err as Error).message, variant: 'destructive' });
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="border-b border-gray-200 bg-white shadow-sm">
        <div className="max-w-7xl mx-auto flex items-center justify-between h-14 px-6">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-semibold text-gray-800">Founders Console</h1>
            <FcShieldCheck className="h-5 w-5 text-indigo-600" />
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
            
            {/* Create org form */}
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
            <Table className="w-full">
              <TableHead>
                <TableRow>
                  <TableCell>Name</TableCell>
                  <TableCell className="text-right">Members</TableCell>
                  <TableCell className="text-right">Actions</TableCell>
                </TableRow>
              </TableHead>
              {organizations.map((org) => (
                <TableRow key={org.id} className="hover:bg-gray-50">
                  <TableCell>{org.name}</TableCell>
                  <TableCell className="text-right text-sm text-gray-500">{org.memberCount}</TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeleteOrg(org.id)}
                      className="text-rose-600 hover:text-rose-500"
                    >
                      <FcDelete className="h-3.5 w-3.5" /> Delete
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {organizations.length === 0 && (
                <TableRow>
                  <TableCell colSpan={3} className="text-center text-gray-500 py-8">
                    No organizations found. Create one above.
                  </TableCell>
                </TableRow>
              )}
            </Table>
          </Card>
        )}

        {selectedTab === 'users' && (
          <Card className="p-6">
            <h2 className="font-medium text-gray-700 mb-4">Users</h2>
            
            <Table className="w-full">
              <TableHead>
                <TableRow>
                  <TableCell>Email</TableCell>
                  <TableCell>Name</TableCell>
                  <TableCell className="text-right">Role</TableCell>
                  <TableCell className="text-right">Actions</TableCell>
                </TableRow>
              </TableHead>
              {users.map((user) => (
                <TableRow key={user.id} className="hover:bg-gray-50">
                  <TableCell>{user.email}</TableCell>
                  <TableCell>{user.name || user.email.split('@')[0]}</TableCell>
                  <TableCell className="text-sm text-gray-500">{user.role}</TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeleteUser(user.id)}
                      className="text-rose-600 hover:text-rose-500"
                    >
                      <FcDelete className="h-3.5 w-3.5" /> Remove
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {users.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-gray-500 py-8">
                    No users found.
                  </TableCell>
                </TableRow>
              )}
            </Table>
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
                <h3 className="font-small text-gray-500 mb-2">API Access</h3>
                <p className="text-xs text-gray-400">Your NVIDIA API key configuration</p>
              </div>
              <div>
                <h3 className="font-small text-gray-500 mb-2">Security</h3>
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