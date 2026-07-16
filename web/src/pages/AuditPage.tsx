import { useState } from "react";
import { useApi, withQuery } from "../lib/useApi";
import { PageHeader, Card, Button, Badge, PageLoader, EmptyState } from "../components/ui";
import { formatDateTime } from "../lib/format";
import { IconAudit } from "../components/icons";

export default function AuditPage() {
  const [page, setPage] = useState(1);
  const { data, loading } = useApi<any>(withQuery("/audit", `page=${page}`, "pageSize=30"), [page]);
  const totalPages = data ? Math.ceil(data.total / data.pageSize) : 1;

  if (loading) return <PageLoader />;

  return (
    <div>
      <PageHeader title="Audit Logs" subtitle="Immutable record of important actions" />
      {!data?.data.length ? <EmptyState title="No audit entries" icon={<IconAudit className="h-12 w-12" />} /> : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50"><tr><th className="th">Time</th><th className="th">User</th><th className="th">Action</th><th className="th">Entity</th><th className="th">Details</th></tr></thead>
              <tbody>
                {data.data.map((l: any) => (
                  <tr key={l.id} className="hover:bg-slate-50 align-top">
                    <td className="td whitespace-nowrap text-xs text-slate-400">{formatDateTime(l.createdAt)}</td>
                    <td className="td">{l.user ? <span>{l.user.name}<p className="text-xs text-slate-400">{l.user.role}</p></span> : <span className="text-slate-400">System</span>}</td>
                    <td className="td"><Badge color="blue">{l.action}</Badge></td>
                    <td className="td text-xs">{l.entity}{l.entityId ? <span className="text-slate-400"> · {l.entityId.slice(-6)}</span> : ""}</td>
                    <td className="td text-xs text-slate-500 max-w-xs">{l.newValue ? <code className="break-all">{JSON.stringify(l.newValue)}</code> : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100">
            <p className="text-sm text-slate-500">Page {page} of {totalPages} · {data.total} entries</p>
            <div className="flex gap-2"><Button variant="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button><Button variant="secondary" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>Next</Button></div>
          </div>
        </Card>
      )}
    </div>
  );
}
