import { Modal } from "./modal";
import { Button } from "./primitives";

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  message,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  message: string;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Confirm"
      footer={
        <>
          <Button variant="ghost" type="button" onClick={onClose}>No</Button>
          <Button
            type="button"
            className="bg-status-critical text-white hover:bg-status-critical/90"
            onClick={() => { onConfirm(); onClose(); }}
          >
            Yes
          </Button>
        </>
      }
    >
      <p className="py-1 text-sm">{message}</p>
    </Modal>
  );
}
