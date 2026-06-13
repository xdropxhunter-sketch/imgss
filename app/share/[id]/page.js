'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
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

export default function SharePage() {
  const { id } = useParams();
  const [info, setInfo] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [remaining, setRemaining] = useState(0);
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
      toast.success('Link copied!');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Copy failed');
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -top-40 -left-40 h-[500px] w-[500px] rounded-full bg-gradient-to-br from-violet-500/20 via-fuchsia-500/10 to-transparent blur-3xl" />
        <div className="absolute -bottom-40 right-0 h-[500px] w-[500px] rounded-full bg-gradient-to-br from-cyan-400/20 via-blue-500/10 to-transparent blur-3xl" />
      </div>

      <header className="container flex items-center justify-between py-6">
        <Link href="/" className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white shadow-lg shadow-fuchsia-500/30">
            <Zap className="h-5 w-5" />
          </div>
          <div className="text-xl font-bold tracking-tight">TempShare</div>
        </Link>
        <Link href="/" className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
          <ArrowLeft className="h-4 w-4" /> Upload another
        </Link>
      </header>

      <main className="container max-w-3xl pb-20">
        {loading && (
          <Card className="p-12 text-center text-muted-foreground">Loading…</Card>
        )}

        {!loading && error && (
          <Card className="p-10 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10 text-destructive">
              <AlertTriangle className="h-7 w-7" />
            </div>
            <h2 className="text-2xl font-semibold">This link is gone</h2>
            <p className="mt-2 text-muted-foreground">{error}. TempShare files self-destruct 5 minutes after upload.</p>
            <Button asChild className="mt-6">
              <Link href="/">Upload your own file</Link>
            </Button>
          </Card>
        )}

        {!loading && !error && info && (
          <Card className="relative overflow-hidden">
            <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-violet-500 via-fuchsia-500 to-cyan-500" />
            <div className="p-6 sm:p-8">
              <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h1 className="break-all text-lg font-semibold sm:text-xl">{info.originalName}</h1>
                  <p className="mt-1 text-sm text-muted-foreground">{formatBytes(info.size)} · {info.mimeType}</p>
                </div>
                <div className="flex items-center gap-1.5 rounded-full bg-muted px-3 py-1.5 text-sm font-mono tabular-nums">
                  <Clock className="h-4 w-4" /> {formatTime(remaining)}
                </div>
              </div>

              <div className="overflow-hidden rounded-xl border bg-background">
                {info.mimeType?.startsWith('video') ? (
                  <video src={`/api/file/${id}`} controls autoPlay playsInline className="max-h-[70vh] w-full bg-black" />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={`/api/file/${id}`} alt={info.originalName} className="max-h-[70vh] w-full object-contain" />
                )}
              </div>

              <div className="mt-6 flex flex-col gap-2 sm:flex-row">
                <Button onClick={copyLink} variant="outline" className="flex-1">
                  {copied ? <><Check className="mr-2 h-4 w-4" /> Copied</> : <><Copy className="mr-2 h-4 w-4" /> Copy link</>}
                </Button>
                <Button asChild className="flex-1">
                  <a href={`/api/file/${id}`} download={info.originalName}>
                    <Download className="mr-2 h-4 w-4" /> Download
                  </a>
                </Button>
              </div>

              <p className="mt-6 text-center text-xs text-muted-foreground">
                This file will be permanently deleted when the timer hits 0:00.
              </p>
            </div>
          </Card>
        )}
      </main>
    </div>
  );
}
