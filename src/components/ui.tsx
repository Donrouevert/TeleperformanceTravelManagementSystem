import { cloneElement, isValidElement, useId, type ReactNode, type InputHTMLAttributes, type SelectHTMLAttributes } from 'react';
import { ArrowRight, Leaf, SearchX, X } from 'lucide-react';
import { Skeleton, type SkeletonLayout } from './Skeleton';
import { Dialog } from '@base-ui/react/dialog';
import { statusLabel } from '../lib/format';
export function Badge({ status }: { status: string }) { return <span className={`badge status-${status.toLowerCase()}`}><span className="badge-dot"/>{statusLabel(status)}</span>; }
export function EcoBadge() { return <span className="eco-badge"><Leaf size={12}/> Eco-Choice</span>; }
export function PageTitle({ eyebrow, title, description, action }: { eyebrow?: string; title: string; description: string; action?: ReactNode }) { return <div className="page-title"><div><div className="eyebrow">{eyebrow ?? 'TP TRAVEL'}</div><h1>{title}</h1><p>{description}</p></div>{action}</div>; }
export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  const generatedId = useId();
  if (isValidElement<{id?: string; required?: boolean; readOnly?: boolean}>(children) && ['input','select','textarea'].includes(String(children.type))) {
    const id = children.props.id || generatedId;
    const required = children.props.required && !children.props.readOnly;
    return <div className="field"><label htmlFor={id}>{label}{required && <span className="required-mark" aria-hidden="true"> *</span>}</label>{cloneElement(children,{id})}{hint && <small>{hint}</small>}</div>;
  }
  return <div className="field"><span>{label}</span>{children}{hint && <small>{hint}</small>}</div>;
}
export function Input({ label, hint, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string }) {
  const textRequired = props.required && !props.readOnly && (!props.type || ['text','tel'].includes(props.type));
  return <Field label={label} hint={hint}><input pattern={textRequired ? '.*\\S.*' : undefined} {...props}/></Field>;
}
export function Select({ label, options, ...props }: SelectHTMLAttributes<HTMLSelectElement> & { label: string; options: string[] | { value: string; label: string }[] }) { return <Field label={label}><select {...props}>{options.map(o => <option key={typeof o === 'string' ? o : o.value} value={typeof o === 'string' ? o : o.value}>{typeof o === 'string' ? o : o.label}</option>)}</select></Field>; }
export function Check({ label, checked, onChange, disabled }: { label: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) { return <label className="check"><input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} disabled={disabled}/><span>{label}</span></label>; }
export function Empty({ title = 'No results found', description = 'Try adjusting your filters.' }: { title?: string; description?: string }) { return <div className="empty"><SearchX size={30}/><h3>{title}</h3><p>{description}</p></div>; }
export function Loading({layout='table',fullPage=false,label}:{layout?:SkeletonLayout;fullPage?:boolean;label?:string}) { return <Skeleton layout={layout} fullPage={fullPage} label={label}/>; }
export function ErrorState({ error, retry }: { error: Error; retry: () => void }) { return <div role="alert" className="empty"><h3>We couldn’t load this page</h3><p>{error.message}</p><button className="btn" onClick={retry}>Try again <ArrowRight size={15}/></button></div>; }
export function Modal({ open, onOpenChange, title, description, children }: { open: boolean; onOpenChange: (v: boolean) => void; title: string; description: string; children: ReactNode }) { return <Dialog.Root open={open} onOpenChange={onOpenChange}><Dialog.Portal><Dialog.Backdrop className="modal-backdrop"/><Dialog.Popup className="modal"><div className="modal-head"><div><Dialog.Title>{title}</Dialog.Title><Dialog.Description>{description}</Dialog.Description></div><Dialog.Close className="icon-btn" aria-label="Close dialog"><X size={20}/></Dialog.Close></div>{children}</Dialog.Popup></Dialog.Portal></Dialog.Root>; }
