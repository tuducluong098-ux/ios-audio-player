'use client';

import React, { useRef, useState, useCallback, useEffect } from 'react';
import { Minus, Plus, Timer, X } from 'lucide-react';

interface CircularTimerModalProps {
  isOpen: boolean;
  initialMinutes: number;
  onClose: () => void;
  onConfirm: (minutes: number) => void;
}

/**
 * Popup đồng hồ đếm ngược 1 tiếng (1 - 60 phút) hỗ trợ kéo tay trực tiếp trên vòng tròn.
 */
export function CircularTimerModal({
  isOpen,
  initialMinutes,
  onClose,
  onConfirm,
}: CircularTimerModalProps) {
  const [minutes, setMinutes] = useState<number>(initialMinutes);
  const [isDragging, setIsDragging] = useState(false);
  const svgRef = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    if (isOpen) {
      setMinutes(Math.max(1, Math.min(60, initialMinutes || 20)));
    }
  }, [isOpen, initialMinutes]);

  const updateMinutesFromClientPos = useCallback((clientX: number, clientY: number) => {
    const svg = svgRef.current;
    if (!svg) return;

    const rect = svg.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;

    const dx = clientX - cx;
    const dy = clientY - cy;

    // Góc theo chiều kim đồng hồ tính từ mốc 12 giờ (0° -> 360°)
    const deg = (((Math.atan2(dy, dx) * 180) / Math.PI) + 90 + 360) % 360;
    let nextMins = Math.round((deg / 360) * 60);
    if (nextMins === 0) nextMins = 60;
    nextMins = Math.max(1, Math.min(60, nextMins));

    setMinutes(nextMins);
  }, []);

  const handlePointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    setIsDragging(true);
    updateMinutesFromClientPos(e.clientX, e.clientY);
  };

  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!isDragging) return;
    e.preventDefault();
    updateMinutesFromClientPos(e.clientX, e.clientY);
  };

  const handlePointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!isDragging) return;
    setIsDragging(false);
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {}
  };

  if (!isOpen) return null;

  const size = 264;
  const center = size / 2;
  const radius = 98;
  const angleDeg = minutes * 6;
  const angleRad = ((angleDeg - 90) * Math.PI) / 180;
  const knobX = center + radius * Math.cos(angleRad);
  const knobY = center + radius * Math.sin(angleRad);
  const largeArc = minutes > 30 ? 1 : 0;

  const arcPath =
    minutes < 60
      ? `M ${center} ${center - radius} A ${radius} ${radius} 0 ${largeArc} 1 ${knobX} ${knobY}`
      : '';

  const ticks = Array.from({ length: 60 }, (_, i) => i + 1);

  return (
    <div className="la-modal-backdrop fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="la-modal-sheet liquid-glass w-full max-w-sm rounded-[36px] p-6 space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-white/15 border border-white/20 flex items-center justify-center">
              <Timer className="w-4 h-4 text-white" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-white">Đồng hồ hẹn giờ</h3>
              <p className="text-xs text-white/65">Di tay kéo vòng tròn từ 1–60 phút</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="liquid-btn w-8 h-8 rounded-full flex items-center justify-center text-white/75 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Vòng tròn đồng hồ kéo tay 60 phút */}
        <div className="relative flex items-center justify-center select-none">
          <svg
            ref={svgRef}
            width={size}
            height={size}
            viewBox={`0 0 ${size} ${size}`}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            className="touch-none cursor-grab active:cursor-grabbing overflow-visible"
          >
            <defs>
              <linearGradient id="dialGlow" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#ffffff" stopOpacity="0.98" />
                <stop offset="50%" stopColor="#bae6fd" stopOpacity="0.95" />
                <stop offset="100%" stopColor="#a5b4fc" stopOpacity="0.95" />
              </linearGradient>
              <filter id="softGlow" x="-30%" y="-30%" width="160%" height="160%">
                <feGaussianBlur stdDeviation="4" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            {/* Rãnh nền vòng tròn */}
            <circle
              cx={center}
              cy={center}
              r={radius}
              fill="rgba(0,0,0,0.22)"
              stroke="rgba(255,255,255,0.12)"
              strokeWidth="18"
            />

            {/* Các vạch chia 60 phút */}
            {ticks.map((tick) => {
              const isQuarter = tick % 15 === 0;
              const isFive = tick % 5 === 0;
              const tRad = ((tick * 6 - 90) * Math.PI) / 180;
              const rOuter = radius - 14;
              const rInner = isQuarter ? radius - 26 : isFive ? radius - 22 : radius - 18;
              const x1 = center + rOuter * Math.cos(tRad);
              const y1 = center + rOuter * Math.sin(tRad);
              const x2 = center + rInner * Math.cos(tRad);
              const y2 = center + rInner * Math.sin(tRad);

              const active = tick <= minutes;

              return (
                <line
                  key={tick}
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  stroke={
                    active
                      ? 'rgba(255,255,255,0.92)'
                      : isFive
                      ? 'rgba(255,255,255,0.35)'
                      : 'rgba(255,255,255,0.16)'
                  }
                  strokeWidth={isQuarter ? 2.5 : isFive ? 1.8 : 1}
                  strokeLinecap="round"
                />
              );
            })}

            {/* Nhãn số 60 / 15 / 30 / 45 */}
            {[
              { label: '60', x: center, y: center - radius + 37 },
              { label: '15', x: center + radius - 37, y: center + 4 },
              { label: '30', x: center, y: center + radius - 31 },
              { label: '45', x: center - radius + 37, y: center + 4 },
            ].map((item) => (
              <text
                key={item.label}
                x={item.x}
                y={item.y}
                textAnchor="middle"
                fill="rgba(255,255,255,0.65)"
                fontSize="11"
                fontWeight="600"
              >
                {item.label}
              </text>
            ))}

            {/* Cung tròn thời gian đã chọn */}
            {minutes === 60 ? (
              <circle
                cx={center}
                cy={center}
                r={radius}
                fill="none"
                stroke="url(#dialGlow)"
                strokeWidth="14"
                filter="url(#softGlow)"
              />
            ) : (
              <path
                d={arcPath}
                fill="none"
                stroke="url(#dialGlow)"
                strokeWidth="14"
                strokeLinecap="round"
                filter="url(#softGlow)"
              />
            )}

            {/* Núm kéo tay tròn phát sáng */}
            <circle
              cx={minutes === 60 ? center : knobX}
              cy={minutes === 60 ? center - radius : knobY}
              r={isDragging ? 15 : 13}
              fill="#ffffff"
              stroke="rgba(255,255,255,0.9)"
              strokeWidth="2"
              style={{
                filter: 'drop-shadow(0 4px 12px rgba(0,0,0,0.55))',
              }}
            />
            <circle
              cx={minutes === 60 ? center : knobX}
              cy={minutes === 60 ? center - radius : knobY}
              r={4}
              fill="#09090b"
            />
          </svg>

          {/* Hiển thị số phút ở giữa tâm đồng hồ */}
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-4xl font-bold tracking-tight text-white tabular-nums">
              {minutes}
            </span>
            <span className="text-xs font-medium text-white/65">phút</span>
          </div>
        </div>

        {/* Nút tinh chỉnh nhanh -1p / +1p */}
        <div className="flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => setMinutes((m) => Math.max(1, m - 1))}
            className="liquid-btn w-10 h-10 rounded-full flex items-center justify-center text-white"
            title="Giảm 1 phút"
          >
            <Minus className="w-4 h-4" />
          </button>
          <span className="text-sm font-medium text-white/80 tabular-nums px-2">
            Tắt sau {minutes}:00 • Fade-out 15s cuối
          </span>
          <button
            type="button"
            onClick={() => setMinutes((m) => Math.min(60, m + 1))}
            className="liquid-btn w-10 h-10 rounded-full flex items-center justify-center text-white"
            title="Tăng 1 phút"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>

        {/* Nút Hủy / Bắt đầu */}
        <div className="grid grid-cols-2 gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="liquid-btn py-3.5 rounded-2xl text-sm font-semibold text-white/90"
          >
            Hủy
          </button>
          <button
            type="button"
            onClick={() => onConfirm(minutes)}
            className="liquid-orb-primary py-3.5 rounded-2xl text-sm font-semibold text-zinc-950 active:scale-[0.97] transition"
          >
            Hẹn {minutes} phút
          </button>
        </div>
      </div>
    </div>
  );
}
