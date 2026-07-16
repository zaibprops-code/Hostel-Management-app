import { useState } from "react";
import { api, apiError } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { useHostels } from "../context/HostelContext";
import { useApi, withQuery } from "../lib/useApi";
import { PageHeader, Card, Button, Modal, Input, Select, Textarea, ErrorText, PageLoader } from "../components/ui";
import { StatCard } from "../components/stats";
import { formatPKR, titleCase } from "../lib/format";
import { IconFood, IconPlus } from "../components/icons";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MEALS = ["BREAKFAST", "LUNCH", "DINNER"];

export default function FoodPage() {
  const { can } = useAuth();
  const { hostels, scopeParam } = useHostels();
  const { data: plans, refetch: refetchPlans } = useApi<any[]>("/food/plans");
  const { data: menu, refetch: refetchMenu } = useApi<any[]>(withQuery("/food/menu", scopeParam), [scopeParam]);
  const { data: headcount, loading } = useApi<any>(withQuery("/food/headcount", scopeParam), [scopeParam]);
  const [planOpen, setPlanOpen] = useState(false);
  const [menuEdit, setMenuEdit] = useState<null | { day: number; meal: string; description: string }>(null);
  const [planForm, setPlanForm] = useState<any>({ name: "", monthlyCost: 0, description: "", includesBreakfast: true, includesLunch: true, includesDinner: true });
  const [error, setError] = useState(""); const [saving, setSaving] = useState(false);
  const hostelId = hostels[0]?.id;

  function menuFor(day: number, meal: string) {
    return menu?.find((m) => m.dayOfWeek === day && m.mealType === meal)?.description ?? "—";
  }
  async function savePlan() {
    setSaving(true); setError("");
    try { await api.post("/food/plans", planForm); setPlanOpen(false); await refetchPlans(); } catch (e) { setError(apiError(e)); } finally { setSaving(false); }
  }
  async function saveMenu() {
    if (!menuEdit || !hostelId) return;
    setSaving(true); setError("");
    try { await api.put("/food/menu", { hostelId, dayOfWeek: menuEdit.day, mealType: menuEdit.meal, description: menuEdit.description }); setMenuEdit(null); await refetchMenu(); }
    catch (e) { setError(apiError(e)); } finally { setSaving(false); }
  }

  if (loading) return <PageLoader />;

  return (
    <div>
      <PageHeader title="Food & Kitchen" subtitle="Meal plans, weekly menu & food cost"
        actions={can("food.manage") && <Button onClick={() => setPlanOpen(true)}><IconPlus className="h-4 w-4" /> Food Plan</Button>} />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4 mb-6">
        <StatCard label="On Food Plan" value={headcount?.onPlan ?? 0} icon={<IconFood />} accent="emerald" />
        <StatCard label="Not On Plan" value={headcount?.offPlan ?? 0} icon={<IconFood />} accent="slate" />
        <StatCard label="Monthly Food Cost" value={formatPKR(headcount?.monthlyFoodCost)} icon={<IconFood />} accent="rose" />
        <StatCard label="Cost / Resident" value={formatPKR(headcount?.costPerResident)} icon={<IconFood />} accent="brand" />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="p-5">
          <h3 className="font-semibold text-slate-800 mb-3">Food Plans</h3>
          {!plans?.length ? <p className="text-sm text-slate-400">No plans yet.</p> : (
            <div className="space-y-2">
              {plans.map((p) => (
                <div key={p.id} className="rounded-lg border border-slate-200 p-3">
                  <div className="flex justify-between"><span className="font-medium text-slate-700">{p.name}</span><span className="text-sm font-semibold text-brand-600">{formatPKR(p.monthlyCost)}</span></div>
                  <p className="text-xs text-slate-400 mt-0.5">{[p.includesBreakfast && "Breakfast", p.includesLunch && "Lunch", p.includesDinner && "Dinner"].filter(Boolean).join(" · ")} · {p.residentCount} residents</p>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card className="p-5 lg:col-span-2">
          <h3 className="font-semibold text-slate-800 mb-3">Weekly Menu {hostels.length > 1 && <span className="text-xs font-normal text-slate-400">({hostels[0]?.name})</span>}</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs text-slate-400"><th className="py-2">Day</th>{MEALS.map((m) => <th key={m}>{titleCase(m)}</th>)}</tr></thead>
              <tbody>
                {DAYS.map((day, di) => (
                  <tr key={day} className="border-t border-slate-100">
                    <td className="py-2 font-medium text-slate-600">{day.slice(0, 3)}</td>
                    {MEALS.map((meal) => (
                      <td key={meal} className="py-2">
                        <button disabled={!can("food.manage")} onClick={() => setMenuEdit({ day: di, meal, description: menuFor(di, meal) === "—" ? "" : menuFor(di, meal) })}
                          className={can("food.manage") ? "hover:text-brand-600 text-left" : ""}>{menuFor(di, meal)}</button>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      <Modal open={planOpen} onClose={() => setPlanOpen(false)} title="New Food Plan">
        <div className="space-y-3">
          <Input label="Name" value={planForm.name} onChange={(e) => setPlanForm({ ...planForm, name: e.target.value })} />
          <Input label="Monthly cost" type="number" value={planForm.monthlyCost} onChange={(e) => setPlanForm({ ...planForm, monthlyCost: +e.target.value })} />
          <Textarea label="Description" value={planForm.description} onChange={(e) => setPlanForm({ ...planForm, description: e.target.value })} />
          <div className="flex gap-4 text-sm">
            {[["includesBreakfast", "Breakfast"], ["includesLunch", "Lunch"], ["includesDinner", "Dinner"]].map(([k, l]) => (
              <label key={k} className="flex items-center gap-1.5"><input type="checkbox" checked={planForm[k]} onChange={(e) => setPlanForm({ ...planForm, [k]: e.target.checked })} /> {l}</label>
            ))}
          </div>
          <ErrorText>{error}</ErrorText>
          <div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setPlanOpen(false)}>Cancel</Button><Button loading={saving} onClick={savePlan}>Save Plan</Button></div>
        </div>
      </Modal>

      <Modal open={!!menuEdit} onClose={() => setMenuEdit(null)} title={menuEdit ? `${DAYS[menuEdit.day]} — ${titleCase(menuEdit.meal)}` : ""}>
        {menuEdit && (
          <div className="space-y-3">
            <Textarea label="Dish" value={menuEdit.description} onChange={(e) => setMenuEdit({ ...menuEdit, description: e.target.value })} />
            <ErrorText>{error}</ErrorText>
            <div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setMenuEdit(null)}>Cancel</Button><Button loading={saving} onClick={saveMenu}>Save</Button></div>
          </div>
        )}
      </Modal>
    </div>
  );
}
