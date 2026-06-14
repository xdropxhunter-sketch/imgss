'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  Upload,
  FileImage,
  FileVideo,
  Copy,
  Check,
  Clock,
  Shield,
  Zap,
  X,
  Link as LinkIcon,
  RefreshCw,
  Search,
} from 'lucide-react';

const ALLOWED = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'video/mp4'];
const ALLOWED_EXT = ['png', 'jpg', 'jpeg', 'webp', 'mp4'];
const MAX_BYTES = 50 * 1024 * 1024;

function formatBytes(n) {
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

// Segmented progress (like the reference dashes)
function SegmentedProgress({ value }) {
  const segments = 24;
  const filled = Math.round((value / 100) * segments);
  return (
    <div className="flex items-center gap-1.5">
      {Array.from({ length: segments }).map((_, i) => (
        <div
          key={i}
          className={`h-2 flex-1 rounded-sm transition-colors ${
            i < filled ? 'bg-[#7da3c9]' : 'bg-[#cfd0d8]'
          }`}
          style={
            i < filled
              ? { boxShadow: '0 0 4px rgba(125,163,201,0.5)' }
              : { boxShadow: 'inset 1px 1px 2px rgba(174,174,192,0.4)' }
          }
        />
      ))}
    </div>
  );
}

// Circular progress (like the 75% ring)
function NeuRing({ value, label }) {
  const size = 120;
  const stroke = 10;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const off = c - (value / 100) * c;
  return (
    <div className="relative inline-flex items-center justify-center">
      <div
        className="relative flex items-center justify-center rounded-full neu-raised"
        style={{ width: size, height: size }}
      >
        <svg width={size} height={size} className="absolute inset-0 -rotate-90">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke="#d3d4dc"
            strokeWidth={stroke}
            fill="none"
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke="url(#ringGrad)"
            strokeWidth={stroke}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={off}
            style={{ transition: 'stroke-dashoffset 0.4s ease' }}
          />
          <defs>
            <linearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#a8c5e0" />
              <stop offset="100%" stopColor="#7da3c9" />
            </linearGradient>
          </defs>
        </svg>
        <div className="relative text-center">
          <div className="text-2xl font-semibold neu-text-strong tabular-nums">{label}</div>
        </div>
      </div>
    </div>
  );
}

export default function HomePage() {
  const inputRef = useRef(null);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState(null);
  const [copied, setCopied] = useState(false);
  const [remaining, setRemaining] = useState(0);
  const [selectedFile, setSelectedFile] = useState(null);

  useEffect(() => {
    if (!result?.expiresAt) return;
    const tick = () => {
      const ms = new Date(result.expiresAt).getTime() - Date.now();
      setRemaining(Math.max(0, Math.floor(ms / 1000)));
    };
    tick();
    const i = setInterval(tick, 1000);
    return () => clearInterval(i);
  }, [result?.expiresAt]);

  const validate = (file) => {
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    if (!ALLOWED.includes(file.type) && !ALLOWED_EXT.includes(ext)) {
      toast.error('Unsupported file. Use PNG, JPG, JPEG, WEBP, or MP4.');
      return false;
    }
    if (file.size > MAX_BYTES) {
      toast.error('File too large. Max is 50MB.');
      return false;
    }
    if (file.size <= 0) {
      toast.error('Empty file.');
      return false;
    }
    return true;
  };

  const uploadFile = useCallback(async (file) => {
    if (!validate(file)) return;
    setSelectedFile(file);
    setUploading(true);
    setProgress(0);
    setResult(null);
    setCopied(false);

    const uploadWithServer = async () => {
      const fd = new FormData();
      fd.append('file', file);

      const xhr = new XMLHttpRequest();
      xhr.open('POST', '/api/upload');
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          setProgress(Math.round((e.loaded / e.total) * 100));
        }
      };
      const respPromise = new Promise((resolve, reject) => {
        xhr.onload = () => {
          try {
            const data = JSON.parse(xhr.responseText);
            if (xhr.status >= 200 && xhr.status < 300) resolve(data);
            else reject(new Error(data?.error || 'Upload failed'));
          } catch (e) {
            reject(new Error('Bad server response'));
          }
        };
        xhr.onerror = () => reject(new Error('Network error'));
      });
      xhr.send(fd);
      return respPromise;
    };

    const uploadWithS3 = async () => {
      const prepareResp = await fetch('/api/upload-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: file.name,
          type: file.type,
          size: file.size,
        }),
      });
      const data = await prepareResp.json().catch(() => null);
      if (!prepareResp.ok) {
        throw new Error(data?.error || 'Upload failed');
      }

      const xhr = new XMLHttpRequest();
      xhr.open('PUT', data.uploadUrl);
      if (file.type) xhr.setRequestHeader('Content-Type', file.type);
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          setProgress(Math.round((e.loaded / e.total) * 100));
        }
      };
      const uploadPromise = new Promise((resolve, reject) => {
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) resolve();
          else reject(new Error('Upload failed'));
        };
        xhr.onerror = () => reject(new Error('Network error'));
      });
      xhr.send(file);
      await uploadPromise;
      return data;
    };

    try {
      let data;
      try {
        data = await uploadWithS3();
      } catch (e) {
        if (e.message === 'Direct upload is only available for S3 storage') {
          data = await uploadWithServer();
        } else {
          throw e;
        }
      }
      const fullUrl = `${window.location.origin}/api/file/${data.id}`;
      setResult({ ...data, fullUrl });
      toast.success('Uploaded. Link valid for 5 minutes.');
    } catch (e) {
      toast.error(e.message || 'Upload failed');
      setSelectedFile(null);
    } finally {
      setUploading(false);
    }
  }, []);

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) uploadFile(f);
  };

  const handlePick = (e) => {
    const f = e.target.files?.[0];
    if (f) uploadFile(f);
  };

  const copyLink = async () => {
    if (!result?.fullUrl) return;
    try {
      await navigator.clipboard.writeText(result.fullUrl);
      setCopied(true);
      toast.success('Link copied');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Copy failed');
    }
  };

  const reset = () => {
    setResult(null);
    setSelectedFile(null);
    setProgress(0);
    setCopied(false);
  };

  return (
    <div className="min-h-screen neu-bg">
      {/* Header */}
      <header className="container flex items-center justify-between py-6">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-full neu-raised-sm">
            <Zap className="h-5 w-5" style={{ color: '#7da3c9' }} />
          </div>
          <div>
            <div className="text-lg font-semibold neu-text-strong tracking-tight">TempShare</div>
            <div className="text-xs neu-text-soft">files that vanish in 5 minutes</div>
          </div>
        </div>
        <div className="hidden items-center gap-3 sm:flex">
          <div className="flex items-center gap-2 rounded-full neu-inset-sm px-3 py-1.5 text-xs neu-text-soft">
            <Shield className="h-3.5 w-3.5" /> No login
          </div>
          <div className="flex items-center gap-2 rounded-full neu-inset-sm px-3 py-1.5 text-xs neu-text-soft">
            <Clock className="h-3.5 w-3.5" /> 5 min expiry
          </div>
        </div>
      </header>

      <main className="container max-w-3xl pb-20 pt-2 sm:pt-8">
        {/* Hero */}
        <div className="mb-10 text-center">
          <h1 className="text-3xl font-bold tracking-tight neu-text-strong sm:text-5xl">
            Share files that vanish.
          </h1>
          <p className="mx-auto mt-3 max-w-xl text-sm neu-text-soft sm:text-base">
            Drag, drop, share. Your link works for <span className="neu-text-strong font-semibold">5 minutes</span>, then it&apos;s gone forever.
          </p>
        </div>

        {!result && (
          <div
            className={`rounded-3xl p-6 transition-transform sm:p-8 ${
              dragOver ? 'neu-inset scale-[0.995]' : 'neu-raised'
            }`}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
          >
            <input
              ref={inputRef}
              type="file"
              className="hidden"
              accept=".png,.jpg,.jpeg,.webp,.mp4,image/png,image/jpeg,image/webp,video/mp4"
              onChange={handlePick}
            />

            {/* Upload area */}
            <div
              role="button"
              onClick={() => !uploading && inputRef.current?.click()}
              className={`flex cursor-pointer flex-col items-center justify-center rounded-2xl px-6 py-12 text-center sm:py-16 ${
                dragOver ? 'neu-raised-sm' : 'neu-inset'
              }`}
            >
              {uploading ? (
                <div className="w-full max-w-md">
                  {/* "Downloading..." style header from the reference, adapted to upload */}
                  <div className="mb-4 flex items-end justify-between">
                    <div className="text-left">
                      <div className="text-2xl font-bold neu-text-strong">Uploading...</div>
                      <div className="mt-1 text-sm neu-text-soft">
                        File Size: <span className="neu-text-strong font-semibold">{selectedFile && formatBytes(selectedFile.size)}</span>
                        {selectedFile && <span> · .{(selectedFile.name.split('.').pop() || '').toUpperCase()}</span>}
                      </div>
                    </div>
                    <div className="text-xl font-semibold neu-text-strong tabular-nums">{progress}%</div>
                  </div>
                  <SegmentedProgress value={progress} />
                  <div className="mt-4 truncate text-xs neu-text-soft">{selectedFile?.name}</div>
                </div>
              ) : (
                <>
                  <div className="mb-5 flex h-20 w-20 items-center justify-center rounded-full neu-raised">
                    <Upload className="h-8 w-8" style={{ color: '#7da3c9' }} />
                  </div>
                  <h2 className="text-xl font-semibold neu-text-strong sm:text-2xl">
                    {dragOver ? 'Drop it here' : 'Drag & drop a file'}
                  </h2>
                  <p className="mt-2 text-sm neu-text-soft">
                    or <span className="neu-text-strong font-medium underline underline-offset-4">click to browse</span>
                  </p>
                  <div className="mt-6 flex flex-wrap items-center justify-center gap-2 text-xs neu-text-soft">
                    <span className="inline-flex items-center gap-1.5 rounded-full neu-raised-sm px-3 py-1.5">
                      <FileImage className="h-3.5 w-3.5" /> PNG · JPG · WEBP
                    </span>
                    <span className="inline-flex items-center gap-1.5 rounded-full neu-raised-sm px-3 py-1.5">
                      <FileVideo className="h-3.5 w-3.5" /> MP4
                    </span>
                    <span className="inline-flex items-center gap-1.5 rounded-full neu-raised-sm px-3 py-1.5">
                      Max 50MB
                    </span>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {result && (
          <div className="rounded-3xl neu-raised p-6 sm:p-8">
            {/* Top bar */}
            <div className="mb-6 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="inline-flex items-center gap-2 rounded-full neu-inset-sm px-3 py-1 text-xs neu-text-strong">
                  <Check className="h-3.5 w-3.5" style={{ color: '#5b8c5b' }} /> Uploaded
                </div>
                <h3 className="mt-3 break-all text-lg font-semibold neu-text-strong">{result.originalName}</h3>
                <p className="mt-1 text-sm neu-text-soft">{formatBytes(result.size)} · {result.mimeType}</p>
              </div>
              <button
                onClick={reset}
                aria-label="New upload"
                className="flex h-10 w-10 items-center justify-center rounded-full neu-btn"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Link box */}
            <div className="rounded-2xl neu-inset p-4">
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm font-medium neu-text-strong">
                  <LinkIcon className="h-4 w-4" /> Share link
                </div>
                <div className="flex items-center gap-1.5 rounded-full neu-raised-sm px-3 py-1 text-xs font-mono tabular-nums neu-text-strong">
                  <Clock className="h-3.5 w-3.5" /> {formatTime(remaining)}
                </div>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row">
                <div className="flex-1 rounded-xl neu-raised-sm px-4 py-3">
                  <input
                    readOnly
                    value={result.fullUrl}
                    className="w-full bg-transparent text-sm font-mono outline-none neu-text-strong"
                    onFocus={(e) => e.target.select()}
                  />
                </div>
                <button
                  onClick={copyLink}
                  className="shrink-0 rounded-xl neu-btn-primary px-5 py-3 text-sm font-semibold inline-flex items-center justify-center"
                >
                  {copied ? (
                    <><Check className="mr-2 h-4 w-4" /> Copied</>
                  ) : (
                    <><Copy className="mr-2 h-4 w-4" /> Copy link</>
                  )}
                </button>
              </div>
              {remaining === 0 && (
                <p className="mt-3 text-sm font-medium text-red-700">This link has expired.</p>
              )}
            </div>

            {/* Preview */}
            <div className="mt-6 overflow-hidden rounded-2xl neu-inset p-2">
              <div className="overflow-hidden rounded-xl bg-[#e6e7ee]">
                {result.mimeType?.startsWith('video') ? (
                  <video src={`/api/file/${result.id}`} controls className="max-h-[420px] w-full bg-black" />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={`/api/file/${result.id}`} alt={result.originalName} className="max-h-[420px] w-full object-contain" />
                )}
              </div>
            </div>

            {/* Action row */}
            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <button
                onClick={reset}
                className="flex-1 rounded-xl neu-btn px-5 py-3 text-sm font-semibold inline-flex items-center justify-center"
              >
                <RefreshCw className="mr-2 h-4 w-4" /> Upload another
              </button>
              <a
                href={result.fullUrl}
                target="_blank"
                rel="noreferrer"
                className="flex-1 rounded-xl neu-btn px-5 py-3 text-sm font-semibold inline-flex items-center justify-center"
              >
                Open in new tab
              </a>
            </div>
          </div>
        )}

        {/* Feature row */}
        <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <FeatureItem icon={<Clock className="h-5 w-5" />} title="5-minute expiry" desc="Links self-destruct after 5 minutes." />
          <FeatureItem icon={<Shield className="h-5 w-5" />} title="No accounts" desc="No signup. No tracking. Just share." />
          <FeatureItem icon={<Zap className="h-5 w-5" />} title="Drag & drop" desc="Up to 50MB. PNG, JPG, WEBP, MP4." />
        </div>
      </main>

      <footer className="container pb-8 text-center text-xs neu-text-soft">
        Built with Next.js · Files auto-delete after 5 minutes
      </footer>
    </div>
  );
}

function FeatureItem({ icon, title, desc }) {
  return (
    <div className="rounded-2xl neu-raised-sm p-5">
      <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-full neu-inset-sm" style={{ color: '#7da3c9' }}>
        {icon}
      </div>
      <div className="text-sm font-semibold neu-text-strong">{title}</div>
      <div className="mt-1 text-xs neu-text-soft">{desc}</div>
    </div>
  );
}
