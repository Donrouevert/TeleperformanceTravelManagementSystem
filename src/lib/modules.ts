import type { ComponentType } from 'react';
import type { SkeletonLayout } from '../components/Skeleton';

// Each loader is shared by React.lazy and link intent preloading. No API requests here.
function cachedModule(load:()=>Promise<{default:ComponentType}>) {
 let pending:ReturnType<typeof load>|undefined;
 return ()=>pending??=(load().catch(error=>{pending=undefined;throw error;}));
}
export const modules={
 dashboard:cachedModule(()=>import('../features/dashboard/RoleDashboard').then(m=>({default:m.RoleDashboard}))),
 flights:cachedModule(()=>import('../features/flights/FlightWorkspace').then(m=>({default:m.FlightWorkspace}))),
 revision:cachedModule(()=>import('../features/bookings/BookingWizard').then(m=>({default:m.RevisionPage}))),
 newRequest:cachedModule(()=>import('../features/bookings/BookingWizard').then(m=>({default:m.BookingWizard}))),
 bookings:cachedModule(()=>import('../features/bookings/Bookings').then(m=>({default:m.Bookings}))),
 detail:cachedModule(()=>import('../features/bookings/RequestDetail').then(m=>({default:m.RequestDetail}))),
 operations:cachedModule(()=>import('../features/admin/FlightAdmin').then(m=>({default:m.FlightAdmin}))),
 payments:cachedModule(()=>import('../features/payments/Payments').then(m=>({default:m.Payments}))),
 status:cachedModule(()=>import('../features/flights/FlightStatus').then(m=>({default:m.FlightStatus}))),
};
export function moduleForPath(path:string):keyof typeof modules {
 const pathname=path.split('?')[0];
 if(/^\/bookings\/[^/]+\/(edit|rebook)$/.test(pathname))return 'revision';
 if(pathname==='/bookings/new')return 'newRequest';
 if(pathname.startsWith('/bookings/'))return 'detail';
 const routes:Record<string,keyof typeof modules>={'/dashboard':'dashboard','/flights/search':'flights','/bookings':'bookings','/admin/flights':'operations','/payments':'payments','/flight-status':'status'};
 return routes[pathname]??'dashboard';
}
export function skeletonForPath(path:string):SkeletonLayout {
 return {dashboard:'dashboard',flights:'flights',newRequest:'form',revision:'form',bookings:'table',detail:'detail',operations:'table',payments:'dashboard',status:'status'}[moduleForPath(path)] as SkeletonLayout;
}
export function preloadModule(path:string) {
 // Failed speculation must not interrupt a link click; the normal loader can retry.
 void modules[moduleForPath(path)]().catch(()=>{});
}
