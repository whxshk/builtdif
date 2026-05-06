import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, CartesianGrid, Legend } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

const COLORS = ['#6366f1','#22c55e','#3b82f6','#f59e0b','#ef4444','#a855f7','#14b8a6','#64748b'];

export default function Analytics() {
  const { data: companies = [], isLoading: lc } = useQuery({
    queryKey: ['companies-analytics'],
    queryFn: () => base44.entities.Company.list('-created_date', 2000),
  });
  const { data: logs = [], isLoading: ll } = useQuery({
    queryKey: ['logs-analytics'],
    queryFn: () => base44.entities.OutreachLog.list('-created_date', 1000),
  });
  const { data: projects = [] } = useQuery({
    queryKey: ['projects-analytics'],
    queryFn: () => base44.entities.Project.list('-created_date', 100),
  });

  const loading = lc || ll;

  // Category breakdown
  const categoryMap = {};
  for (const c of companies) {
    const cat = c.category || 'Unknown';
    categoryMap[cat] = (categoryMap[cat] || 0) + 1;
  }
  const categoryData = Object.entries(categoryMap).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([name, value]) => ({ name, value }));

  // Outreach status breakdown
  const statusMap = {};
  for (const c of companies) {
    const s = c.outreach_status || 'not_started';
    statusMap[s] = (statusMap[s] || 0) + 1;
  }
  const statusData = Object.entries(statusMap).map(([name, value]) => ({ name: name.replace(/_/g, ' '), value }));

  // Enrichment breakdown
  const enrichMap = {};
  for (const c of companies) {
    const s = c.enrichment_status || 'unknown';
    enrichMap[s] = (enrichMap[s] || 0) + 1;
  }
  const enrichData = Object.entries(enrichMap).map(([name, value]) => ({ name: name.replace(/_/g, ' '), value }));

  // Channel activity
  const channelMap = { email: 0, linkedin: 0, phone: 0 };
  for (const l of logs) if (channelMap[l.channel] !== undefined) channelMap[l.channel]++;
  const channelData = Object.entries(channelMap).map(([name, value]) => ({ name, value }));

  // Activity over time (last 14 days)
  const now = new Date();
  const dayMap = {};
  for (let i = 13; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().split('T')[0];
    dayMap[key] = { date: key.slice(5), email: 0, linkedin: 0, phone: 0 };
  }
  for (const log of logs) {
    const day = log.created_date?.split('T')[0];
    if (day && dayMap[day]) dayMap[day][log.channel] = (dayMap[day][log.channel] || 0) + 1;
  }
  const activityData = Object.values(dayMap);

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold">Analytics</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Platform-wide outreach performance</p>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {loading ? Array(4).fill(0).map((_, i) => <Skeleton key={i} className="h-24" />) : [
          { label: 'Total Companies', value: companies.length, color: 'text-foreground' },
          { label: 'Contacted', value: companies.filter(c => c.outreach_status === 'contacted').length, color: 'text-green-600' },
          { label: 'Total Logs', value: logs.length, color: 'text-blue-600' },
          { label: 'Active Projects', value: projects.filter(p => p.status === 'active').length, color: 'text-purple-600' },
        ].map(({ label, value, color }) => (
          <Card key={label} className="border-border/60">
            <CardContent className="py-4 px-4">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className={`text-3xl font-bold ${color}`}>{value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Activity timeline */}
        <Card className="lg:col-span-2 border-border/60">
          <CardHeader className="pb-2"><CardTitle className="text-sm">Outreach Activity (Last 14 Days)</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={activityData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Legend />
                <Bar dataKey="email" fill="#3b82f6" radius={[3, 3, 0, 0]} name="Email" />
                <Bar dataKey="linkedin" fill="#0ea5e9" radius={[3, 3, 0, 0]} name="LinkedIn" />
                <Bar dataKey="phone" fill="#a855f7" radius={[3, 3, 0, 0]} name="Phone" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Category breakdown */}
        <Card className="border-border/60">
          <CardHeader className="pb-2"><CardTitle className="text-sm">Companies by Category</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={230}>
              <BarChart data={categoryData} layout="vertical" margin={{ top: 0, right: 10, left: 60, bottom: 0 }}>
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis dataKey="name" type="category" tick={{ fontSize: 10 }} width={55} />
                <Tooltip />
                <Bar dataKey="value" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Outreach status */}
        <Card className="border-border/60">
          <CardHeader className="pb-2"><CardTitle className="text-sm">Outreach Stage Breakdown</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={230}>
              <PieChart>
                <Pie data={statusData} cx="50%" cy="50%" outerRadius={85} dataKey="value" label={({ name, value }) => `${name} (${value})`} fontSize={10} labelLine={false}>
                  {statusData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Enrichment breakdown */}
        <Card className="border-border/60">
          <CardHeader className="pb-2"><CardTitle className="text-sm">Enrichment Status</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={230}>
              <PieChart>
                <Pie data={enrichData} cx="50%" cy="50%" innerRadius={50} outerRadius={85} dataKey="value" label={({ name, value }) => `${name} (${value})`} fontSize={10} labelLine={false}>
                  {enrichData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Channel usage */}
        <Card className="border-border/60">
          <CardHeader className="pb-2"><CardTitle className="text-sm">Channel Usage</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={230}>
              <BarChart data={channelData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="value" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}