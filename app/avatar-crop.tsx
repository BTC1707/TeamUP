'use client';

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

const VIEW = 280;
const OUTPUT = 512;

type AvatarCropDialogProps = {
  open: boolean;
  imageUrl: string;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: (file: File) => void | Promise<void>;
};

function coverScale(naturalWidth: number, naturalHeight: number) {
  return Math.max(VIEW / naturalWidth, VIEW / naturalHeight);
}

function clampOffset(
  offsetX: number,
  offsetY: number,
  naturalWidth: number,
  naturalHeight: number,
  zoom: number,
) {
  const scale = coverScale(naturalWidth, naturalHeight) * zoom;
  const halfW = (naturalWidth * scale) / 2;
  const halfH = (naturalHeight * scale) / 2;
  const maxX = Math.max(0, halfW - VIEW / 2);
  const maxY = Math.max(0, halfH - VIEW / 2);
  return {
    x: Math.min(maxX, Math.max(-maxX, offsetX)),
    y: Math.min(maxY, Math.max(-maxY, offsetY)),
  };
}

async function exportCroppedFile(
  image: HTMLImageElement,
  offsetX: number,
  offsetY: number,
  zoom: number,
) {
  const scale = coverScale(image.naturalWidth, image.naturalHeight) * zoom;
  const imgLeft = VIEW / 2 + offsetX - (image.naturalWidth * scale) / 2;
  const imgTop = VIEW / 2 + offsetY - (image.naturalHeight * scale) / 2;
  const sx = (0 - imgLeft) / scale;
  const sy = (0 - imgTop) / scale;
  const sw = VIEW / scale;
  const sh = VIEW / scale;

  const canvas = document.createElement('canvas');
  canvas.width = OUTPUT;
  canvas.height = OUTPUT;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not prepare the photo editor.');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, OUTPUT, OUTPUT);
  ctx.drawImage(image, sx, sy, sw, sh, 0, 0, OUTPUT, OUTPUT);

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (result) => (result ? resolve(result) : reject(new Error('Could not save the cropped photo.'))),
      'image/jpeg',
      0.92,
    );
  });
  return new File([blob], 'avatar.jpg', { type: 'image/jpeg' });
}

export default function AvatarCropDialog({
  open,
  imageUrl,
  busy = false,
  onCancel,
  onConfirm,
}: AvatarCropDialogProps) {
  const imageRef = useRef<HTMLImageElement | null>(null);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);
  const [ready, setReady] = useState(false);
  const [natural, setNatural] = useState({ width: 0, height: 0 });
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setReady(false);
    setOffset({ x: 0, y: 0 });
    setZoom(1);
    setSaving(false);
  }, [open, imageUrl]);

  function onImageLoad(image: HTMLImageElement) {
    imageRef.current = image;
    setNatural({ width: image.naturalWidth, height: image.naturalHeight });
    setReady(true);
  }

  function updateZoom(nextZoom: number) {
    const clampedZoom = Math.min(3, Math.max(1, nextZoom));
    setZoom(clampedZoom);
    setOffset((current) =>
      clampOffset(current.x, current.y, natural.width || 1, natural.height || 1, clampedZoom),
    );
  }

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (!ready || busy || saving) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: offset.x,
      originY: offset.y,
    };
  }

  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const next = clampOffset(
      drag.originX + (event.clientX - drag.startX),
      drag.originY + (event.clientY - drag.startY),
      natural.width || 1,
      natural.height || 1,
      zoom,
    );
    setOffset(next);
  }

  function onPointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null;
  }

  async function confirmCrop() {
    const image = imageRef.current;
    if (!image || !ready) return;
    setSaving(true);
    try {
      const file = await exportCroppedFile(image, offset.x, offset.y, zoom);
      await onConfirm(file);
    } catch {
      setSaving(false);
    }
  }

  const scale =
    ready && natural.width
      ? coverScale(natural.width, natural.height) * zoom
      : 1;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !busy && !saving) onCancel();
      }}
    >
      <DialogContent className='sm:max-w-[420px]'>
        <DialogHeader>
          <DialogTitle>Adjust profile photo</DialogTitle>
          <DialogDescription>Drag to reposition. Use the slider to zoom.</DialogDescription>
        </DialogHeader>
        <div className='avatar-crop'>
          <div
            className='avatar-crop-stage'
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          >
            <img
              src={imageUrl}
              alt=''
              draggable={false}
              className='avatar-crop-image'
              style={{
                width: natural.width ? natural.width * scale : 'auto',
                height: natural.height ? natural.height * scale : 'auto',
                transform: `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px))`,
                opacity: ready ? 1 : 0,
              }}
              onLoad={(event) => onImageLoad(event.currentTarget)}
            />
            <div className='avatar-crop-mask' aria-hidden />
          </div>
          <label className='avatar-crop-zoom'>
            Zoom
            <input
              type='range'
              min={1}
              max={3}
              step={0.01}
              value={zoom}
              disabled={!ready || busy || saving}
              onChange={(event) => updateZoom(Number(event.target.value))}
            />
          </label>
        </div>
        <DialogFooter>
          <button type='button' className='btn subtle' disabled={busy || saving} onClick={onCancel}>
            Cancel
          </button>
          <button
            type='button'
            className='btn primary'
            disabled={!ready || busy || saving}
            onClick={() => {
              void confirmCrop();
            }}
          >
            {busy || saving ? 'Saving…' : 'Save photo'}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
