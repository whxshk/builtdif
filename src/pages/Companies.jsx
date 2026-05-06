import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import {
  Search, Mail, Phone, Linkedin,
  Building2, AlertTriangle,
  SlidersHorizontal, X, ExternalLink, ChevronLeft, ChevronRight as ChevronRightIcon
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';

const PAGE_SIZE = 50;

const STATUS_COLORS = {
  not_started: 'bg-gray-100 text-gray-600',
  in_progress: 'bg-blue-100 text-blue-700',
  contacted: 'bg-green-100 text-green-700',
  responded: 'bg-emerald-100 text-emerald-700',
  qualified: 'bg-purple-100 text-purple-700',
  not_interested: 'bg-red-100 text-red-700',
  skipped: 'bg-gray-100 text-gray-500',
};

const ENRICHMENT_COLORS = {
  complete: 'bg-green-100 text-green-700',
  partial: 'bg-amber-100 text-amber-700',
  not_found: 'bg-red-100 text-red-600',
  needs_enrichment: 'bg-gray-100 text-gray-600',
};

export default function Companies() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState([]);
  const [showFilters, setShowFilters] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [filters, setFilters] = useState({
    category: '', source: '', outreach_status: '', enrichment_status: '',
    has_email: '', has_phone: '', has_linkedin: '', has_website: '',
  });

  const { data: companies = [], isLoading } = useQuery({
    queryKey: ['companies'],
    queryFn: () => base44.entities.Company.list('-created_date', 5000),
  });

  const generateDrafts = async (channel) => {
    if (selected.length === 0) { toast.error('Select at least one company'); return; }
    setGenerating(true);
    try {
      await base44.functions.invoke('generateOutreach', { bulk_ids: selected, channel });
      toast.success(`Drafts generated for ${selected.length} companies`);
      qc.invalidateQueries(['drafts']);
      setSelected([]);
    } catch (err) {
      toast.error(err?.response?.data?.error || err.message);
    } finally {
      setGenerating(false);
    }
  };

  const skipSelected = async () => {
    for (const id of selected) {
      await base44.entities.Company.update(id, { outreach_status: 'skipped' });
    }
    toast.success(`Skipped ${selected.length} companies`);
    qc.invalidateQueries(['companies']);
    setSelected([]);
  };

  const filtered = companies.filter(c => {
    const s = search.toLowerCase();
    if (s && !c.company_name?.toLowerCase().includes(s) &&
        !c.cr_number?.toLowerCase().includes(s) &&
        !c.category?.toLowerCase().includes(s) &&
        !c.primary_email?.toLowerCase().includes(s)) return false;
    if (filters.category && c.category !== filters.category) return false;
    if (filters.source && c.source !== filters.source) return false;
    if (filters.outreach_status && c.outreach_status !== filters.outreach_status) return false;
    if (filters.enrichment_status && c.enrichment_status !== filters.enrichment_status) return false;
    if (filters.has_email === 'yes' && !c.primary_email) return false;
    if (filters.has_email === 'no' && c.primary_email) return false;
    if (filters.has_phone === 'yes' && !c.primary_phone) return false;
    if (filters.has_phone === 'no' && c.primary_phone) return false;
    if (filters.has_linkedin === 'yes' && !c.linkedin_url) return false;
    if (filters.has_linkedin === 'no' && c.linkedin_url) return false;
    if (filters.has_website === 'yes' && !c.website) return false;
    if (filters.has_website === 'no' && c.website) return false;
    return true;
  });

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const categories = [...new Set(companies.map(c => c.category).filter(Boolean))].sort();
  const sources = [...new Set(companies.map(c => c.source).filter(Boolean))].sort();

  const toggleSelect = (id) => setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  const toggleAll = () => setSelected(selected.length === paginated.length ? [] : paginated.map(c => c.id));
  const clearFilters = () => setFilters({ category: '', source: '', outreach_status: '', enrichment_status: '', has_email: '', has_phone: '', has_linkedin: '', has_website: '' });
  const activeFilterCount = Object.values(filters).filter(Boolean).length;

  return (
    <div className="p-6 h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold">Companies</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {filtered.length.toLocaleString()} companies{search || activeFilterCount > 0 ? ' (filtered)' : ''}
          </p>
        </div>
        <div className="flex gap-2">
          <Link to="/import">
            <Button variant="outline" size="sm">Import Excel</Button>
          </Link>
          <Link to="/campaigns">
            <Button size="sm">+ Add to Campaign</Button>
          </Link>
        </div>
      </div>

      {/* Search + Filter Bar */}
      <div className="flex gap-2 mb-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search by name, CR number, category, email..."
            className="pl-9 h-9"
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowFilters(!showFilters)}
          className={cn('gap-2', activeFilterCount > 0 && 'border-primary text-primary')}
        >
          <SlidersHorizontal className="w-4 h-4" />
          Filters
          {activeFilterCount > 0 && (
            <Badge className="h-4 w-4 p-0 flex items-center justify-center text-[10px] bg-primary text-primary-foreground">
              {activeFilterCount}
            </Badge>
          )}
        </Button>
      </div>

      {/* Filter Panel */}
      {showFilters && (
        <Card className="mb-3 border-border/60">
          <CardContent className="py-3 px-4">
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
              <Select value={filters.category || 'all'} onValueChange={v => setFilters(f => ({ ...f, category: v === 'all' ? '' : v }))}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Category" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  {categories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={filters.source || 'all'} onValueChange={v => setFilters(f => ({ ...f, source: v === 'all' ? '' : v }))}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Source" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Sources</SelectItem>
                  {sources.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={filters.outreach_status || 'all'} onValueChange={v => setFilters(f => ({ ...f, outreach_status: v === 'all' ? '' : v }))}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Outreach" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  {['not_started','in_progress','contacted','responded','qualified','not_interested','skipped'].map(s => (
                    <SelectItem key={s} value={s}>{s.replace(/_/g, ' ')}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={filters.enrichment_status || 'all'} onValueChange={v => setFilters(f => ({ ...f, enrichment_status: v === 'all' ? '' : v }))}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Enrichment" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Enrichment</SelectItem>
                  {['complete','partial','not_found','needs_enrichment'].map(s => (
                    <SelectItem key={s} value={s}>{s.replace(/_/g, ' ')}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {[
                { key: 'has_email', label: 'Email' },
                { key: 'has_phone', label: 'Phone' },
                { key: 'has_linkedin', label: 'LinkedIn' },
                { key: 'has_website', label: 'Website' },
              ].map(({ key, label }) => (
                <Select key={key} value={filters[key] || 'any'} onValueChange={v => setFilters(f => ({ ...f, [key]: v === 'any' ? '' : v }))}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder={`Has ${label}`} /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="any">Any</SelectItem>
                    <SelectItem value="yes">Has {label}</SelectItem>
                    <SelectItem value="no">No {label}</SelectItem>
                  </SelectContent>
                </Select>
              ))}
            </div>
            {activeFilterCount > 0 && (
              <button onClick={clearFilters} className="mt-2 text-xs text-primary hover:underline flex items-center gap-1">
                <X className="w-3 h-3" /> Clear all filters
              </button>
            )}
          </CardContent>
        </Card>
      )}

      {/* Bulk action bar */}
      {selected.length > 0 && (
        <div className="flex items-center gap-2 mb-2 px-3 py-2.5 bg-primary/5 border border-primary/20 rounded-lg">
          <span className="text-sm font-medium text-primary mr-1">{selected.length} selected</span>
          <Button size="sm" className="h-7 text-xs gap-1" onClick={() => generateDrafts('email')} disabled={generating}>
            <Mail className="w-3 h-3" /> {generating ? 'Generating…' : 'Email Drafts'}
          </Button>
          <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => generateDrafts('linkedin')} disabled={generating}>
            <Linkedin className="w-3 h-3" /> LinkedIn
          </Button>
          <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => generateDrafts('phone')} disabled={generating}>
            <Phone className="w-3 h-3" /> Call Script
          </Button>
          <Link to={`/outreach?bulk=${selected.join(',')}`}>
            <Button size="sm" variant="outline" className="h-7 text-xs">Add to Queue</Button>
          </Link>
          <Button size="sm" variant="ghost" className="h-7 text-xs text-muted-foreground" onClick={skipSelected}>Skip</Button>
          <button onClick={() => setSelected([])} className="ml-auto text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* Table */}
      <Card className="flex-1 overflow-hidden border-border/60">
        <div className="overflow-auto h-full">
          {isLoading ? (
            <div className="p-6 space-y-2">
              {Array(10).fill(0).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
              <Building2 className="w-10 h-10 mb-3 opacity-30" />
              <p className="font-medium">No companies found</p>
              <p className="text-sm">{search || activeFilterCount > 0 ? 'Try adjusting your filters' : 'Import an Excel file to get started'}</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-muted/80 backdrop-blur border-b border-border z-10">
                <tr>
                  <th className="w-10 px-3 py-3">
                    <Checkbox
                      checked={selected.length === paginated.length && paginated.length > 0}
                      onCheckedChange={toggleAll}
                    />
                  </th>
                  {['Company', 'CR #', 'Category', 'Enrichment', 'Email', 'Phone', 'LinkedIn', 'Source', 'Outreach', ''].map(h => (
                    <th key={h} className="text-left px-3 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {paginated.map((company) => (
                  <tr key={company.id} className="border-b border-border/30 hover:bg-muted/20 transition-colors group">
                    <td className="px-3 py-3">
                      <Checkbox
                        checked={selected.includes(company.id)}
                        onCheckedChange={() => toggleSelect(company.id)}
                      />
                    </td>
                    <td className="px-3 py-3">
                      <Link to={`/companies/${company.id}`} className="font-medium text-foreground hover:text-primary transition-colors">
                        {company.company_name}
                      </Link>
                    </td>
                    <td className="px-3 py-3 text-muted-foreground font-mono text-xs">{company.cr_number || '—'}</td>
                    <td className="px-3 py-3">
                      {company.category ? (
                        <Badge variant="outline" className="text-xs font-normal">{company.category}</Badge>
                      ) : <span className="text-muted-foreground/50">—</span>}
                    </td>
                    <td className="px-3 py-3">
                      <Badge className={cn('text-xs font-normal', ENRICHMENT_COLORS[company.enrichment_status] || 'bg-gray-100 text-gray-600')}>
                        {(company.enrichment_status || 'unknown').replace(/_/g, ' ')}
                      </Badge>
                    </td>
                    <td className="px-3 py-3">
                      {company.primary_email
                        ? <div className="flex items-center gap-1.5"><Mail className="w-3.5 h-3.5 text-green-500" /><span className="text-xs truncate max-w-[140px]">{company.primary_email}</span></div>
                        : <AlertTriangle className="w-3.5 h-3.5 text-muted-foreground/40" />}
                    </td>
                    <td className="px-3 py-3">
                      {company.primary_phone
                        ? <div className="flex items-center gap-1.5"><Phone className="w-3.5 h-3.5 text-purple-500" /><span className="text-xs">{company.primary_phone}</span></div>
                        : <AlertTriangle className="w-3.5 h-3.5 text-muted-foreground/40" />}
                    </td>
                    <td className="px-3 py-3">
                      {company.linkedin_url
                        ? <a href={company.linkedin_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-sky-600 hover:text-sky-700"><Linkedin className="w-3.5 h-3.5" /><ExternalLink className="w-2.5 h-2.5" /></a>
                        : <AlertTriangle className="w-3.5 h-3.5 text-muted-foreground/40" />}
                    </td>
                    <td className="px-3 py-3 text-xs text-muted-foreground">{company.source || '—'}</td>
                    <td className="px-3 py-3">
                      <Badge className={cn('text-xs font-normal', STATUS_COLORS[company.outreach_status] || 'bg-gray-100 text-gray-600')}>
                        {(company.outreach_status || 'not_started').replace(/_/g, ' ')}
                      </Badge>
                    </td>
                    <td className="px-3 py-3">
                      <Link to={`/companies/${company.id}`} className="opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button variant="ghost" size="sm" className="h-7 text-xs gap-1">
                          View <ChevronRightIcon className="w-3.5 h-3.5" />
                        </Button>
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-4">
          <span className="text-sm text-muted-foreground">
            Showing {((page - 1) * PAGE_SIZE) + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length}
          </span>
          <div className="flex gap-1">
            <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              const p = Math.max(1, Math.min(totalPages - 4, page - 2)) + i;
              return (
                <Button key={p} variant={p === page ? 'default' : 'outline'} size="sm" className="w-8" onClick={() => setPage(p)}>
                  {p}
                </Button>
              );
            })}
            <Button variant="outline" size="sm" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>
              <ChevronRightIcon className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}