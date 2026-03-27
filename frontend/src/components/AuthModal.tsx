import { useState } from "react";
import axios from "axios";

interface User {
  id: number;
  name: string;
  email: string;
  mobile: string;
  notify_via: string;
  isAdmin?: boolean;
}

interface AuthModalProps {
  onAuth: (user: User, token: string) => void;
}

export default function AuthModal({ onAuth }: AuthModalProps) {
  const [tab, setTab] = useState<"register" | "login">("register");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  // Register fields
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [mobile, setMobile] = useState("");
  const [notifyVia, setNotifyVia] = useState("email");

  // Login fields
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccessMsg("");
    if (!name.trim() || !email.trim() || !mobile.trim()) {
      setError("All fields are required");
      return;
    }
    setLoading(true);
    try {
      const res = await axios.post("/api/auth/register", { name, email, mobile, notify_via: notifyVia });
      setSuccessMsg(`✅ Account created! Your password is: ${res.data.password}\n\nSave it — it was also sent to your email.`);
      setTimeout(() => onAuth(res.data.user, res.data.token), 4000);
    } catch (err: any) {
      setError(err?.response?.data?.error ?? "Registration failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!loginEmail.trim() || !loginPassword.trim()) {
      setError("Email and password are required");
      return;
    }
    setLoading(true);
    try {
      const res = await axios.post("/api/auth/login", { email: loginEmail, password: loginPassword });
      onAuth(res.data.user, res.data.token);
    } catch (err: any) {
      setError(err?.response?.data?.error ?? "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-8">
        {/* Logo + title */}
        <div className="flex flex-col items-center mb-6">
          <span className="inline-flex items-center justify-center h-14 w-14 rounded-2xl bg-gradient-to-br from-blue-400 via-blue-500 to-indigo-600 shadow-lg mb-3">
            <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <rect x="3" y="3" width="7" height="7" rx="1" stroke="currentColor" strokeWidth={1.8} fill="white" fillOpacity={0.25} />
              <rect x="14" y="3" width="7" height="7" rx="1" stroke="currentColor" strokeWidth={1.8} fill="white" fillOpacity={0.25} />
              <rect x="3" y="14" width="7" height="7" rx="1" stroke="currentColor" strokeWidth={1.8} fill="white" fillOpacity={0.25} />
              <rect x="14" y="14" width="7" height="7" rx="1" stroke="currentColor" strokeWidth={1.8} fill="white" fillOpacity={0.25} />
            </svg>
          </span>
          <h2 className="text-2xl font-bold text-gray-800">PriceHunt</h2>
          <p className="text-sm text-gray-500 mt-1">Compare prices across marketplaces</p>
        </div>

        {/* Tabs */}
        <div className="flex rounded-xl bg-gray-100 p-1 mb-6">
          <button
            onClick={() => { setTab("register"); setError(""); setSuccessMsg(""); }}
            className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all ${tab === "register" ? "bg-white shadow text-indigo-600" : "text-gray-500 hover:text-gray-700"}`}
          >
            Create Account
          </button>
          <button
            onClick={() => { setTab("login"); setError(""); setSuccessMsg(""); }}
            className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all ${tab === "login" ? "bg-white shadow text-indigo-600" : "text-gray-500 hover:text-gray-700"}`}
          >
            Sign In
          </button>
        </div>

        {/* Register form */}
        {tab === "register" && (
          <form onSubmit={handleRegister} className="space-y-4">
            <div>
              <label className="text-xs font-semibold text-gray-600 mb-1 block">Full Name</label>
              <input
                type="text" value={name} onChange={e => setName(e.target.value)}
                placeholder="John Doe"
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-600 mb-1 block">Email</label>
              <input
                type="email" value={email} onChange={e => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-600 mb-1 block">Mobile Number</label>
              <input
                type="tel" value={mobile} onChange={e => setMobile(e.target.value)}
                placeholder="+66 812 345 678"
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-600 mb-1 block">Send password via</label>
              <div className="flex gap-3">
                {[{ v: "email", label: "📧 Email" }, { v: "whatsapp", label: "💬 WhatsApp" }, { v: "sms", label: "📱 SMS" }].map(opt => (
                  <button
                    key={opt.v} type="button"
                    onClick={() => setNotifyVia(opt.v)}
                    className={`flex-1 py-2 rounded-xl text-xs font-semibold border transition-all ${notifyVia === opt.v ? "bg-indigo-50 border-indigo-400 text-indigo-700" : "border-gray-200 text-gray-500 hover:border-gray-300"}`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {error && <p className="text-xs text-red-500 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
            {successMsg && (
              <div className="text-xs text-green-700 bg-green-50 rounded-lg px-3 py-2 whitespace-pre-line font-mono">{successMsg}</div>
            )}

            <button
              type="submit" disabled={loading}
              className="w-full bg-gradient-to-r from-blue-500 to-indigo-600 text-white font-semibold py-2.5 rounded-xl hover:from-blue-600 hover:to-indigo-700 transition-all disabled:opacity-60"
            >
              {loading ? "Creating account…" : "Create Account & Get Password"}
            </button>
          </form>
        )}

        {/* Login form */}
        {tab === "login" && (
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="text-xs font-semibold text-gray-600 mb-1 block">Email</label>
              <input
                type="email" value={loginEmail} onChange={e => setLoginEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-600 mb-1 block">Password</label>
              <input
                type="password" value={loginPassword} onChange={e => setLoginPassword(e.target.value)}
                placeholder="••••••••••"
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
              />
            </div>

            {error && <p className="text-xs text-red-500 bg-red-50 rounded-lg px-3 py-2">{error}</p>}

            <button
              type="submit" disabled={loading}
              className="w-full bg-gradient-to-r from-blue-500 to-indigo-600 text-white font-semibold py-2.5 rounded-xl hover:from-blue-600 hover:to-indigo-700 transition-all disabled:opacity-60"
            >
              {loading ? "Signing in…" : "Sign In"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
