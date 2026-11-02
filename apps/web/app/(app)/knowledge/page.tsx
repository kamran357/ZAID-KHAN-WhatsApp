'use client';

import { BookOpen } from 'lucide-react';
import { CardHeader, EmptyState, GlassCard } from '@/components/ui/glass-card';
import { Chip } from '@/components/ui/chip';

export default function KnowledgePage() {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-extrabold tracking-tight text-navy md:text-2xl">Knowledge Base</h1>
          <p className="mt-1 text-xs text-ink-muted">
            The only source the AI may answer from. No entry, no invented answer.
          </p>
        </div>
        <Chip tone="yellow" dot>
          Phase 5
        </Chip>
      </div>

      <GlassCard>
        <CardHeader
          title="Entries"
          subtitle="Paste text or upload .txt/.md/.csv — prices come only from here"
        />
        <div className="mt-4">
          <EmptyState
            icon={<BookOpen className="h-6 w-6" aria-hidden />}
            title="Knowledge base is empty"
            message="Phase 5 adds paste/upload, category chips and a retrieval tester. Until entries exist, price and policy questions are handed to you instead of guessed."
          />
        </div>
      </GlassCard>
    </div>
  );
}
