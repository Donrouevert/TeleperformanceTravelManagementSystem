let finishTimer:number|undefined;
let fadeTimer:number|undefined;

/** Called after the initial route or account screen commits; never runs during sign-in itself. */
export function completeReloadAnimation() {
 const screen=document.getElementById('reload-screen');
 if(!screen)return;
 const html=document.documentElement;
 if(html.dataset.reloading!=='true'){if(html.dataset.reloading!=='leaving')cancelReloadAnimation();return;}
 if(finishTimer!==undefined||fadeTimer!==undefined)return;
 const reduced=window.matchMedia?.('(prefers-reduced-motion: reduce)').matches??false;
 const started=Number(html.dataset.reloadStarted);
 const elapsed=Number.isFinite(started)?performance.now()-started:0;
 finishTimer=window.setTimeout(()=>{
  finishTimer=undefined;
  const root=document.getElementById('root');
  if(root){root.inert=true;root.setAttribute('aria-hidden','true');}
  html.dataset.reloading='leaving';
  fadeTimer=window.setTimeout(()=>{
   cancelReloadAnimation();
   const target=document.querySelector<HTMLElement>('main .module-transition,.auth-form-content h1');
   if(target){if(!target.hasAttribute('tabindex'))target.tabIndex=-1;target.focus({preventScroll:true});}
  },reduced?0:180);
 },reduced?0:Math.max(0,650-elapsed));
}

/** Errors must remain accessible rather than being hidden by the refresh overlay. */
export function cancelReloadAnimation() {
 if(finishTimer!==undefined)window.clearTimeout(finishTimer);
 if(fadeTimer!==undefined)window.clearTimeout(fadeTimer);
 finishTimer=undefined;fadeTimer=undefined;
 document.getElementById('reload-screen')?.remove();
 delete document.documentElement.dataset.reloading;
 delete document.documentElement.dataset.reloadStarted;
 const root=document.getElementById('root');
 if(root){root.inert=false;root.removeAttribute('aria-hidden');}
}
