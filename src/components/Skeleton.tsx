export type SkeletonLayout = 'dashboard' | 'table' | 'detail' | 'flights' | 'form' | 'status';

function Line({wide=false}:{wide?:boolean}) {
  return <span className={`skeleton-line${wide?' skeleton-line-wide':''}`}/>;
}
function TableRows({rows}:{rows:number}) {
  return <div className="skeleton-table">{Array.from({length:rows},(_,i)=><div className="skeleton-row" key={i}><div><Line wide/><Line/></div><Line wide/><Line/><span className="skeleton-pill"/></div>)}</div>;
}

/** Decoration is hidden from AT; one status announces loading without fake controls. */
export function Skeleton({layout='table',fullPage=false,rows=5,label='Loading travel records'}:{layout?:SkeletonLayout;fullPage?:boolean;rows?:number;label?:string}) {
  return <div className={`skeleton skeleton-${layout}${fullPage?' skeleton-full-page':''}`} role="status" aria-live="polite" aria-busy="true" aria-label={label}>
    <span className="sr-only">{label}…</span>
    <div aria-hidden="true">
      {fullPage&&<div className="skeleton-heading"><Line/><span className="skeleton-title"/><Line wide/></div>}
      {(layout==='dashboard')&&<div className="skeleton-metrics">{[0,1,2].map(i=><div className="skeleton-surface skeleton-metric" key={i}><Line/><span className="skeleton-number"/><Line wide/></div>)}</div>}
      {layout==='detail'||layout==='form'?<div className={`skeleton-detail-grid ${layout==='form'?'skeleton-form-grid':''}`}><div className="skeleton-detail-sections">{[0,1,2].map(i=><div className="skeleton-surface skeleton-section" key={i}><Line wide/><div className="skeleton-fields">{[0,1,2,3].map(j=><div key={j}><Line/><span className="skeleton-input"/></div>)}</div></div>)}</div><div className="skeleton-surface skeleton-section"><Line wide/><Line/><span className="skeleton-input"/><span className="skeleton-input"/></div></div>
      :layout==='flights'||layout==='status'?<div className="skeleton-flight-list">{Array.from({length:layout==='status'?1:3},(_,i)=><div className="skeleton-surface skeleton-flight" key={i}><Line/><div className="skeleton-route"><span className="skeleton-number"/><Line wide/><span className="skeleton-number"/></div><Line wide/><Line/></div>)}</div>
      :<div className="skeleton-surface"><div className="skeleton-toolbar"><Line wide/><span className="skeleton-pill"/></div><TableRows rows={rows}/></div>}
    </div>
  </div>;
}

export function WorkspaceSkeleton() {
 return <div className="workspace-skeleton"><aside className="workspace-skeleton-sidebar" aria-hidden="true"><img src="/brand/teleperformance-wordmark.svg" alt="" width="128" height="28"/>{[0,1,2,3,4].map(i=><span className="skeleton-input" key={i}/>)}</aside><div className="workspace-skeleton-body"><header><img src="/brand/teleperformance-wordmark.svg" alt="Teleperformance" width="112" height="24"/><span className="skeleton-pill" aria-hidden="true"/></header><div className="workspace-skeleton-content"><Skeleton layout="dashboard" fullPage label="Opening your travel workspace"/></div></div></div>;
}
