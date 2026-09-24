import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from './supabaseClient.js';
import { useE2EE } from './E2EEContext.jsx';
import logoText from '../assets/logo-text.png';

function AccountAuth() {
  const { t } = useTranslation();
  const { unlockForUser } = useE2EE();
  const TITLES = {
    signin: t('auth.titles.signin'),
    signup: t('auth.titles.signup'),
    forgot: t('auth.titles.forgot'),
    reset: t('auth.titles.reset'),
  };
  const [mode, setMode] = useState('signin'); // 'signin' | 'signup' | 'forgot' | 'reset'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState(null);
  const [info, setInfo] = useState(null);
  const [loading, setLoading] = useState(false);

  const resetMessages = () => {
    setError(null);
    setInfo(null);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    resetMessages();
    setLoading(true);

    const { data, error: authError } =
      mode === 'signup'
        ? await supabase.auth.signUp({ email, password })
        : await supabase.auth.signInWithPassword({ email, password });

    setLoading(false);

    if (authError) {
      setError(authError.message);
      return;
    }

    if (mode === 'signup' && !data.session) {
      // Confirmation par email requise avant toute session active — la clé
      // de messagerie sera créée à la vraie première connexion (une fois la
      // session active, le mot de passe redevient disponible ici).
      setInfo(t('auth.signupSuccess'));
      return;
    }

    // Supabase vient de vérifier ce mot de passe lui-même (connexion ou
    // inscription à confirmation immédiate) — sûr de régénérer la clé de
    // messagerie si elle est orpheline (voir E2EEContext.jsx).
    if (data.user) unlockForUser(data.user.id, password);
    // En connexion, onAuthStateChange (écouté dans App.jsx) prend le relais automatiquement.
  };

  const handleSendReset = async (event) => {
    event.preventDefault();
    resetMessages();
    setLoading(true);
    // Un seul email envoyé, deux façons de l'utiliser ensuite : cliquer le
    // lien (rouvre directement l'app via mvptracker://, mais seulement sur ce
    // PC) ou taper le code à 6 chiffres qu'il contient (marche depuis
    // n'importe quel appareil où le mail est lu).
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: 'mvptracker://reset-password',
    });
    setLoading(false);
    if (resetError) {
      setError(resetError.message);
      return;
    }
    setMode('reset');
    setInfo(t('auth.resetEmailSent'));
  };

  const handleResetPassword = async (event) => {
    event.preventDefault();
    resetMessages();
    if (newPassword !== confirmPassword) {
      setError(t('auth.passwordMismatch'));
      return;
    }
    setLoading(true);
    const { error: verifyError } = await supabase.auth.verifyOtp({ email, token: code.trim(), type: 'recovery' });
    if (verifyError) {
      setLoading(false);
      setError(verifyError.message);
      return;
    }
    const { data: updateData, error: updateError } = await supabase.auth.updateUser({ password: newPassword });
    setLoading(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    // Le nouveau mot de passe vient d'être posé côté Supabase à l'instant —
    // sûr de régénérer la clé de messagerie (l'ancienne, enveloppée avec
    // l'ancien mot de passe, est désormais irrécupérable).
    if (updateData.user) unlockForUser(updateData.user.id, newPassword);
    // onAuthStateChange (App.jsx) prend le relais — la session est déjà active.
  };

  const switchMode = (nextMode) => {
    setMode(nextMode);
    resetMessages();
  };

  // Ouvre l'écran de consentement du provider dans le navigateur système
  // (jamais dans une fenêtre de l'app — Electron l'interdit de toute façon,
  // voir le handler 'will-navigate' dans main.js). Supabase redirige ensuite
  // vers mvptracker://auth/callback#access_token=..., que main.js intercepte
  // (handleDeepLink) et renvoie à App.jsx (onOAuthDeepLink) pour activer la
  // session — cette fonction-ci n'attend donc pas de retour, elle ouvre
  // juste le navigateur.
  const handleOAuthSignIn = async (provider) => {
    resetMessages();
    setLoading(true);
    const { data, error: oauthError } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: 'mvptracker://auth/callback', skipBrowserRedirect: true },
    });
    setLoading(false);
    if (oauthError || !data?.url) {
      setError(oauthError?.message ?? t(provider === 'discord' ? 'auth.discordFailed' : 'auth.googleFailed'));
      return;
    }
    window.electronAPI.openExternal(data.url);
  };

  return (
    <div className="welcome-screen">
      <div className="welcome-bg" aria-hidden="true">
        <span className="welcome-orb welcome-orb-1" />
        <span className="welcome-orb welcome-orb-2" />
        <span className="welcome-orb welcome-orb-3" />
        <span className="welcome-orb welcome-orb-4" />
        <span className="welcome-orb welcome-orb-5" />
        <span className="welcome-orb welcome-orb-6" />
        <span className="welcome-orb welcome-orb-7" />
      </div>

      <div className="auth-card">
        <img src={logoText} alt="MVP Tracker" className="auth-card-logo" />
        <p className="welcome-tagline auth-card-tagline">{TITLES[mode]}</p>

        {(mode === 'signin' || mode === 'signup') && (
          <form className="account-auth-form" onSubmit={handleSubmit}>
            <input
              type="email"
              placeholder={t('auth.emailPlaceholder')}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <input
              type="password"
              placeholder={t('auth.passwordPlaceholder')}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={6}
              required
            />
            <button type="submit" disabled={loading}>
              {loading ? t('auth.loading') : mode === 'signup' ? t('auth.createAccount') : t('auth.signIn')}
            </button>
          </form>
        )}

        {mode === 'forgot' && (
          <form className="account-auth-form" onSubmit={handleSendReset}>
            <input
              type="email"
              placeholder={t('auth.emailPlaceholder')}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <button type="submit" disabled={loading}>
              {loading ? t('auth.sending') : t('auth.sendCode')}
            </button>
          </form>
        )}

        {mode === 'reset' && (
          <form className="account-auth-form" onSubmit={handleResetPassword}>
            <input
              type="text"
              inputMode="numeric"
              placeholder={t('auth.codePlaceholder')}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              required
            />
            <input
              type="password"
              placeholder={t('auth.newPasswordPlaceholder')}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              minLength={6}
              required
            />
            <input
              type="password"
              placeholder={t('auth.confirmPasswordPlaceholder')}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              minLength={6}
              required
            />
            <button type="submit" disabled={loading}>
              {loading ? t('auth.validating') : t('auth.resetPassword')}
            </button>
          </form>
        )}

        {error && <p className="warning auth-card-message">{error}</p>}
        {info && <p className="label auth-card-message">{info}</p>}

        {mode === 'signin' && (
          <>
            <button type="button" className="account-auth-switch" onClick={() => switchMode('forgot')}>
              {t('auth.forgotPassword')}
            </button>

            <p className="account-auth-divider">{t('auth.or')}</p>

            <button
              type="button"
              className="account-auth-google-button"
              onClick={() => handleOAuthSignIn('google')}
              disabled={loading}
            >
              <svg viewBox="0 0 48 48" width="18" height="18" aria-hidden="true">
                <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.6-6 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.1 8 3l5.7-5.7C34.6 6.1 29.6 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.7-.4-3.5z" />
                <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.6 15.4 18.9 12 24 12c3.1 0 5.8 1.1 8 3l5.7-5.7C34.6 6.1 29.6 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
                <path fill="#4CAF50" d="M24 44c5.5 0 10.4-1.9 14.2-5.1l-6.5-5.5C29.6 35.1 26.9 36 24 36c-5.3 0-9.7-3.4-11.3-8l-6.6 5.1C9.6 39.7 16.2 44 24 44z" />
                <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.3 4.2-4.2 5.6l6.5 5.5C41.5 35.9 44 30.4 44 24c0-1.3-.1-2.7-.4-3.5z" />
              </svg>
              {t('auth.continueWithGoogle')}
            </button>

            <button
              type="button"
              className="account-auth-discord-button"
              onClick={() => handleOAuthSignIn('discord')}
              disabled={loading}
            >
              <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="currentColor">
                <path d="M20.317 4.492c-1.53-.69-3.17-1.2-4.885-1.49a.075.075 0 0 0-.079.036c-.21.369-.444.85-.608 1.23a18.566 18.566 0 0 0-5.487 0 12.36 12.36 0 0 0-.617-1.23A.077.077 0 0 0 8.562 3c-1.714.29-3.354.8-4.885 1.491a.07.07 0 0 0-.032.027C.533 9.093-.32 13.555.099 17.961a.08.08 0 0 0 .031.055 20.03 20.03 0 0 0 5.993 2.98.078.078 0 0 0 .084-.026 13.83 13.83 0 0 0 1.226-1.963.074.074 0 0 0-.041-.104 13.201 13.201 0 0 1-1.872-.878.075.075 0 0 1-.008-.125c.126-.093.252-.19.372-.287a.075.075 0 0 1 .078-.01c3.927 1.764 8.18 1.764 12.061 0a.075.075 0 0 1 .079.009c.121.098.247.195.373.288a.075.075 0 0 1-.006.125c-.598.344-1.22.635-1.873.877a.075.075 0 0 0-.041.105c.36.687.772 1.341 1.225 1.962a.077.077 0 0 0 .084.028 19.963 19.963 0 0 0 6.002-2.981.076.076 0 0 0 .032-.054c.5-5.094-.838-9.52-3.549-13.442a.06.06 0 0 0-.031-.028zM8.02 15.278c-1.182 0-2.157-1.069-2.157-2.38 0-1.312.956-2.38 2.157-2.38 1.21 0 2.176 1.077 2.157 2.38 0 1.312-.956 2.38-2.157 2.38zm7.975 0c-1.183 0-2.157-1.069-2.157-2.38 0-1.312.955-2.38 2.157-2.38 1.21 0 2.176 1.077 2.157 2.38 0 1.312-.946 2.38-2.157 2.38z" />
              </svg>
              {t('auth.continueWithDiscord')}
            </button>
          </>
        )}

        <div className="auth-card-footer">
          {(mode === 'forgot' || mode === 'reset') && (
            <button type="button" className="account-auth-switch" onClick={() => switchMode('signin')}>
              {t('auth.backToSignin')}
            </button>
          )}

          {(mode === 'signin' || mode === 'signup') && (
            <button
              type="button"
              className="account-auth-switch"
              onClick={() => switchMode(mode === 'signup' ? 'signin' : 'signup')}
            >
              {mode === 'signup' ? t('auth.alreadyHaveAccount') : t('auth.noAccountYet')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default AccountAuth;
