import { useState } from "react";
import clsx from "clsx";
import { api, apiError } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { useHostels } from "../context/HostelContext";
import { useApi, withQuery } from "../lib/useApi";
import { PageHeader, Card, Button, Modal, Input, Select, ErrorText, PageLoader, EmptyState } from "../components/ui";
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
  const { can } = useAuth();
  const { hostels, scopeParam, reload } = useHostels();
  const { data, loading, refetch } = useApi<Room[]>(withQuery("/structure/map", scopeParam), [scopeParam]);
  const [modal, setModal] = useState<null | "room" | "bed">(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [roomForm, setRoomForm] = useState<any>({ hostelId: "", name: "", capacity: 3 });
  const [bedForm, setBedForm] = useState<any>({ roomId: "", label: "", monthlyRent: 15000 });

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
    catch (e) { alert(apiError(e)); }
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
                <span className="text-xs text-slate-400">{room.beds.filter((b) => b.status === "OCCUPIED").length}/{room.beds.length} full</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {room.beds.map((bed) => (
                  <div key={bed.id} className={clsx("rounded-lg border p-2.5 text-xs", STATUS_STYLE[bed.status])}>
                    <div className="flex items-center justify-between">
                      <span className="font-semibold">{bed.label}</span>
                      <IconBed className="h-4 w-4 opacity-60" />
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
          <Input label="Capacity" type="number" value={roomForm.capacity} onChange={(e) => setRoomForm({ ...roomForm, capacity: +e.target.value })} />
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
          <Input label="Monthly rent" type="number" value={bedForm.monthlyRent} onChange={(e) => setBedForm({ ...bedForm, monthlyRent: +e.target.value })} />
          <ErrorText>{error}</ErrorText>
          <div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setModal(null)}>Cancel</Button><Button loading={saving} onClick={addBed}>Add Bed</Button></div>
        </div>
      </Modal>
    </div>
  );
}
