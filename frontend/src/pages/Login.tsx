import { useState } from "react";
import { Loader2, AlertCircle, Eye, EyeOff, FileSearch } from "lucide-react";
import { supabase } from "../lib/supabase";

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-4 h-4" aria-hidden="true">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
    </svg>
  );
}

const DEMO_EMAIL    = "visitor@archivio.app";
const DEMO_PASSWORD = "strong_password";

type Mode = "signin" | "signup" | "forgot";

export default function Login() {
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [demoLoading, setDemoLoading] = useState(false);

  const reset = () => { setError(null); setNotice(null); };

  const handleDemoSignIn = async () => {
    setDemoLoading(true);
    reset();
    const { error } = await supabase.auth.signInWithPassword({
      email: DEMO_EMAIL,
      password: DEMO_PASSWORD,
    });
    if (error) setError(error.message);
    else localStorage.setItem("hasSeenGuide", "false");
    setDemoLoading(false);
  };

  const handleGoogleSignIn = async () => {
    reset();
    setGoogleLoading(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin },
    });
    if (error) {
      setError(error.message);
      setGoogleLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    reset();
    setLoading(true);

    try {
      if (mode === "forgot") {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: window.location.origin,
        });
        if (error) throw error;
        setNotice("Check your email for a password reset link.");
        return;
      }

      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        setNotice("Account created! Check your email to confirm before signing in.");
        setMode("signin");
        return;
      }

      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;

    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-goc-grey flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <div className="w-12 h-12 rounded-lg bg-goc-navy flex items-center justify-center mb-4">
            <FileSearch className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-xl font-semibold text-goc-text">Archivio</h1>
          <p className="text-sm text-slate-500 mt-1">Secure Document Intelligence for Government</p>
        </div>

        <div className="bg-white rounded-lg border border-slate-200 p-8">

          <button
            type="button"
            onClick={handleDemoSignIn}
            disabled={demoLoading}
            className="w-full flex items-center justify-center gap-2 rounded-md bg-goc-blue hover:bg-goc-blue-hover active:bg-goc-blue-hover py-2.5 text-sm font-medium text-white transition-colors disabled:opacity-60 mb-2"
          >
            {demoLoading && <Loader2 className="w-4 h-4 animate-spin" />}
            {demoLoading ? "Signing in…" : "Access Demo Environment"}
          </button>
          <p className="text-center text-xs text-slate-400 mb-5">No account required — explore the platform instantly</p>

          <div className="relative mb-5">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-slate-200" />
            </div>
            <div className="relative flex justify-center">
              <span className="bg-white px-3 text-xs text-slate-400">or sign in with your account</span>
            </div>
          </div>

          <h2 className="text-base font-semibold text-goc-text mb-6">
            {mode === "signin" && "Sign in to your account"}
            {mode === "signup" && "Create an account"}
            {mode === "forgot" && "Reset your password"}
          </h2>

          <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={googleLoading || loading}
            className="w-full flex items-center justify-center gap-3 rounded-md border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-goc-text hover:bg-goc-grey disabled:opacity-50 transition-colors"
          >
            {googleLoading ? <Loader2 className="w-4 h-4 animate-spin text-slate-400" /> : <GoogleIcon />}
            Continue with Google
          </button>

          <div className="relative my-1">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-slate-200" />
            </div>
            <div className="relative flex justify-center">
              <span className="bg-white px-3 text-xs text-slate-400">or continue with email</span>
            </div>
          </div>

          {notice && (
            <div className="mb-4 rounded-md bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-emerald-700">
              {notice}
            </div>
          )}

          {error && (
            <div className="mb-4 flex items-start gap-2 rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-goc-text mb-1.5">
                Email address
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                placeholder="you@example.com"
                className="w-full rounded-md border border-slate-200 px-3 py-2.5 text-sm text-goc-text placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-goc-blue/20 focus:border-goc-blue transition-colors"
              />
            </div>

            {mode !== "forgot" && (
              <div>
                <label className="block text-sm font-medium text-goc-text mb-1.5">
                  Password
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoComplete={mode === "signup" ? "new-password" : "current-password"}
                    placeholder="••••••••"
                    className="w-full rounded-md border border-slate-200 px-3 py-2.5 pr-10 text-sm text-goc-text placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-goc-blue/20 focus:border-goc-blue transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {mode === "signin" && (
                  <button
                    type="button"
                    onClick={() => { setMode("forgot"); reset(); }}
                    className="mt-1.5 text-xs text-goc-blue hover:text-goc-blue-hover"
                  >
                    Forgot your password?
                  </button>
                )}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-md bg-goc-blue py-2.5 text-sm font-medium text-white hover:bg-goc-blue-hover disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              {mode === "signin" && "Sign in"}
              {mode === "signup" && "Create account"}
              {mode === "forgot" && "Send reset link"}
            </button>
          </form>
        </div>

        <p className="text-center text-sm text-slate-500 mt-6">
          {mode === "signin" ? (
            <>
              Don&apos;t have an account?{" "}
              <button onClick={() => { setMode("signup"); reset(); }} className="text-goc-blue hover:text-goc-blue-hover font-medium">
                Sign up
              </button>
            </>
          ) : (
            <>
              Already have an account?{" "}
              <button onClick={() => { setMode("signin"); reset(); }} className="text-goc-blue hover:text-goc-blue-hover font-medium">
                Sign in
              </button>
            </>
          )}
        </p>
      </div>
    </div>
  );
}
