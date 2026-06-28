import { useState } from "react";
import type { Location } from "@shared/schemas";
import { LOCATION_TYPE_LABELS, type LocationType } from "@shared/enums";
import { useCreate, useUpdate } from "@/lib/queries";
import { ApiError } from "@/lib/api";
import { Modal } from "@/components/ui/modal";
import { Button, Input, Select, Textarea } from "@/components/ui/primitives";
import { MapPicker, type MapPickerValue } from "@/components/MapPicker";

interface Props {
  open: boolean;
  onClose: () => void;
  initial?: Location;
}

export function LocationModal({ open, onClose, initial }: Props) {
  const isEdit = Boolean(initial?.id);
  const create = useCreate("locations");
  const update = useUpdate("locations");
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState(initial?.name ?? "");
  const [locationType, setLocationType] = useState<LocationType>(initial?.location_type ?? "work_center");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [address, setAddress] = useState(initial?.address ?? "");
  const [coords, setCoords] = useState<{ latitude: number; longitude: number } | null>(
    initial?.latitude != null && initial?.longitude != null
      ? { latitude: initial.latitude, longitude: initial.longitude }
      : null,
  );

  // When the map pin is dropped, update address + coords.
  function handleMapChange(v: MapPickerValue) {
    setAddress(v.address);
    setCoords({ latitude: v.latitude, longitude: v.longitude });
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) { setError("Name is required."); return; }
    setError(null);
    const payload = {
      name: name.trim(),
      location_type: locationType,
      description: description.trim() || null,
      address: address.trim() || null,
      latitude: coords?.latitude ?? null,
      longitude: coords?.longitude ?? null,
    };
    const opts = {
      onSuccess: () => onClose(),
      onError: (err: unknown) =>
        setError(err instanceof ApiError ? err.message : "Save failed."),
    };
    if (isEdit && initial?.id) update.mutate({ id: initial.id, data: payload }, opts);
    else create.mutate(payload, opts);
  }

  const existingPin =
    initial?.latitude != null && initial?.longitude != null
      ? { address: initial.address ?? "", latitude: initial.latitude, longitude: initial.longitude }
      : null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? "Edit Location" : "New Location"}
      className="max-w-2xl"
      footer={
        <>
          {error && <span className="mr-auto text-xs text-status-critical">{error}</span>}
          <Button variant="ghost" onClick={onClose} type="button">Cancel</Button>
          <Button
            type="submit"
            form="location-form"
            disabled={create.isPending || update.isPending}
          >
            {isEdit ? "Save changes" : "Create"}
          </Button>
        </>
      }
    >
      <form id="location-form" onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2 flex flex-col gap-1">
            <label className="text-xs font-medium text-muted-foreground">
              Location name <span className="text-status-critical">*</span>
            </label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Paint Booth 3"
              required
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-muted-foreground">Type</label>
            <Select value={locationType} onChange={(e) => setLocationType(e.target.value as LocationType)}>
              {(["plant_facility", "floor", "work_center"] as const).map((t) => (
                <option key={t} value={t}>{LOCATION_TYPE_LABELS[t]}</option>
              ))}
            </Select>
          </div>
          <div className="col-span-2 flex flex-col gap-1">
            <label className="text-xs font-medium text-muted-foreground">Description</label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="Optional notes about this location"
            />
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-xs font-medium text-muted-foreground">
            Map location — click anywhere to drop a pin
          </label>
          <MapPicker value={existingPin} onChange={handleMapChange} />
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-muted-foreground">Address</label>
            <Input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Drop a pin above, or type an address manually"
            />
          </div>
          {coords && (
            <p className="text-[10px] text-muted-foreground">
              Coordinates: {coords.latitude.toFixed(5)}, {coords.longitude.toFixed(5)}
            </p>
          )}
        </div>
      </form>
    </Modal>
  );
}
