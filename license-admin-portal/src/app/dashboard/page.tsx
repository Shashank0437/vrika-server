"use client";

import { useEffect, useState } from "react";
import { MaterialSymbol } from "@/components/ui/MaterialSymbol";
import { LoaderSvg } from "@/components/ui/LoaderSvg";
import { licensesApi, type LicenseDashboardStats } from "@/api/licenses";

function StatCard({ icon, label, value, color }: { icon: string; label: string; value: number | string; color: string }) {
  return (
    <div className="flex items-start gap-4 rounded-xl border border-outline-variant bg-surface-container-lowest p-5 shadow-sm">
      <span className={`flex h-10 w-10 items-center justify-center rounded-lg ${color}`}>
        <MaterialSymbol name={icon} className="text-xl" filled />
      </span>
      <div>
        <p className="text-2xl font-bold text-on-surface">{value}</p>
        <p className="mt-0.5 text-sm text-on-surface-variant">{label}</p>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const [stats, setStats] = useState<LicenseDashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    licensesApi
      .dashboardStats()
      .then(setStats)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <LoaderSvg className="size-10" label="Loading dashboard" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900">{error}</div>
    );
  }

  if (!stats) return null;

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-bold text-on-surface">Dashboard</h2>
        <p className="mt-1 text-sm text-on-surface-variant">License management overview</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon="group" label="Total Customers" value={stats.total_customers} color="bg-primary-container text-primary" />
        <StatCard icon="verified_user" label="Active Licenses" value={stats.active_licenses} color="bg-tertiary-container text-on-tertiary-container" />
        <StatCard icon="hourglass_empty" label="Expired Licenses" value={stats.expired_licenses} color="bg-surface-variant text-on-surface-variant" />
        <StatCard
          icon="star"
          label="Features Enabled"
          value={Object.values(stats.enabled_features).reduce((a, b) => a + b, 0)}
          color="bg-primary-container text-primary"
        />
      </div>

      {/* Feature breakdown */}
      <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-5">
        <h3 className="mb-4 text-sm font-semibold text-on-surface">Feature Usage</h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Object.entries(stats.enabled_features).map(([feature, count]) => (
            <div key={feature} className="flex items-center gap-3 rounded-lg bg-surface-container p-3">
              <MaterialSymbol name="check_circle" className="text-lg text-tertiary" filled />
              <div>
                <p className="text-sm font-medium text-on-surface capitalize">{feature.replace(/_/g, " ")}</p>
                <p className="text-xs text-on-surface-variant">{count} licenses</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Recent activity */}
      <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-5">
        <h3 className="mb-4 text-sm font-semibold text-on-surface">Recent Activity</h3>
        {stats.recent_activity.length === 0 ? (
          <p className="text-sm text-on-surface-variant">No recent activity</p>
        ) : (
          <div className="space-y-3">
            {stats.recent_activity.map((activity) => (
              <div key={activity.id} className="flex items-center justify-between rounded-lg bg-surface-container px-4 py-3">
                <div className="flex items-center gap-3">
                  <MaterialSymbol
                    name={activity.action === "generated" ? "add_circle" : activity.action === "revoked" ? "block" : "update"}
                    className={`text-lg ${activity.action === "revoked" ? "text-error" : "text-primary"}`}
                    filled
                  />
                  <div>
                    <p className="text-sm font-medium text-on-surface">
                      License {activity.action}
                    </p>
                    <p className="text-xs text-on-surface-variant">{activity.customer_name}</p>
                  </div>
                </div>
                <p className="text-xs text-on-surface-variant">
                  {new Date(activity.timestamp).toLocaleDateString()}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
