import { useState, useCallback, useRef, useEffect } from "react";

export interface ZoomState {
  scale: number;
  offsetX: number;
  offsetY: number;
}

const MIN_SCALE = 0.1;
const MAX_SCALE = 32;
const ZOOM_STEP = 0.25;

export function useZoom(containerRef: React.RefObject<HTMLDivElement>) {
  const [zoom, setZoom] = useState<ZoomState>({ scale: 1, offsetX: 0, offsetY: 0 });
  const isPanning = useRef(false);
  const panStart = useRef({ x: 0, y: 0 });
  const panStartOffset = useRef({ x: 0, y: 0 });

  const clampOffset = useCallback(
    (x: number, y: number, scale: number): { x: number; y: number } => {
      const el = containerRef.current;
      if (!el) return { x, y };
      const rect = el.getBoundingClientRect();
      const maxX = (rect.width * Math.max(scale, 1)) / 2 + rect.width;
      const maxY = (rect.height * Math.max(scale, 1)) / 2 + rect.height;
      return {
        x: Math.max(-maxX, Math.min(maxX, x)),
        y: Math.max(-maxY, Math.min(maxY, y)),
      };
    },
    [containerRef]
  );

  const setScale = useCallback(
    (newScale: number, focalX?: number, focalY?: number) => {
      setZoom((prev) => {
        const clamped = Math.max(MIN_SCALE, Math.min(MAX_SCALE, newScale));
        const el = containerRef.current;
        let newOffsetX = prev.offsetX;
        let newOffsetY = prev.offsetY;

        if (el && focalX !== undefined && focalY !== undefined) {
          const rect = el.getBoundingClientRect();
          const relX = focalX - rect.left - rect.width / 2;
          const relY = focalY - rect.top;
          const scaleDelta = clamped / prev.scale;
          newOffsetX = relX * (1 - scaleDelta) + prev.offsetX * scaleDelta;
          newOffsetY = relY * (1 - scaleDelta) + prev.offsetY * scaleDelta;
        }

        const { x, y } = clampOffset(newOffsetX, newOffsetY, clamped);
        return { scale: clamped, offsetX: x, offsetY: y };
      });
    },
    [containerRef, clampOffset]
  );

  const reset = useCallback(() => {
    setZoom({ scale: 1, offsetX: 0, offsetY: 0 });
  }, []);

  const zoomIn = useCallback(() => {
    setZoom((prev) => {
      const newScale = Math.min(MAX_SCALE, parseFloat((prev.scale + ZOOM_STEP).toFixed(2)));
      const { x, y } = clampOffset(prev.offsetX, prev.offsetY, newScale);
      return { scale: newScale, offsetX: x, offsetY: y };
    });
  }, [clampOffset]);

  const zoomOut = useCallback(() => {
    setZoom((prev) => {
      const newScale = Math.max(MIN_SCALE, parseFloat((prev.scale - ZOOM_STEP).toFixed(2)));
      if (newScale <= 1) return { scale: newScale, offsetX: 0, offsetY: 0 };
      const { x, y } = clampOffset(prev.offsetX, prev.offsetY, newScale);
      return { scale: newScale, offsetX: x, offsetY: y };
    });
  }, [clampOffset]);

  // Scroll wheel handler — only zoom when Ctrl is held; otherwise let page scroll
  const onWheel = useCallback(
    (e: WheelEvent) => {
      if (!e.ctrlKey) return; // allow normal page scroll
      e.preventDefault();
      const delta = -e.deltaY;
      setZoom((prev) => {
        const factor = delta > 0 ? 1.1 : 0.9;
        const newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, prev.scale * factor));
        const el = containerRef.current;
        let newOffsetX = prev.offsetX;
        let newOffsetY = prev.offsetY;

        if (el) {
          const rect = el.getBoundingClientRect();
          // transformOrigin is "center top", so the anchor is (center, top).
          // Mouse position relative to that anchor:
          const relX = e.clientX - rect.left - rect.width / 2;
          const relY = e.clientY - rect.top;
          const scaleDelta = newScale / prev.scale;
          newOffsetX = relX * (1 - scaleDelta) + prev.offsetX * scaleDelta;
          newOffsetY = relY * (1 - scaleDelta) + prev.offsetY * scaleDelta;
        }

        const { x, y } = clampOffset(newOffsetX, newOffsetY, newScale);
        return { scale: newScale, offsetX: x, offsetY: y };
      });
    },
    [containerRef, clampOffset]
  );

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [containerRef, onWheel]);

  // Pan handlers — allow click-drag panning at any zoom level
  const onPanMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0) return;
      isPanning.current = true;
      panStart.current = { x: e.clientX, y: e.clientY };
      panStartOffset.current = { x: zoom.offsetX, y: zoom.offsetY };
      e.currentTarget.setAttribute("data-panning", "true");
    },
    [zoom.offsetX, zoom.offsetY]
  );

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!isPanning.current) return;
      const dx = e.clientX - panStart.current.x;
      const dy = e.clientY - panStart.current.y;
      setZoom((prev) => {
        const { x, y } = clampOffset(
          panStartOffset.current.x + dx,
          panStartOffset.current.y + dy,
          prev.scale
        );
        return { ...prev, offsetX: x, offsetY: y };
      });
    };

    const onUp = () => {
      isPanning.current = false;
      document.querySelectorAll("[data-panning]").forEach((el) =>
        el.removeAttribute("data-panning")
      );
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [clampOffset]);

  return {
    zoom,
    setScale,
    reset,
    zoomIn,
    zoomOut,
    onPanMouseDown,
    MIN_SCALE,
    MAX_SCALE,
  };
}
