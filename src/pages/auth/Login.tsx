import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useBranding } from '@/contexts/BrandingContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { login } = useAuth();
  const { branding } = useBranding();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      await login(email, password);
      // Check if password change is required
      const storedUser = localStorage.getItem('user');
      if (storedUser) {
        const userData = JSON.parse(storedUser);
        if (userData.requirePasswordChange) {
          navigate('/auth/change-password');
          return;
        }
      }
      // Redirect based on user role
      const storedUserForRedirect = localStorage.getItem('user');
      if (storedUserForRedirect) {
        const userDataForRedirect = JSON.parse(storedUserForRedirect);
        if (['agent', 'manager', 'admin'].includes(userDataForRedirect.role)) {
          navigate('/agent/dashboard');
        } else {
          navigate('/portal/tickets/create');
        }
      }
    } catch (err) {
      setError('Invalid email or password');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md">
        {/* Logo/Brand */}
        <div className="flex justify-center mb-8">
          <div className="flex items-center space-x-2">
            {branding.logo?.url || branding.logoSmall?.url ? (
              <img
                src={branding.logo?.url || branding.logoSmall?.url}
                alt={branding.content.companyName}
                className="h-12 w-auto"
              />
            ) : (
              <div className="h-12 w-12 rounded-lg bg-primary flex items-center justify-center">
                <span className="text-primary-foreground font-bold text-2xl">
                  {branding.content.companyName.substring(0, 2).toUpperCase()}
                </span>
              </div>
            )}
            <span className="font-bold text-2xl">{branding.content.companyName}</span>
          </div>
        </div>

        <Card>
          <CardHeader className="space-y-1">
            <CardTitle className="text-2xl font-bold">
              {branding.content.loginTitle || 'Welcome back'}
            </CardTitle>
            <CardDescription>
              {branding.content.loginSubtitle || 'Enter your credentials to access your account'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="name@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={isLoading}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  disabled={isLoading}
                />
              </div>
              {error && (
                <div className="text-sm text-destructive text-center bg-destructive/10 p-2 rounded">
                  {error}
                </div>
              )}
              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? 'Signing in...' : 'Sign In'}
              </Button>
            </form>

            <div className="mt-4 text-center text-sm">
              <Link to="/auth/forgot-password" className="text-primary hover:underline">
                Forgot password?
              </Link>
            </div>
          </CardContent>
          <CardFooter className="flex flex-col space-y-4">
            <div className="text-sm text-center text-muted-foreground">
              Don't have an account?{' '}
              <Link to="/auth/signup" className="text-primary hover:underline font-medium">
                Sign up
              </Link>
            </div>
            {branding.authSettings?.showDemoAccounts && (
              <div className="text-xs text-center text-muted-foreground border-t pt-4">
                <p className="mb-2 font-medium">Demo Accounts:</p>
                <p>User: user@demo.com / demo123</p>
                <p>Agent: agent@demo.com / demo123</p>
                <p>Admin: admin@demo.com / demo123</p>
              </div>
            )}
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
