'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Upload, FileImage, FileVideo, Copy, Check, Clock, Shield, Zap, X, Link as LinkIcon, RefreshCw } from 'lucide-react';

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

    try {
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
      const data = await respPromise;
      const fullUrl = `${window.location.origin}/share/${data.id}`;
      setResult({ ...data, fullUrl });
      toast.success('Uploaded! Link valid for 5 minutes.');
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
      toast.success('Link copied!');
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
    <div className="relative min-h-screen overflow-hidden">
      {/* Background gradient orbs */}
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -top-40 -left-40 h-[500px] w-[500px] rounded-full bg-gradient-to-br from-violet-500/30 via-fuchsia-500/20 to-transparent blur-3xl" />
        <div className="absolute top-1/3 -right-40 h-[600px] w-[600px] rounded-full bg-gradient-to-br from-cyan-400/30 via-blue-500/20 to-transparent blur-3xl" />
        <div className="absolute -bottom-40 left-1/4 h-[500px] w-[500px] rounded-full bg-gradient-to-br from-emerald-400/20 via-teal-500/10 to-transparent blur-3xl" />
      </div>

      <header className="container flex items-center justify-between py-6">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white shadow-lg shadow-fuchsia-500/30">
            <Zap className="h-5 w-5" />
          </div>
          <div className="text-xl font-bold tracking-tight">TempShare</div>
        </div>
        <div className="hidden items-center gap-4 text-sm text-muted-foreground sm:flex">
          <div className="flex items-center gap-1.5"><Shield className="h-4 w-4" /> No login</div>
          <div className="flex items-center gap-1.5"><Clock className="h-4 w-4" /> 5 min expiry</div>
        </div>
      </header>

      <main className="container max-w-3xl pb-20 pt-4 sm:pt-12">
        <div className="mb-8 text-center sm:mb-12">
          <h1 className="bg-gradient-to-br from-foreground to-foreground/60 bg-clip-text text-4xl font-extrabold tracking-tight text-transparent sm:text-6xl">
            Share files that vanish.
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-base text-muted-foreground sm:text-lg">
            Drag, drop, share. Your link works for <span className="font-semibold text-foreground">5 minutes</span>, then the file is gone forever.
          </p>
        </div>

        {!result && (
          <Card
            className={`relative overflow-hidden border-2 border-dashed transition-all ${
              dragOver
                ? 'border-violet-500 bg-violet-500/5 scale-[1.01]'
                : 'border-border hover:border-violet-500/50 hover:bg-muted/40'
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
            <div
              role="button"
              onClick={() => !uploading && inputRef.current?.click()}
              className="flex cursor-pointer flex-col items-center justify-center px-6 py-16 text-center sm:py-24"
            >
              <div className={`mb-6 flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white shadow-2xl shadow-fuchsia-500/40 transition-transform ${dragOver ? 'scale-110' : ''}`}>
                <Upload className="h-9 w-9" />
              </div>
              {uploading ? (
                <div className="w-full max-w-md">
                  <div className="mb-2 flex items-center justify-between text-sm">
                    <span className="truncate font-medium">{selectedFile?.name}</span>
                    <span className="text-muted-foreground">{progress}%</span>
                  </div>
                  <Progress value={progress} className="h-2" />
                  <p className="mt-3 text-sm text-muted-foreground">Uploading {selectedFile && formatBytes(selectedFile.size)}…</p>
                </div>
              ) : (
                <>
                  <h2 className="text-xl font-semibold sm:text-2xl">
                    {dragOver ? 'Drop it here' : 'Drag & drop a file'}
                  </h2>
                  <p className="mt-2 text-sm text-muted-foreground">
                    or <span className="font-medium text-foreground underline underline-offset-4">click to browse</span>
                  </p>
                  <div className="mt-6 flex flex-wrap items-center justify-center gap-2 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1 rounded-full border bg-background/60 px-2.5 py-1"><FileImage className="h-3.5 w-3.5" /> PNG · JPG · WEBP</span>
                    <span className="inline-flex items-center gap-1 rounded-full border bg-background/60 px-2.5 py-1"><FileVideo className="h-3.5 w-3.5" /> MP4</span>
                    <span className="inline-flex items-center gap-1 rounded-full border bg-background/60 px-2.5 py-1">Max 50MB</span>
                  </div>
                </>
              )}
            </div>
          </Card>
        )}

        {result && (
          <Card className="relative overflow-hidden">
            <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-violet-500 via-fuchsia-500 to-cyan-500" />
            <div className="p-6 sm:p-8">
              <div className="mb-6 flex items-start justify-between gap-3">
                <div>
                  <div className="inline-flex items-center gap-2 rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                    <Check className="h-3.5 w-3.5" /> Uploaded
                  </div>
                  <h3 className="mt-3 break-all text-lg font-semibold">{result.originalName}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{formatBytes(result.size)} · {result.mimeType}</p>
                </div>
                <Button variant="ghost" size="icon" onClick={reset} aria-label="New upload">
                  <X className="h-5 w-5" />
                </Button>
              </div>

              <div className="rounded-xl border bg-muted/40 p-4">
                <div className="mb-3 flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <LinkIcon className="h-4 w-4" /> Share link
                  </div>
                  <div className="flex items-center gap-1.5 rounded-full bg-background px-2.5 py-1 text-xs font-mono tabular-nums">
                    <Clock className="h-3.5 w-3.5" /> {formatTime(remaining)}
                  </div>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <input
                    readOnly
                    value={result.fullUrl}
                    className="flex-1 rounded-lg border bg-background px-3 py-2 text-sm font-mono outline-none focus:ring-2 focus:ring-ring"
                    onFocus={(e) => e.target.select()}
                  />
                  <Button onClick={copyLink} className="shrink-0">
                    {copied ? <><Check className="mr-2 h-4 w-4" /> Copied</> : <><Copy className="mr-2 h-4 w-4" /> Copy link</>}
                  </Button>
                </div>
                {remaining === 0 && (
                  <p className="mt-3 text-sm font-medium text-destructive">This link has expired.</p>
                )}
              </div>

              {/* Inline preview */}
              <div className="mt-6 overflow-hidden rounded-xl border bg-background">
                {result.mimeType?.startsWith('video') ? (
                  <video src={`/api/file/${result.id}`} controls className="max-h-[420px] w-full bg-black" />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={`/api/file/${result.id}`} alt={result.originalName} className="max-h-[420px] w-full object-contain bg-checker" />
                )}
              </div>

              <div className="mt-6 flex flex-col gap-2 sm:flex-row">
                <Button variant="outline" onClick={reset} className="flex-1">
                  <RefreshCw className="mr-2 h-4 w-4" /> Upload another
                </Button>
                <Button variant="secondary" asChild className="flex-1">
                  <a href={result.fullUrl} target="_blank" rel="noreferrer">
                    Open share page
                  </a>
                </Button>
              </div>
            </div>
          </Card>
        )}

        {/* Feature row */}
        <div className="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <FeatureItem icon={<Clock className="h-5 w-5" />} title="5-minute expiry" desc="Links self-destruct after 5 minutes." />
          <FeatureItem icon={<Shield className="h-5 w-5" />} title="No accounts" desc="No signup. No tracking. Just share." />
          <FeatureItem icon={<Zap className="h-5 w-5" />} title="Drag & drop" desc="Up to 50MB. PNG, JPG, WEBP, MP4." />
        </div>
      </main>

      <footer className="container pb-8 text-center text-xs text-muted-foreground">
        Built with Next.js · Files auto-delete after 5 minutes
      </footer>
    </div>
  );
}

function FeatureItem({ icon, title, desc }) {
  return (
    <div className="rounded-xl border bg-card/50 p-4 backdrop-blur">
      <div className="mb-2 inline-flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500/15 to-fuchsia-500/15 text-violet-600 dark:text-violet-400">
        {icon}
      </div>
      <div className="text-sm font-semibold">{title}</div>
      <div className="text-xs text-muted-foreground">{desc}</div>
    </div>
  );
}
