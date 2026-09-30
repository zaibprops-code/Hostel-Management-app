import { useState } from "react";
import { Link } from "react-router-dom";
import clsx from "clsx";
import { api, apiError } from "../lib/api";
import { toast } from "../lib/toast";
import { useConfirm } from "../context/ConfirmContext";
import { useAuth } from "../context/AuthContext";
import { useHostels } from "../context/HostelContext";
import { useApi, withQuery } from "../lib/useApi";
import { PageHeader, Card, Button, Modal, Input, MoneyInput, NumberInput, Select, ErrorText, PageLoader, EmptyState } from "../components/ui";
import { formatPKR, titleCase } from "../lib/format";
import { IconBed, IconPlus } from "../components/icons";
import { firstMonthPlan } from "../lib/rent";
import { FirstMonthSummary, FirstPaymentHint } from "../components/FirstMonthSummary";
import MoveResidentModal from "../components/MoveResidentModal";

interface Bed { id: string; label: string; status: string; monthlyRent: number; resident: { id: string; fullName: string; occupantType?: string } | null }
interface Room { id: string; name: string; capacity: number; floor: string; floorLevel: number; hostel: { id: string; name: string }; beds: Bed[] }

interface PoolResident { id: string; fullName: string; phone?: string | null; status: string; pendingReview?: boolean }

// Today as YYYY-MM-DD in the viewer's own time zone (for a date input).
function localToday(): string {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}

const EMPTY_ASSIGN = { residentId: "", search: "", admissionDate: "", monthlyRent: 0, proratedFirst: true, depositAmount: 0, initialPayment: 0, paymentMethod: "CASH" };

// A room holds at most `capacity` beds.
const hasSpace = (r: Room) => r.beds.length < r.capacity;

const STATUS_STYLE: Record<string, string> = {
  AVAILABLE: "border-emerald-300 bg-emerald-50 text-emerald-700",
  OCCUPIED: "border-brand-300 bg-brand-50 text-brand-700",
  RESERVED: "border-amber-300 bg-amber-50 text-amber-700",
  MAINTENANCE: "border-rose-300 bg-rose-50 text-rose-700",
  BLOCKED: "border-slate-300 bg-slate-100 text-slate-500",
};

export default function RoomsPage() {
  const confirm = useConfirm();
  const { can } = useAuth();
  const { hostels, scopeParam, reload } = useHostels();
  const { data, loading, refetch, setData } = useApi<Room[]>(withQuery("/structure/map", scopeParam), [scopeParam]);
  const [modal, setModal] = useState<null | "room" | "bed">(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [roomForm, setRoomForm] = useState<any>({ hostelId: "", name: "", capacity: 3 });
  const [bedForm, setBedForm] = useState<any>({ roomId: "", label: "", monthlyRent: 15000 });
  const [editRoom, setEditRoom] = useState<Room | null>(null);
  const [editForm, setEditForm] = useState<{ name: string; capacity: number }>({ name: "", capacity: 1 });
  // "Assign resident" (occupy a bed) state.
  const [assign, setAssign] = useState<null | { bed: Bed; roomName: string; hostelId: string }>(null);
  const [moveId, setMoveId] = useState<string | null>(null);
  const [pool, setPool] = useState<PoolResident[]>([]);
  const [poolLoading, setPoolLoading] = useState(false);
  const [assignForm, setAssignForm] = useState<typeof EMPTY_ASSIGN>(EMPTY_ASSIGN);

  const legend = ["AVAILABLE", "OCCUPIED", "RESERVED", "MAINTENANCE", "BLOCKED"];

  async function addRoom() {
    setSaving(true); setError("");
    try {
      await api.post("/structure/rooms", { ...roomForm, hostelId: roomForm.hostelId || hostels[0]?.id });
      setModal(null); await refetch();
    } catch (e) { setError(apiError(e)); } finally { setSaving(false); }
  }
  async function addBed() {
    setSaving(true); setError("");
    try {
      await api.post("/structure/beds", bedForm);
      setModal(null); await refetch(); await reload();
    } catch (e) { setError(apiError(e)); } finally { setSaving(false); }
  }
  // Open "Add Bed", preselecting the given room or the first one with space.
  function openAddBed(roomId?: string) {
    setError("");
    setBedForm({ roomId: roomId ?? data?.find(hasSpace)?.id ?? "", label: "", monthlyRent: 15000 });
    setModal("bed");
  }
  function openEditRoom(room: Room) {
    setError("");
    setEditForm({ name: room.name, capacity: room.capacity });
    setEditRoom(room);
  }
  async function saveRoom() {
    if (!editRoom) return;
    if (editForm.capacity < editRoom.beds.length) {
      setError(`This room already has ${editRoom.beds.length} beds — capacity can't be less than that. Delete a bed first.`);
      return;
    }
    setSaving(true); setError("");
    try {
      await api.put(`/structure/rooms/${editRoom.id}`, { name: editForm.name, capacity: editForm.capacity });
      setEditRoom(null); toast.success("Room updated."); await refetch();
    } catch (e) { setError(apiError(e)); } finally { setSaving(false); }
  }
  async function setBedStatus(bed: Bed, status: string) {
    // Optimistic: flip the bed instantly, then sync (roll back on failure).
    setData((prev) => prev?.map((r) => ({ ...r, beds: r.beds.map((b) => (b.id === bed.id ? { ...b, status } : b)) })) ?? prev);
    try { await api.patch(`/structure/beds/${bed.id}/status`, { status }); reload(); }
    catch (e) { toast.error(apiError(e)); refetch(); reload(); }
  }
  // Open the assign dialog for an empty bed, loading residents in this hostel
  // who aren't assigned to a bed yet (registered / reserved / approved intakes).
  // Daily guests book whole rooms, so they aren't offered for a single bed.
  async function openAssign(bed: Bed, room: Room) {
    setError("");
    setAssign({ bed, roomName: room.name, hostelId: room.hostel.id });
    setAssignForm({ ...EMPTY_ASSIGN, admissionDate: localToday(), monthlyRent: bed.monthlyRent });
    setPool([]);
    setPoolLoading(true);
    try {
      const { data } = await api.get("/residents", { params: { pageSize: 200, hostelId: room.hostel.id } });
      const list = (data.data as any[]).filter(
        (r) => !r.bed && r.hostel?.id === room.hostel.id && r.occupantType !== "DAILY" && r.status !== "CHECKED_OUT" && r.status !== "BLACKLISTED"
      );
      setPool(list.map((r) => ({ id: r.id, fullName: r.fullName, phone: r.phone, status: r.status, pendingReview: r.pendingReview })));
    } catch (e) { toast.error(apiError(e)); }
    finally { setPoolLoading(false); }
  }
  async function submitAssign() {
    if (!assign) return;
    if (!assignForm.residentId) { setError("Please choose a resident to assign."); return; }
    setSaving(true); setError("");
    try {
      const { data: res } = await api.post("/admissions", {
        residentId: assignForm.residentId,
        bedId: assign.bed.id,
        admissionDate: assignForm.admissionDate,
        monthlyRent: assignForm.monthlyRent,
        billingMode: "CALENDAR",
        proratedFirst: assignForm.proratedFirst,
        depositAmount: assignForm.depositAmount,
        initialPayment: assignForm.initialPayment,
        paymentMethod: assignForm.paymentMethod,
      });
      if (!res?.id) { setError("The bed could not be assigned. Please try again."); return; }
      const name = pool.find((r) => r.id === assignForm.residentId)?.fullName ?? "Resident";
      toast.success(`${name} assigned to ${assign.roomName} · ${assign.bed.label}.`);
      setAssign(null); await refetch(); await reload();
    } catch (e) { setError(apiError(e)); } finally { setSaving(false); }
  }
  async function deleteBed(bed: Bed) {
    if (bed.resident) { toast.error("This bed is occupied. Check the resident out first."); return; }
    if (!(await confirm({ title: "Delete bed?", message: `Delete bed "${bed.label}"? This can't be undone.`, confirmLabel: "Delete bed", danger: true }))) return;
    try { await api.delete(`/structure/beds/${bed.id}`); toast.success("Bed deleted."); await refetch(); await reload(); }
    catch (e) { toast.error(apiError(e)); }
  }
  async function deleteRoom(room: Room) {
    const occupied = room.beds.filter((b) => b.resident).length;
    if (occupied) { toast.error("This room has occupied beds. Check those residents out first."); return; }
    if (!(await confirm({ title: "Delete room?", message: `Delete "${room.name}" and its ${room.beds.length} bed(s)? This can't be undone.`, confirmLabel: "Delete room", danger: true }))) return;
    try { await api.delete(`/structure/rooms/${room.id}`); toast.success("Room deleted."); await refetch(); await reload(); }
    catch (e) { toast.error(apiError(e)); }
  }

  if (loading) return <PageLoader />;

  return (
    <div>
      <PageHeader
        title="Rooms & Beds"
        subtitle="Visual occupancy map"
        actions={can("rooms.manage") && (
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => { setError(""); setRoomForm({ hostelId: hostels[0]?.id ?? "", name: "", capacity: 3 }); setModal("room"); }}><IconPlus className="h-4 w-4" /> Room</Button>
            <Button onClick={() => openAddBed()}><IconPlus className="h-4 w-4" /> Bed</Button>
          </div>
        )}
      />

      <div className="flex flex-wrap gap-3 mb-4">
        {legend.map((s) => (
          <div key={s} className="flex items-center gap-1.5 text-xs text-slate-500">
            <span className={clsx("h-3 w-3 rounded border", STATUS_STYLE[s])} /> {s.charAt(0) + s.slice(1).toLowerCase()}
          </div>
        ))}
      </div>

      {!data?.length ? (
        <EmptyState title="No rooms yet" message="Add rooms and beds to build your occupancy map." icon={<IconBed className="h-12 w-12" />} />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {data.map((room) => (
            <Card key={room.id} className="p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="min-w-0">
                  <h3 className="font-semibold text-slate-800">{room.name}</h3>
                  <p className="text-xs text-slate-400">{room.hostel.name} · {room.floor}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span
                    className={clsx(
                      "rounded-full px-2 py-0.5 text-[11px] font-semibold",
                      room.beds.length > room.capacity ? "bg-rose-100 text-rose-700" : room.beds.length === room.capacity ? "bg-slate-100 text-slate-600" : "bg-emerald-50 text-emerald-700"
                    )}
                    title={`${room.beds.filter((b) => b.status === "OCCUPIED").length} of ${room.beds.length} beds occupied`}
                  >
                    {room.beds.length}/{room.capacity} beds{room.beds.length > room.capacity ? " · over capacity" : room.beds.length === room.capacity ? " · full" : ""}
                  </span>
                  {can("rooms.manage") && (
                    <>
                      <button onClick={() => openEditRoom(room)} className="text-xs font-medium text-slate-400 hover:text-brand-600" title="Edit room">Edit</button>
                      <button onClick={() => deleteRoom(room)} className="text-xs font-medium text-slate-300 hover:text-rose-600" title="Delete room">✕</button>
                    </>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {room.beds.map((bed) => (
                  <div key={bed.id} className={clsx("rounded-lg border p-2.5 text-xs", STATUS_STYLE[bed.status])}>
                    <div className="flex items-center justify-between">
                      <span className="font-semibold">{bed.label}</span>
                      {can("rooms.manage") && !bed.resident ? (
                        <button onClick={() => deleteBed(bed)} className="text-sm leading-none opacity-50 hover:opacity-100 hover:text-rose-600" title="Delete bed">✕</button>
                      ) : (
                        <IconBed className="h-4 w-4 opacity-60" />
                      )}
                    </div>
                    {bed.resident ? (
                      <Link to={`/residents/${bed.resident.id}`} className="mt-1 block truncate font-medium hover:underline">{bed.resident.fullName}</Link>
                    ) : (
                      <p className="mt-1 truncate font-medium">{bed.status.charAt(0) + bed.status.slice(1).toLowerCase()}</p>
                    )}
                    <p className="opacity-70">{formatPKR(bed.monthlyRent)}</p>
                    {can("residents.manage") && bed.resident && bed.resident.occupantType !== "DAILY" && (
                      <button
                        onClick={() => setMoveId(bed.resident!.id)}
                        className="mt-1.5 w-full rounded border border-current/30 bg-white/70 px-1 py-1 text-[11px] font-semibold hover:bg-white"
                      >
                        ⇄ Change room
                      </button>
                    )}
                    {can("rooms.manage") && !bed.resident && (
                      <select
                        className="mt-1.5 w-full rounded border border-current/20 bg-white/60 px-1 py-0.5 text-[11px]"
                        value={bed.status}
                        onChange={(e) => setBedStatus(bed, e.target.value)}
                      >
                        {["AVAILABLE", "RESERVED", "MAINTENANCE", "BLOCKED"].map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                    )}
                    {can("admissions.manage") && !bed.resident && (bed.status === "AVAILABLE" || bed.status === "RESERVED") && (
                      <button
                        onClick={() => openAssign(bed, room)}
                        className="mt-1.5 w-full rounded border border-current/30 bg-white/70 px-1 py-1 text-[11px] font-semibold hover:bg-white"
                      >
                        + Assign resident
                      </button>
                    )}
                  </div>
                ))}
                {can("rooms.manage") && hasSpace(room) && (
                  <button
                    onClick={() => openAddBed(room.id)}
                    className="rounded-lg border border-dashed border-slate-300 p-2.5 text-xs font-medium text-slate-400 hover:border-brand-400 hover:text-brand-600"
                  >
                    + Add bed <span className="block text-[11px] font-normal">{room.capacity - room.beds.length} of {room.capacity} free</span>
                  </button>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal open={modal === "room"} onClose={() => setModal(null)} title="Add Room">
        <div className="space-y-3">
          <Select label="Hostel" value={roomForm.hostelId} onChange={(e) => setRoomForm({ ...roomForm, hostelId: e.target.value })}>
            {hostels.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
          </Select>
          <Input label="Room name" placeholder="Room 101" value={roomForm.name} onChange={(e) => setRoomForm({ ...roomForm, name: e.target.value })} />
          <NumberInput label="Capacity (max beds in this room)" value={roomForm.capacity} onChange={(n) => setRoomForm({ ...roomForm, capacity: Math.max(1, n) })} />
          <ErrorText>{error}</ErrorText>
          <div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setModal(null)}>Cancel</Button><Button loading={saving} onClick={addRoom}>Add Room</Button></div>
        </div>
      </Modal>

      <Modal open={modal === "bed"} onClose={() => setModal(null)} title="Add Bed">
        {(() => {
          const room = data?.find((r) => r.id === bedForm.roomId);
          const anySpace = !!data?.some(hasSpace);
          return (
            <div className="space-y-3">
              {!anySpace ? (
                <p className="text-sm text-slate-500">Every room is at its capacity. Use <b>Edit</b> on a room to raise its capacity, or add a new room.</p>
              ) : (
                <>
                  <Select label="Room" value={bedForm.roomId} onChange={(e) => setBedForm({ ...bedForm, roomId: e.target.value })}>
                    {data?.map((r) => (
                      <option key={r.id} value={r.id} disabled={!hasSpace(r)}>
                        {r.hostel.name} · {r.name} — {r.beds.length}/{r.capacity} beds{hasSpace(r) ? "" : " (full)"}
                      </option>
                    ))}
                  </Select>
                  {room && <p className="text-xs text-slate-500">{room.name} has {room.capacity - room.beds.length} of {room.capacity} bed space{room.capacity === 1 ? "" : "s"} left.</p>}
                  <Input label="Bed label" placeholder="Bed A" value={bedForm.label} onChange={(e) => setBedForm({ ...bedForm, label: e.target.value })} />
                  <MoneyInput label="Monthly rent" value={bedForm.monthlyRent} onChange={(n) => setBedForm({ ...bedForm, monthlyRent: n })} />
                </>
              )}
              <ErrorText>{error}</ErrorText>
              <div className="flex justify-end gap-2">
                <Button variant="secondary" onClick={() => setModal(null)}>Cancel</Button>
                {anySpace && <Button loading={saving} disabled={!room || !hasSpace(room)} onClick={addBed}>Add Bed</Button>}
              </div>
            </div>
          );
        })()}
      </Modal>

      <Modal open={!!editRoom} onClose={() => setEditRoom(null)} title={editRoom ? `Edit ${editRoom.name}` : "Edit Room"}>
        {editRoom && (
          <div className="space-y-3">
            <Input label="Room name" value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} />
            <NumberInput label="Capacity (max beds in this room)" value={editForm.capacity} onChange={(n) => setEditForm({ ...editForm, capacity: Math.max(1, n) })} />
            <p className="text-xs text-slate-500">
              This room has {editRoom.beds.length} bed{editRoom.beds.length === 1 ? "" : "s"} now
              {editRoom.beds.length > 0 ? `, so capacity must be at least ${editRoom.beds.length}` : ""}. No more beds can be added once it's full.
            </p>
            <ErrorText>{error}</ErrorText>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setEditRoom(null)}>Cancel</Button>
              <Button loading={saving} disabled={!editForm.name.trim()} onClick={saveRoom}>Save</Button>
            </div>
          </div>
        )}
      </Modal>

      <MoveResidentModal residentId={moveId} open={!!moveId} onClose={() => setMoveId(null)} onMoved={() => { refetch(); reload(); }} />

      <Modal open={!!assign} onClose={() => setAssign(null)} title={assign ? `Assign resident — ${assign.roomName} · ${assign.bed.label}` : "Assign resident"}>
        {assign && (() => {
          const q = assignForm.search.trim().toLowerCase();
          const matches = pool.filter((r) => !q || r.fullName.toLowerCase().includes(q) || (r.phone ?? "").replace(/\D/g, "").includes(q.replace(/\D/g, "") || "~"));
          const chosen = pool.find((r) => r.id === assignForm.residentId);
          const dueDay = hostels.find((h) => h.id === assign.hostelId)?.rentDueDay ?? 5;
          const plan = firstMonthPlan({ admissionDate: assignForm.admissionDate, monthlyRent: assignForm.monthlyRent, billingMode: "CALENDAR", proratedFirst: assignForm.proratedFirst, dueDay });
          return (
            <div className="space-y-3">
              {poolLoading ? (
                <p className="text-sm text-slate-500">Loading residents…</p>
              ) : pool.length === 0 ? (
                <p className="text-sm text-slate-500">
                  No unassigned residents in this hostel yet. Register a resident under <b>Residents → Add</b> (or approve a pending intake submission), then come back here to give them this bed.
                </p>
              ) : (
                <>
                  {/* Searchable list (stays inside the dialog, however many residents) */}
                  <div>
                    <span className="label">Resident <span className="font-normal text-slate-400">· {pool.length} without a bed</span></span>
                    <input
                      className="input"
                      placeholder="Search by name or phone…"
                      value={assignForm.search}
                      onChange={(e) => setAssignForm({ ...assignForm, search: e.target.value })}
                    />
                    <div className="mt-2 max-h-52 overflow-y-auto overscroll-contain rounded-xl border border-slate-200 divide-y divide-slate-100">
                      {matches.length === 0 ? (
                        <p className="px-3 py-3 text-sm text-slate-400">No resident matches “{assignForm.search}”.</p>
                      ) : matches.map((r) => {
                        const on = r.id === assignForm.residentId;
                        return (
                          <button
                            type="button"
                            key={r.id}
                            onClick={() => setAssignForm({ ...assignForm, residentId: r.id })}
                            className={clsx("w-full flex items-center justify-between gap-3 px-3 py-2 text-left text-sm", on ? "bg-brand-50" : "hover:bg-slate-50")}
                          >
                            <span className="min-w-0">
                              <span className={clsx("block truncate font-medium", on ? "text-brand-700" : "text-slate-700")}>{r.fullName}</span>
                              {r.phone && <span className="block text-xs text-slate-400">{r.phone}</span>}
                            </span>
                            <span className="flex items-center gap-2 shrink-0">
                              <span className="text-[11px] text-slate-400">{r.pendingReview ? "New intake" : titleCase(r.status)}</span>
                              <span className={clsx("h-4 w-4 rounded-full border-2", on ? "border-brand-600 bg-brand-600 shadow-[inset_0_0_0_2px_white]" : "border-slate-300")} />
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <Input label="Admission date" type="date" value={assignForm.admissionDate} onChange={(e) => setAssignForm({ ...assignForm, admissionDate: e.target.value })} />
                    <MoneyInput label="Monthly rent" value={assignForm.monthlyRent} onChange={(n) => setAssignForm({ ...assignForm, monthlyRent: n })} />
                  </div>
                  <Select label="First month" value={assignForm.proratedFirst ? "PRO" : "FULL"} onChange={(e) => setAssignForm({ ...assignForm, proratedFirst: e.target.value === "PRO" })}>
                    <option value="PRO">Only the days they stay (pro-rata)</option>
                    <option value="FULL">Full month's rent</option>
                  </Select>
                  <FirstMonthSummary plan={plan} monthlyRent={assignForm.monthlyRent} billingMode="CALENDAR" dueDay={dueDay} />
                  <div className="grid grid-cols-2 gap-3">
                    <MoneyInput label="Security deposit" value={assignForm.depositAmount} onChange={(n) => setAssignForm({ ...assignForm, depositAmount: n })} />
                    <MoneyInput label="Rent collected now" value={assignForm.initialPayment} onChange={(n) => setAssignForm({ ...assignForm, initialPayment: n })} />
                  </div>
                  <FirstPaymentHint plan={plan} collected={assignForm.initialPayment} onChange={(n) => setAssignForm({ ...assignForm, initialPayment: n })} />
                  {(assignForm.depositAmount > 0 || assignForm.initialPayment > 0) && (
                    <Select label="Payment method" value={assignForm.paymentMethod} onChange={(e) => setAssignForm({ ...assignForm, paymentMethod: e.target.value })}>
                      {["CASH", "BANK_TRANSFER", "JAZZCASH", "EASYPAISA", "CARD", "OTHER"].map((m) => <option key={m} value={m}>{titleCase(m)}</option>)}
                    </Select>
                  )}
                </>
              )}
              <ErrorText>{error}</ErrorText>
              <div className="flex items-center justify-end gap-2">
                {chosen && <span className="mr-auto min-w-0 truncate text-xs text-slate-500">Assigning <b className="text-slate-700">{chosen.fullName}</b></span>}
                <Button variant="secondary" onClick={() => setAssign(null)}>Cancel</Button>
                {pool.length > 0 && <Button loading={saving} disabled={!chosen} onClick={submitAssign}>Assign &amp; occupy</Button>}
              </div>
            </div>
          );
        })()}
      </Modal>
    </div>
  );
}
