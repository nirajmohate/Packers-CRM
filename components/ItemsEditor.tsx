'use client';
import { useRef } from 'react';
import { Check, Pencil, Plus, Trash2, X } from 'lucide-react';
import type { Column, ModuleConfig, Row } from '@/lib/types';
import { lineAmount } from '@/lib/calc';
import { inr } from '@/lib/format';
import { FieldLabel, Hi } from './ui';

/**
 * Item entry like a shopping list: fill the boxes once, press "Add item", the item drops into the list below
 * and the boxes empty for the next one. Tap the pencil on a listed item to change it.
 */
export interface ItemsEditorProps {
  cfg: ModuleConfig;
  items: Row[];
  entry: Row;
  editing: number | null;
  /** errors for the boxes at the top (keyed by column) */
  entryErrors: Record<string, string>;
  /** errors from saving, keyed `item-<index>-<column>` */
  errors: Record<string, string>;
  listId?: string;
  chips: string[];
  onEntry: (key: string, value: string) => void;
  onAdd: () => void;
  onEdit: (i: number) => void;
  onCancelEdit: () => void;
  onRemove: (i: number) => void;
  onChip: (name: string) => void;
}

function Box({ c, value, error, listId, onChange, onEnter, inputRef }: { c: Column; value: string; error?: string; listId?: string; onChange: (v: string) => void; onEnter: () => void; inputRef?: React.RefObject<HTMLInputElement> }) {
  const cls = `input ${error ? 'border-red-500 ring-2 ring-red-100' : ''}`;
  const id = 'entry-' + c.key;
  if (c.type === 'select')
    return (
      <select id={id} data-err={error ? '1' : undefined} className={cls} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">{c.emptyLabel ?? 'Select'}</option>
        {c.options?.map((o) => <option key={o} value={o}>{c.key === 'gst' ? o + '%' : o}</option>)}
      </select>
    );
  return (
    <input
      id={id} ref={inputRef} data-err={error ? '1' : undefined} className={cls} value={value} placeholder={c.placeholder} list={listId}
      type={c.type === 'number' ? 'number' : 'text'} inputMode={c.type === 'number' ? 'decimal' : undefined}
      step={c.type === 'number' ? 'any' : undefined} min={c.type === 'number' ? 0 : undefined} maxLength={500}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); onEnter(); } }}
    />
  );
}

export default function ItemsEditor(p: ItemsEditorProps) {
  const { cfg } = p;
  const cols = cfg.columns ?? [];
  const first = useRef<HTMLInputElement>(null);
  const add = () => { p.onAdd(); setTimeout(() => first.current?.focus(), 30); };
  const isEditing = p.editing !== null;

  return (
    <div className="space-y-4">
      {/* ---- entry boxes ---- */}
      <div className={`rounded-2xl border-2 p-3 ${isEditing ? 'border-amber-400 bg-amber-50/60' : 'border-orange-200 bg-orange-50/50'}`}>
        <p className="mb-2 text-sm font-bold text-orange-800">
          {isEditing ? `Changing item ${p.editing! + 1}` : 'New item'} <Hi t={isEditing ? 'Update item' : 'Add item'} className="text-xs text-orange-700" />
        </p>
        {p.chips.length > 0 && !isEditing && (
          <div className="no-scrollbar -mx-1 mb-2 flex gap-2 overflow-x-auto px-1 pb-1">
            {p.chips.map((c) => <button key={c} type="button" onClick={() => { p.onChip(c); setTimeout(() => document.getElementById(cols[1] ? 'entry-' + cols[1].key : 'entry-description')?.focus(), 30); }} className="whitespace-nowrap rounded-full border border-orange-300 bg-white px-3 py-1.5 text-xs font-medium text-orange-800 active:bg-orange-100">+ {c}</button>)}
          </div>
        )}
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-6">
          {cols.map((c, ci) => (
            <div key={c.key} className={ci === 0 || c.wide ? 'col-span-2' : ''}>
              <FieldLabel text={c.label} required={c.required} htmlFor={'entry-' + c.key} />
              <Box c={c} value={p.entry[c.key] ?? ''} error={p.entryErrors[c.key]} listId={ci === 0 ? p.listId : undefined} onChange={(v) => p.onEntry(c.key, v)} onEnter={add} inputRef={ci === 0 ? first : undefined} />
              {p.entryErrors[c.key] && <p className="mt-1 text-xs font-medium text-red-600">{p.entryErrors[c.key]}</p>}
            </div>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
          {cfg.money && <span className="mr-auto text-sm font-semibold text-slate-700">Amount: {inr(lineAmount(p.entry))}</span>}
          {isEditing && <button type="button" className="btn-ghost min-h-[40px]" onClick={p.onCancelEdit}><X size={16} />Cancel</button>}
          <button type="button" onClick={add} className="btn min-h-[42px] bg-orange-500 px-5 text-white hover:bg-orange-600">
            {isEditing ? <Check size={18} /> : <Plus size={18} />}{isEditing ? 'Update item' : 'Add item'} <Hi t={isEditing ? 'Update item' : 'Add item'} className="text-xs text-white/90" />
          </button>
        </div>
      </div>

      {/* ---- the list ---- */}
      <div>
        <p className="mb-2 text-sm font-semibold text-slate-700">Added items ({p.items.length}) <Hi t="Added items" className="text-xs text-slate-400" /></p>
        {p.items.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-300 p-4 text-center text-sm text-slate-500">No items yet. Fill the boxes above and press <b>Add item</b>.</p>
        ) : (
          <ol className="divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-300 bg-white">
            {p.items.map((r, i) => {
              const errs = cols.map((c) => p.errors[`item-${i}-${c.key}`] && `${c.label}: ${p.errors[`item-${i}-${c.key}`]}`).filter(Boolean);
              const details = cols.slice(1).filter((c) => (r[c.key] ?? '').trim()).map((c) => `${c.label}: ${c.key === 'rate' ? inr(Number(r[c.key]) || 0) : c.key === 'gst' ? r[c.key] + '%' : r[c.key]}`);
              return (
                <li key={i} className={`flex items-start gap-3 px-3 py-2.5 ${p.editing === i ? 'bg-amber-50' : errs.length ? 'bg-red-50' : i % 2 ? 'bg-slate-50' : ''}`}>
                  <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-700">{i + 1}</span>
                  <div className="min-w-0 flex-1 text-sm">
                    <p className="font-semibold text-slate-900">{r[cols[0]?.key] || '—'}</p>
                    {details.length > 0 && <p className="text-xs text-slate-600">{details.join(' · ')}</p>}
                    {errs.map((m) => <p key={m} className="text-xs font-medium text-red-600">{m}</p>)}
                  </div>
                  {cfg.money && <span className="shrink-0 text-sm font-bold text-emerald-700">{inr(lineAmount(r))}</span>}
                  <button type="button" onClick={() => p.onEdit(i)} className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-sky-50 text-sky-700 ring-1 ring-sky-200" aria-label={`Change item ${i + 1}`}><Pencil size={15} /></button>
                  <button type="button" onClick={() => p.onRemove(i)} className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-red-50 text-red-600 ring-1 ring-red-200" aria-label={`Remove item ${i + 1}`}><Trash2 size={15} /></button>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </div>
  );
}
