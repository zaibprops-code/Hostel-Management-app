import { useState } from "react";
import clsx from "clsx";
import { api, apiError } from "../lib/api";
import { toast } from "../lib/toast";
import { useConfirm } from "../context/ConfirmContext";
import { useAuth } from "../context/AuthContext";
import { useHostels } from "../context/HostelContext";
import { useApi, withQuery } from "../lib/useApi";
import { PageHeader, Card, Button, Modal, Input, MoneyInput, NumberInput, Select, ErrorText, PageLoader, EmptyState } from "../components/ui";
import { formatPKR } from "../lib/format";
import { IconBed, IconPlus } from "../components/icons";

interface Bed { id: string; label: string; status: string; monthlyRent: number; resident: { id: string; fullName: string } | null }
interface Room { id: string; name: string; capacity: number; floor: string; floorLevel: number; hostel: { id: string; name: string }; beds: Bed[] }

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
  const { data, loading, refetch } = useApi<Room[]>(withQuery("/structure/map", scopeParam), [scopeParam]);
  const [modal, setModal] = useState<null | "room" | "bed">(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [roomForm, setRoomForm] = useState<any>({ hostelId: "", name: "", capacity: 3 });
  const [bedForm, setBedForm] = useState<any>({ roomId: "", label: "", monthlyRent: 15000 });
  // "Assign resident" (occupy a bed) state.
  const [assign, setAssign] = useState<null | { bed: Bed; roomName: string; hostelId: string }>(null);
  const [pool, setPool] = useState<{ id: string; fullName: string }[]>([]);
  const [assignForm, setAssignForm] = useState<{ residentId: string; admissionDate: string; monthlyRent: number }>({ residentId: "", admissionDate: "", monthlyRent: 0 });

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
  async function setBedStatus(bed: Bed, status: string) {
    try { await api.patch(`/structure/beds/${bed.id}/status`, { status }); await refetch(); await reload(); }
    catch (e) { toast.error(apiError(e)); }
  }
  // Open the assign dialog for an empty bed, loading residents in this hostel
  // who aren't assigned to a bed yet (registered / reserved / approved intakes).
  async function openAssign(bed: Bed, room: Room) {
    setError("");
    setAssign({ bed, roomName: room.name, hostelId: room.hostel.id });
    setAssignForm({ residentId: "", admissionDate: new Date().toISOString().slice(0, 10), monthlyRent: bed.monthlyRent });
    setPool([]);
    try {
      const { data } = await api.get("/residents", { params: { pageSize: 200 } });
      const list = (data.data as any[]).filter(
        (r) => !r.bed && r.hostel?.id === room.hostel.id && r.status !== "CHECKED_OUT" && r.status !== "BLACKLISTED"
      );
      setPool(list.map((r) => ({ id: r.id, fullName: r.fullName })));
    } catch (e) { toast.error(apiError(e)); }
  }
  async function submitAssign() {
    if (!assign) return;
    if (!assignForm.residentId) { setError("Please choose a resident to assign."); return; }
    setSaving(true); setError("");
    try {
      await api.post("/admissions", {
        residentId: assignForm.residentId,
        bedId: assign.bed.id,
        admissionDate: assignForm.admissionDate,
        monthlyRent: assignForm.monthlyRent,
      });
      toast.success("Resident assigned — the bed is now occupied.");
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
            <Button variant="secondary" onClick={() => { setRoomForm({ hostelId: hostels[0]?.id ?? "", name: "", capacity: 3 }); setModal("room"); }}><IconPlus className="h-4 w-4" /> Room</Button>
            <Button onClick={() => { setBedForm({ roomId: data?.[0]?.id ?? "", label: "", monthlyRent: 15000 }); setModal("bed"); }}><IconPlus className="h-4 w-4" /> Bed</Button>
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
                <div>
                  <h3 className="font-semibold text-slate-800">{room.name}</h3>
                  <p className="text-xs text-slate-400">{room.hostel.name} · {room.floor}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-400">{room.beds.filter((b) => b.status === "OCCUPIED").length}/{room.beds.length} full</span>
                  {can("rooms.manage") && (
                    <button onClick={() => deleteRoom(room)} className="text-xs font-medium text-slate-300 hover:text-rose-600" title="Delete room">✕</button>
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
                    <p className="mt-1 truncate font-medium">{bed.resident ? bed.resident.fullName : bed.status.charAt(0) + bed.status.slice(1).toLowerCase()}</p>
                    <p className="opacity-70">{formatPKR(bed.monthlyRent)}</p>
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
          <NumberInput label="Capacity" value={roomForm.capacity} onChange={(n) => setRoomForm({ ...roomForm, capacity: n })} />
          <ErrorText>{error}</ErrorText>
          <div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setModal(null)}>Cancel</Button><Button loading={saving} onClick={addRoom}>Add Room</Button></div>
        </div>
      </Modal>

      <Modal open={modal === "bed"} onClose={() => setModal(null)} title="Add Bed">
        <div className="space-y-3">
          <Select label="Room" value={bedForm.roomId} onChange={(e) => setBedForm({ ...bedForm, roomId: e.target.value })}>
            {data?.map((r) => <option key={r.id} value={r.id}>{r.hostel.name} · {r.name}</option>)}
          </Select>
          <Input label="Bed label" placeholder="Bed A" value={bedForm.label} onChange={(e) => setBedForm({ ...bedForm, label: e.target.value })} />
          <MoneyInput label="Monthly rent" value={bedForm.monthlyRent} onChange={(n) => setBedForm({ ...bedForm, monthlyRent: n })} />
          <ErrorText>{error}</ErrorText>
          <div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setModal(null)}>Cancel</Button><Button loading={saving} onClick={addBed}>Add Bed</Button></div>
        </div>
      </Modal>

      <Modal open={!!assign} onClose={() => setAssign(null)} title={assign ? `Assign resident — ${assign.roomName} · ${assign.bed.label}` : "Assign resident"}>
        <div className="space-y-3">
          {pool.length === 0 ? (
            <p className="text-sm text-slate-500">
              No unassigned residents in this hostel yet. Register a resident under <b>Residents → Add</b> (or approve a pending intake submission), then come back here to give them this bed.
            </p>
          ) : (
            <>
              <Select label="Resident" value={assignForm.residentId} onChange={(e) => setAssignForm({ ...assignForm, residentId: e.target.value })}>
                <option value="">Select a resident…</option>
                {pool.map((r) => <option key={r.id} value={r.id}>{r.fullName}</option>)}
              </Select>
              <Input label="Admission date" type="date" value={assignForm.admissionDate} onChange={(e) => setAssignForm({ ...assignForm, admissionDate: e.target.value })} />
              <MoneyInput label="Monthly rent" value={assignForm.monthlyRent} onChange={(n) => setAssignForm({ ...assignForm, monthlyRent: n })} />
            </>
          )}
          <ErrorText>{error}</ErrorText>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setAssign(null)}>Cancel</Button>
            {pool.length > 0 && <Button loading={saving} onClick={submitAssign}>Assign &amp; occupy</Button>}
          </div>
        </div>
      </Modal>
    </div>
  );
}
