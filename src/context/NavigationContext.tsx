import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { isSupabaseConfigured, supabase } from '../lib/supabase';

export type RoutePath = '/' | '/auth' | '/chat' | '/memory' | '/share' | '/settings' | '/reminders';

interface NavigationContextType {
  currentPath: RoutePath;
  navigate: (path: RoutePath) => void;
  isAuthenticated: boolean;
  authLoading: boolean;
  needsProfile: boolean;
  authError: string | null;
  userName: string;
  userEmail: string;
  signInWithGoogle: () => Promise<void>;
  signInAsGuest: (guestName?: string) => void;
  createProfile: (fullName: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const NavigationContext = createContext<NavigationContextType | undefined>(undefined);

export const NavigationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const getInitialPath = (): RoutePath => {
    if (typeof window !== 'undefined') {
      const pathname = window.location.pathname as RoutePath;
      if (['/', '/auth', '/chat', '/memory', '/share', '/settings', '/reminders'].includes(pathname)) {
        return pathname;
      }
      // Check hash fallback if hosted on static preview
      const hash = window.location.hash.replace('#', '') as RoutePath;
      if (['/', '/auth', '/chat', '/memory', '/share', '/settings', '/reminders'].includes(hash)) {
        return hash;
      }
    }
    return '/';
  };

  const [currentPath, setCurrentPath] = useState<RoutePath>(getInitialPath);
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [sessionReady, setSessionReady] = useState(false);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileExists, setProfileExists] = useState<boolean | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userName, setUserName] = useState('');
  const [authError, setAuthError] = useState<string | null>(
    isSupabaseConfigured ? null : 'Supabase is not configured. Add your Supabase URL and anon key to .env.',
  );

  const userEmail = authUser?.email ?? '';

  const navigate = useCallback((path: RoutePath) => {
    setCurrentPath(path);
    if (typeof window !== 'undefined') {
      window.history.pushState({}, '', path);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, []);

  useEffect(() => {
    if (!supabase) {
      setSessionReady(true);
      return;
    }

    let active = true;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      setAuthUser(session?.user ?? null);
      setSessionReady(true);
    });

    void supabase.auth.getSession().then(({ data, error }) => {
      if (!active) return;
      if (error) setAuthError(error.message);
      setAuthUser(data.session?.user ?? null);
      setSessionReady(true);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!sessionReady) return;
    if (!supabase || !authUser || authUser.is_anonymous) {
      setProfileExists(null);
      setIsAuthenticated(false);
      setUserName('');
      setProfileLoading(false);
      return;
    }

    let active = true;
    setProfileLoading(true);
    setAuthError(null);

    void supabase
      .from('profiles')
      .select('full_name')
      .eq('auth_user_id', authUser.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!active) return;
        if (error) {
          setAuthError(`Could not load your profile: ${error.message}`);
          setProfileExists(null);
          setIsAuthenticated(false);
        } else if (data) {
          setUserName(data.full_name);
          setProfileExists(true);
          setIsAuthenticated(true);
        } else {
          setProfileExists(false);
          setIsAuthenticated(false);
        }
        setProfileLoading(false);
      });

    return () => {
      active = false;
    };
  }, [authUser, sessionReady]);

  useEffect(() => {
    if (!sessionReady || profileLoading || !authUser || profileExists === null) return;
    // Only redirect if the user is explicitly on /auth and already has a profile
    if (profileExists && currentPath === '/auth') {
      navigate('/memory');
    }
  }, [authUser, currentPath, navigate, profileExists, profileLoading, sessionReady]);

  useEffect(() => {
    const handlePopState = () => {
      const pathname = window.location.pathname as RoutePath;
      if (['/', '/auth', '/chat', '/memory', '/share', '/settings', '/reminders'].includes(pathname)) {
        setCurrentPath(pathname);
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const signInWithGoogle = async () => {
    if (!supabase) throw new Error('Supabase is not configured. Add your Supabase URL and anon key to .env.');

    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth` },
    });
    if (error) throw error;
  };

  const createProfile = async (fullName: string) => {
    if (!supabase || !authUser) throw new Error('Sign in with Google before creating your profile.');
    const normalizedName = fullName.trim();
    if (!normalizedName) throw new Error('Enter your full name.');

    const { data: existingProfile, error: lookupError } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('auth_user_id', authUser.id)
      .maybeSingle();
    if (lookupError) throw lookupError;

    if (existingProfile) {
      setUserName(existingProfile.full_name);
      setProfileExists(true);
      setIsAuthenticated(true);
      navigate('/memory');
      return;
    }

    const { error: upsertError } = await supabase
      .from('profiles')
      .upsert({
        auth_user_id: authUser.id,
        full_name: normalizedName,
        profile_code: `SYN-${crypto.randomUUID().replaceAll('-', '').toUpperCase()}`,
        neo4j_person_id: crypto.randomUUID(),
      }, { onConflict: 'auth_user_id', ignoreDuplicates: true });
    if (upsertError) throw upsertError;

    setUserName(normalizedName);
    setProfileExists(true);
    setIsAuthenticated(true);
    navigate('/memory');
  };

  const signInAsGuest = (guestName = 'Guest Explorer') => {
    setUserName(guestName);
    setProfileExists(true);
    setIsAuthenticated(true);
    navigate('/chat');
  };

  const signOut = async () => {
    if (supabase) {
      try {
        await supabase.auth.signOut();
      } catch (err) {
        console.warn('Sign out error:', err);
      }
    }
    setAuthUser(null);
    setProfileExists(null);
    setIsAuthenticated(false);
    setUserName('');
    navigate('/');
  };

  return (
    <NavigationContext.Provider
      value={{
        currentPath,
        navigate,
        isAuthenticated,
        authLoading: !sessionReady || (Boolean(authUser) && profileLoading),
        needsProfile: Boolean(authUser) && profileExists === false && !profileLoading,
        authError,
        userName,
        userEmail,
        signInWithGoogle,
        signInAsGuest,
        createProfile,
        signOut,
      }}
    >
      {children}
    </NavigationContext.Provider>
  );
};

export const useNavigation = () => {
  const context = useContext(NavigationContext);
  if (!context) throw new Error('useNavigation must be used within NavigationProvider');
  return context;
};
