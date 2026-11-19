import { Suspense, useLayoutEffect, useRef, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { ReloadReady } from '../ReloadReady';
import { Skeleton } from '../Skeleton';
import { skeletonForPath } from '../../lib/modules';

/** Animate the page content while leaving the shell and session mounted. */
export function ModuleTransition({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const content=useRef<HTMLDivElement>(null),previous=useRef(pathname);
  useLayoutEffect(() => {
    if(previous.current===pathname)return;
    previous.current=pathname;
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    content.current?.focus({preventScroll:true});
  }, [pathname]);
  return <div ref={content} className="module-transition" key={pathname} tabIndex={-1}>
    <Suspense fallback={<Skeleton layout={skeletonForPath(pathname)} fullPage label="Loading this module"/>}><ModuleContent key={pathname}>{children}</ModuleContent></Suspense>
  </div>;
}

/** Layout effects wait for a suspended subtree to commit, so the entrance cannot finish behind its skeleton. */
function ModuleContent({children}:{children:ReactNode}){
 const content=useRef<HTMLDivElement>(null);
 useLayoutEffect(()=>{content.current?.classList.add('is-ready');},[]);
 return <div ref={content} className="module-content">{children}<ReloadReady/></div>;
}
