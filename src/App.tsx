import React from 'react';
import { ThemeProvider } from './context/ThemeContext';
import { NavigationProvider, useNavigation } from './context/NavigationContext';
import { AppLayout } from './components/layout/AppLayout';
import { HomePage } from './components/home/HomePage';
import { AuthPage } from './components/auth/AuthPage';
import { ChatPage } from './components/chat/ChatPage';
import { MemoryPage } from './components/memory/MemoryPage';
import { SharePage } from './components/share/SharePage';
import { SettingsPage } from './components/settings/SettingsPage';
import { RemindersPage } from './components/reminders/RemindersPage';

import { SharedLinkViewer } from './components/share/SharedLinkViewer';

const AppContent: React.FC = () => {
  const { currentPath, navigate } = useNavigation();

  const [shareParamToken, setShareParamToken] = React.useState<string | null>(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const token = params.get('share');
      if (token) {
        window.sessionStorage.setItem('syndeo.pending-share-token', token);
        return token;
      }
      const pathMatch = window.location.pathname.match(/^\/p\/(.+)/);
      if (pathMatch) return pathMatch[1];
      return window.sessionStorage.getItem('syndeo.pending-share-token');
    }
    return null;
  });

  const renderCurrentPage = () => {
    if (currentPath === '/auth') return <AuthPage />;

    if (shareParamToken) {
      return (
        <SharedLinkViewer
          token={shareParamToken}
          onBack={() => {
            setShareParamToken(null);
            window.sessionStorage.removeItem('syndeo.pending-share-token');
            if (typeof window !== 'undefined') {
              window.history.pushState({}, '', '/share');
            }
            navigate('/share');
          }}
        />
      );
    }


    switch (currentPath) {
      case '/':
        return <HomePage />;
      case '/chat':
        return <ChatPage />;
      case '/memory':
        return <MemoryPage />;
      case '/share':
        return <SharePage />;
      case '/settings':
        return <SettingsPage />;
      case '/reminders':
        return <RemindersPage />;
      default:
        return <HomePage />;

    }
  };

  const currentPage = renderCurrentPage();
  if (shareParamToken) return currentPage;
  return <AppLayout>{currentPage}</AppLayout>;
};

export default function App() {
  return (
    <ThemeProvider>
      <NavigationProvider>
        <AppContent />
      </NavigationProvider>
    </ThemeProvider>
  );
}
