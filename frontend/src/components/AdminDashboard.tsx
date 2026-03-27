import { useState, useEffect } from "react";
import axios from "axios";

interface UserRow {
  id: number;
  name: string;
  email: string;
  mobile: string;
  notify_via: string;
  created_at: string;
  last_login: string | null;
  total_searches: number;
  last_search: string | null;
}

interface Stats {
  totalUsers: number;
  totalSearches: number;
  todaySearches: number;
  topQueries: { query: string; n: number }[];
  topCountries: { country: string; n: number }[];
}

interface UsageEvent {
  id: number;
  event_type: string;
  query: string;
  country: string;
  results_count: number;
  created_at: string;
}

export default function AdminDashboard({ onClose }: { onClose: () => void }) {
  const [adminSecret, setAdminSecret] = useState("");
  const [adminToken, setAdminToken] = useState(() => localStorage.getItem("adminToken") || "");
  const [loginError, setLoginError] = useState("");
  const [stats, setStats] = useState<Stats | null>(null);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [selectedUser, setSelectedUser] = useState<UserRow | null>(null);
  const [userEvents, setUserEvents] = useState<UsageEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");

  async function adminLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoginError("");
    try {
      const res = await axios.post("/api/admin/login", { secret: adminSecret });
      localStorage.setItem("adminToken", res.data.token);
      setAdminToken(res.data.token);
    } catch (err: any) {
      setLoginError(err?.response?.data?.error ?? "Login failed");
    }
  }

  useEffect(() => {
    if (!adminToken) return;
    const headers = { Authorization: `Bearer ${adminToken}` };
    setLoading(true);
    Promise.all([
      axios.get("/api/admin/stats", { headers }),
      axios.get("/api/admin/users", { headers }),
    ]).then(([s, u]) => {
      setStats(s.data);
      setUsers(u.data.users);
    }).catch(() => {
      localStorage.removeItem("adminToken");
      setAdminToken("");
    }).finally(() => setLoading(false));
  }, [adminToken]);

  async function loadUserEvents(user: UserRow) {
    setSelectedUser(user);
    const res = await axios.get(`/api/admin/usage/${user.id}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    setUserEvents(res.data.events);
  }

  function fmt(dt: string | null) {
    if (!dt) return "—";
    return new Date(dt + "Z").toLocaleString();
  }

  const filteredUsers = users.filter(u =>
    u.name.toLowerCase().includes(search.toLowerCase()) ||
    u.email.toLowerCase().includes(search.toLowerCase()) ||
    u.mobile.includes(search)
  );

  // ─── Not logged in ────────────────────────────────────────────────────────
  if (!adminToken) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-8">
          <h2 className="text-xl font-bold text-gray-800 mb-2">Admin Login</h2>
          <p className="text-sm text-gray-500 mb-6">Enter your admin secret to continue</p>
          <form onSubmit={adminLogin} className="space-y-4">
            <input
              type="password" value={adminSecret} onChange={e => setAdminSecret(e.target.value)}
              placeholder="Admin secret"
              className="w-full border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
            />
            {loginError && <p className="text-xs text-red-500">{loginError}</p>}
            <div className="flex gap-2">
              <button type="submit" className="flex-1 bg-indigo-600 text-white rounded-xl py-2.5 font-semibold text-sm">Enter</button>
              <button type="button" onClick={onClose} className="flex-1 border rounded-xl py-2.5 text-sm text-gray-500">Cancel</button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  // ─── Dashboard ────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-50 bg-gray-50 overflow-auto">
      {/* Header */}
      <div className="bg-white border-b px-6 py-4 flex items-center justify-between">
        <h1 className="text-lg font-bold text-gray-800">📊 Admin Dashboard</h1>
        <button onClick={onClose} className="text-sm text-gray-500 hover:text-gray-700 border rounded-lg px-3 py-1.5">✕ Close</button>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">

        {/* Stats cards */}
        {stats && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { label: "Total Users", value: stats.totalUsers, icon: "👤" },
              { label: "Total Searches", value: stats.totalSearches, icon: "🔍" },
              { label: "Searches Today", value: stats.todaySearches, icon: "📅" },
              { label: "Avg / User", value: stats.totalUsers > 0 ? (stats.totalSearches / stats.totalUsers).toFixed(1) : "0", icon: "📈" },
            ].map(s => (
              <div key={s.label} className="bg-white rounded-2xl border p-4 shadow-sm">
                <div className="text-2xl mb-1">{s.icon}</div>
                <div className="text-2xl font-bold text-gray-800">{s.value}</div>
                <div className="text-xs text-gray-500">{s.label}</div>
              </div>
            ))}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Top queries */}
          {stats && stats.topQueries.length > 0 && (
            <div className="bg-white rounded-2xl border p-4 shadow-sm">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">🔥 Top Searches</h3>
              <div className="space-y-2">
                {stats.topQueries.map((q, i) => (
                  <div key={i} className="flex justify-between text-xs">
                    <span className="text-gray-700 truncate max-w-[160px]">{q.query}</span>
                    <span className="font-semibold text-indigo-600">{q.n}×</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Top countries */}
          {stats && stats.topCountries.length > 0 && (
            <div className="bg-white rounded-2xl border p-4 shadow-sm">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">🌍 By Country</h3>
              <div className="space-y-2">
                {stats.topCountries.map((c, i) => (
                  <div key={i} className="flex justify-between text-xs">
                    <span className="text-gray-700">{c.country}</span>
                    <span className="font-semibold text-indigo-600">{c.n} searches</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Users table */}
        <div className="bg-white rounded-2xl border shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b">
            <h3 className="text-sm font-semibold text-gray-700">👥 All Users ({users.length})</h3>
            <input
              type="text" value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search by name / email / mobile…"
              className="border rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-300 w-56"
            />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 text-gray-500 uppercase tracking-wide">
                <tr>
                  {["Name", "Email", "Mobile", "Notify", "Searches", "Joined", "Last Login", ""].map(h => (
                    <th key={h} className="px-4 py-3 text-left font-semibold">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {loading ? (
                  <tr><td colSpan={8} className="text-center py-8 text-gray-400">Loading…</td></tr>
                ) : filteredUsers.length === 0 ? (
                  <tr><td colSpan={8} className="text-center py-8 text-gray-400">No users yet</td></tr>
                ) : filteredUsers.map(u => (
                  <tr key={u.id} className="hover:bg-indigo-50/30 transition-colors">
                    <td className="px-4 py-3 font-medium text-gray-800">{u.name}</td>
                    <td className="px-4 py-3 text-gray-600">{u.email}</td>
                    <td className="px-4 py-3 text-gray-600">{u.mobile}</td>
                    <td className="px-4 py-3">
                      <span className="bg-gray-100 rounded px-2 py-0.5">{u.notify_via}</span>
                    </td>
                    <td className="px-4 py-3 font-semibold text-indigo-600">{u.total_searches}</td>
                    <td className="px-4 py-3 text-gray-500">{fmt(u.created_at)}</td>
                    <td className="px-4 py-3 text-gray-500">{fmt(u.last_login)}</td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => loadUserEvents(u)}
                        className="text-indigo-500 hover:text-indigo-700 font-medium"
                      >
                        View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* User usage drawer */}
        {selectedUser && (
          <div className="bg-white rounded-2xl border shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b bg-indigo-50">
              <h3 className="text-sm font-semibold text-indigo-700">
                📋 Usage history — {selectedUser.name}
              </h3>
              <button onClick={() => setSelectedUser(null)} className="text-xs text-gray-400 hover:text-gray-600">✕</button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 text-gray-500 uppercase">
                  <tr>
                    {["Type", "Query", "Country", "Results", "When"].map(h => (
                      <th key={h} className="px-4 py-3 text-left font-semibold">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {userEvents.length === 0 ? (
                    <tr><td colSpan={5} className="text-center py-6 text-gray-400">No events</td></tr>
                  ) : userEvents.map(ev => (
                    <tr key={ev.id}>
                      <td className="px-4 py-2"><span className="bg-indigo-100 text-indigo-700 rounded px-2 py-0.5">{ev.event_type}</span></td>
                      <td className="px-4 py-2 max-w-[200px] truncate">{ev.query || "—"}</td>
                      <td className="px-4 py-2">{ev.country || "—"}</td>
                      <td className="px-4 py-2">{ev.results_count}</td>
                      <td className="px-4 py-2 text-gray-500">{fmt(ev.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
