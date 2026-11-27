'use client';
import { useId, useMemo, useRef, useState } from 'react';
import { Check, Pencil, Plus, Trash2, X } from 'lucide-react';
import type { Column, ModuleConfig, Row } from '@/lib/types';
import { lineAmount } from '@/lib/calc';
import { inr } from '@/lib/format';
import { catalogFor, searchCatalog } from '@/lib/catalog';
import { FieldLabel } from './ui';

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
  /** keeps the box ids unique when two lists are on one page */
  idPrefix?: string;
}

function Box({ c, value, error, listId, onChange, onEnter, inputRef, id }: { c: Column; value: string; error?: string; listId?: string; onChange: (v: string) => void; onEnter: () => void; inputRef?: React.RefObject<HTMLInputElement>; id: string }) {
  const cls = `input ${error ? 'border-red-500 ring-2 ring-red-100' : ''}`;
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

/** Item name box with a suggestion list under it: typing "fri" offers Fridge / refrigerator…, "पलंग" offers beds. */
function ItemSearch({ id, value, error, placeholder, kind, onChange, onPicked, onEnter, inputRef }: {
  id: string; value: string; error?: string; placeholder?: string; kind: 'services' | 'household';
  onChange: (v: string) => void; onPicked: () => void; onEnter: () => void; inputRef?: React.RefObject<HTMLInputElement>;
}) {
  const [show, setShow] = useState(false);
  const [active, setActive] = useState(0);
  const listId = useId();
  const results = useMemo(() => searchCatalog(catalogFor(kind), value, 8), [value, kind]);
  const exact = results.length === 1 && results[0].name.toLowerCase() === value.trim().toLowerCase();
  const visible = show && results.length > 0 && !exact;
  const pick = (name: string) => { onChange(name); setShow(false); onPicked(); };
  return (
    <div className="relative">
      <input
        id={id} ref={inputRef} data-err={error ? '1' : undefined} className={`input ${error ? 'border-red-500 ring-2 ring-red-100' : ''}`}
        value={value} placeholder={placeholder} maxLength={200} autoComplete="off"
        role="combobox" aria-expanded={visible} aria-controls={listId} aria-autocomplete="list"
        onChange={(e) => { onChange(e.target.value); setShow(true); setActive(0); }}
        onFocus={(e) => {
          setShow(true);
          // on a phone, bring the box near the top so the list is not hidden behind the keyboard or the bottom menu
          const el = e.currentTarget;
          if (window.innerWidth < 1024) setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'center' }), 250);
        }}
        onBlur={() => setTimeout(() => setShow(false), 150)}
        onKeyDown={(e) => {
          if (visible && e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => (a + 1) % results.length); }
          else if (visible && e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => (a - 1 + results.length) % results.length); }
          else if (e.key === 'Escape') setShow(false);
          else if (e.key === 'Enter') { e.preventDefault(); if (visible) pick(results[active].name); else onEnter(); }
        }}
      />
      {visible && (
        <ul id={listId} role="listbox" className="absolute left-0 right-0 top-full z-40 mt-1 max-h-72 overflow-y-auto rounded-xl border border-slate-300 bg-white py-1 shadow-xl">
          {results.map((it, i) => (
            <li key={it.name} role="option" aria-selected={i === active}>
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => pick(it.name)} onMouseEnter={() => setActive(i)}
                className={`flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left text-sm ${i === active ? 'bg-orange-50 text-orange-900' : 'text-slate-800'}`}>
                <span className="min-w-0 truncate font-medium">{it.name}</span>
                {it.cft ? <span className="shrink-0 text-[11px] text-slate-400">{it.cft} CFT</span> : null}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function ItemsEditor(p: ItemsEditorProps) {
  const { cfg } = p;
  const cols = cfg.columns ?? [];
  const first = useRef<HTMLInputElement>(null);
  const add = () => { p.onAdd(); setTimeout(() => first.current?.focus(), 30); };
  const isEditing = p.editing !== null;
  const pre = p.idPrefix ?? 'entry-';

  return (
    <div className="space-y-4">
      {/* ---- entry boxes ---- */}
      <div className={`rounded-2xl border-2 p-3 ${isEditing ? 'border-amber-400 bg-amber-50/60' : 'border-orange-200 bg-orange-50/50'}`}>
        <p className="mb-2 text-sm font-bold text-orange-800">
          {isEditing ? `Changing item ${p.editing! + 1}` : 'New item'}
        </p>
        {p.chips.length > 0 && !isEditing && (
          <div className="no-scrollbar -mx-1 mb-2 flex gap-2 overflow-x-auto px-1 pb-1">
            {p.chips.map((c) => <button key={c} type="button" onClick={() => { p.onChip(c); setTimeout(() => document.getElementById(pre + (cols[1] ? cols[1].key : 'description'))?.focus(), 30); }} className="whitespace-nowrap rounded-full border border-orange-300 bg-white px-3 py-1.5 text-xs font-medium text-orange-800 active:bg-orange-100">+ {c}</button>)}
          </div>
        )}
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-6">
          {cols.map((c, ci) => (
            <div key={c.key} className={ci === 0 || c.wide ? 'col-span-2' : ''}>
              <FieldLabel text={c.label} required={c.required} htmlFor={pre + c.key} />
              {ci === 0 && cfg.suggest ? (
                <ItemSearch id={pre + c.key} value={p.entry[c.key] ?? ''} error={p.entryErrors[c.key]} placeholder={c.placeholder} kind={cfg.suggest}
                  onChange={(v) => p.onEntry(c.key, v)} onEnter={add} inputRef={first}
                  onPicked={() => setTimeout(() => document.getElementById(pre + (cols[1]?.key ?? c.key))?.focus(), 20)} />
              ) : (
                <Box id={pre + c.key} c={c} value={p.entry[c.key] ?? ''} error={p.entryErrors[c.key]} listId={ci === 0 ? p.listId : undefined} onChange={(v) => p.onEntry(c.key, v)} onEnter={add} inputRef={ci === 0 ? first : undefined} />
              )}
              {p.entryErrors[c.key] && <p className="mt-1 text-xs font-medium text-red-600">{p.entryErrors[c.key]}</p>}
            </div>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
          {cfg.money && <span className="mr-auto text-sm font-semibold text-slate-700">Amount: {inr(lineAmount(p.entry))}</span>}
          {isEditing && <button type="button" className="btn-ghost min-h-[40px]" onClick={p.onCancelEdit}><X size={16} />Cancel</button>}
          <button type="button" onClick={add} className="btn min-h-[42px] bg-orange-500 px-5 text-white hover:bg-orange-600">
            {isEditing ? <Check size={18} /> : <Plus size={18} />}{isEditing ? 'Update item' : 'Add item'}
          </button>
        </div>
      </div>

      {/* ---- the list ---- */}
      <div>
        <p className="mb-2 text-sm font-semibold text-slate-700">Added items ({p.items.length})</p>
        {p.items.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-300 p-4 text-center text-sm text-slate-500">No items yet. Fill the boxes above and press <b>Add item</b>.</p>
        ) : (
          <ol className="divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-300 bg-white">
            {p.items.map((r, i) => {
              const errs = cols.map((c) => p.errors[`item-${i}-${c.key}`] && `${c.label}: ${p.errors[`item-${i}-${c.key}`]}`).filter(Boolean);
              const details = cols.slice(1).filter((c) => (r[c.key] ?? '').trim()).map((c) => `${c.label}: ${c.key === 'rate' || c.key === 'value' ? inr(Number(r[c.key]) || 0) : c.key === 'gst' ? r[c.key] + '%' : r[c.key]}`);
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
