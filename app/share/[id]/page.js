'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import { Clock, Copy, Check, Download, AlertTriangle, Zap, ArrowLeft } from 'lucide-react';

function formatBytes(n) {
  if (!n && n !== 0) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

function formatTime(s) {
  if (s <= 0) return '0:00';
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

// Circular progress ring
function NeuRing({ percent, label }) {
  const size = 120;
  const stroke = 10;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const off = c - (percent / 100) * c;
  return (
    <div
      className="relative flex items-center justify-center rounded-full neu-raised"
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} className="absolute inset-0 -rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="#d3d4dc" strokeWidth={stroke} fill="none" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke="url(#ringGrad2)"
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={off}
          style={{ transition: 'stroke-dashoffset 0.6s ease' }}
        />
        <defs>
          <linearGradient id="ringGrad2" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#a8c5e0" />
            <stop offset="100%" stopColor="#7da3c9" />
          </linearGradient>
        </defs>
      </svg>
      <div className="text-center">
        <div className="text-xl font-bold neu-text-strong tabular-nums">{label}</div>
        <div className="text-[10px] uppercase tracking-wide neu-text-soft">remaining</div>
      </div>
    </div>
  );
}

export default function SharePage() {
  const { id } = useParams();
  const [info, setInfo] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [remaining, setRemaining] = useState(0);
  const [totalSec, setTotalSec] = useState(300);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(`/api/info/${id}`);
        const data = await res.json();
        if (!res.ok) {
          if (!cancelled) setError(data?.error || 'File not available');
        } else if (!cancelled) {
          setInfo(data);
          const created = new Date(data.createdAt).getTime();
          const exp = new Date(data.expiresAt).getTime();
          setTotalSec(Math.max(1, Math.floor((exp - created) / 1000)));
        }
      } catch (e) {
        if (!cancelled) setError('Network error');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [id]);

  useEffect(() => {
    if (!info?.expiresAt) return;
    const tick = () => {
      const ms = new Date(info.expiresAt).getTime() - Date.now();
      const r = Math.max(0, Math.floor(ms / 1000));
      setRemaining(r);
      if (r === 0) setError('File expired');
    };
    tick();
    const i = setInterval(tick, 1000);
    return () => clearInterval(i);
  }, [info?.expiresAt]);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      toast.success('Link copied');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Copy failed');
    }
  };

  const percent = totalSec > 0 ? Math.round((remaining / totalSec) * 100) : 0;

  return (
    <div className="min-h-screen neu-bg">
      <header className="container flex items-center justify-between py-6">
        <Link href="/" className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-full neu-raised-sm">
            <Zap className="h-5 w-5" style={{ color: '#7da3c9' }} />
          </div>
          <div>
            <div className="text-lg font-semibold neu-text-strong tracking-tight">TempShare</div>
            <div className="text-xs neu-text-soft">temporary file sharing</div>
          </div>
        </Link>
        <Link
          href="/"
          className="inline-flex items-center gap-2 rounded-full neu-btn px-4 py-2 text-xs font-semibold"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Upload another
        </Link>
      </header>

      <main className="container max-w-3xl pb-20">
        {loading && (
          <div className="rounded-3xl neu-raised p-12 text-center neu-text-soft">Loading…</div>
        )}

        {!loading && error && (
          <div className="rounded-3xl neu-raised p-10 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full neu-inset">
              <AlertTriangle className="h-7 w-7" style={{ color: '#c47a7a' }} />
            </div>
            <h2 className="text-2xl font-semibold neu-text-strong">This link is gone</h2>
            <p className="mt-2 neu-text-soft">
              {error}. TempShare files self-destruct 5 minutes after upload.
            </p>
            <Link
              href="/"
              className="mt-6 inline-flex items-center justify-center rounded-xl neu-btn-primary px-5 py-3 text-sm font-semibold"
            >
              Upload your own file
            </Link>
          </div>
        )}

        {!loading && !error && info && (
          <div className="rounded-3xl neu-raised p-6 sm:p-8">
            {/* Header row */}
            <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
              <div className="min-w-0 flex-1">
                <h1 className="break-all text-lg font-semibold neu-text-strong sm:text-xl">
                  {info.originalName}
                </h1>
                <p className="mt-1 text-sm neu-text-soft">
                  File Size: <span className="neu-text-strong font-semibold">{formatBytes(info.size)}</span>
                  {' · '}
                  .{(info.originalName?.split('.').pop() || '').toUpperCase()}
                </p>
              </div>
              <NeuRing percent={percent} label={formatTime(remaining)} />
            </div>

            {/* Preview */}
            <div className="overflow-hidden rounded-2xl neu-inset p-2">
              <div className="overflow-hidden rounded-xl bg-[#e6e7ee]">
                {info.mimeType?.startsWith('video') ? (
                  <video src={`/api/file/${id}`} controls autoPlay playsInline className="max-h-[70vh] w-full bg-black" />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={`/api/file/${id}`} alt={info.originalName} className="max-h-[70vh] w-full object-contain" />
                )}
              </div>
            </div>

            {/* Action buttons */}
            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <button
                onClick={copyLink}
                className="flex-1 rounded-xl neu-btn px-5 py-3 text-sm font-semibold inline-flex items-center justify-center"
              >
                {copied ? (
                  <><Check className="mr-2 h-4 w-4" /> Copied</>
                ) : (
                  <><Copy className="mr-2 h-4 w-4" /> Copy link</>
                )}
              </button>
              <a
                href={`/api/file/${id}`}
                download={info.originalName}
                className="flex-1 rounded-xl neu-btn-primary px-5 py-3 text-sm font-semibold inline-flex items-center justify-center"
              >
                <Download className="mr-2 h-4 w-4" /> Download
              </a>
            </div>

            <div className="mt-6 flex items-center justify-center gap-2 rounded-full neu-inset-sm py-2 text-xs neu-text-soft">
              <Clock className="h-3.5 w-3.5" />
              This file will be permanently deleted when the timer hits 0:00.
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
