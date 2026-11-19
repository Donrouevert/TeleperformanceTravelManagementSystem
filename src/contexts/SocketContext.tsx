import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { toast } from 'sonner';
const SocketContext = createContext({ connected: false, mode: 'Local session', broadcast: (_message: string) => {} });
export function SocketProvider({ children }: { children: ReactNode }) {
  const query = useQueryClient(), channel = useRef<BroadcastChannel | null>(null);
  const [mode, setMode] = useState('Local session');
  useEffect(() => {
    if(supabase){
      setMode('Connecting…');
      const pending=new Set<string>();let refresh:ReturnType<typeof setTimeout>|undefined;
      const remote=supabase.channel('travel-workspace').on('postgres_changes',{event:'*',schema:'public'},({table})=>{
        const keys=table==='travel_events'?['events']:['flight_schedules','flight_cabins'].includes(table)?['flights']:['travel_requests','bookings','booking_legs'].includes(table)?['requests']:[];
        keys.forEach(key=>pending.add(key));
        // Coalesce transaction bursts without discarding cached records or refetching Aviationstack.
        if(pending.size&&!refresh)refresh=setTimeout(()=>{pending.forEach(key=>{void query.invalidateQueries({queryKey:[key]});});pending.clear();refresh=undefined;},80);
      }).subscribe(status=>setMode(status==='SUBSCRIBED'?'Cloud sync':status==='CHANNEL_ERROR'?'Sync unavailable':'Connecting…'));
      return()=>{clearTimeout(refresh);void supabase!.removeChannel(remote);};
    }

    const refreshRecords=()=>{['requests','flights','events'].forEach(key=>{void query.invalidateQueries({queryKey:[key]});});};
    const receive = (message: unknown) => { if (typeof message !== 'object' || !message || !('message' in message) || typeof message.message !== 'string') return; refreshRecords(); toast.success(message.message); };
    try { channel.current = new BroadcastChannel('teleperformance-tms-realtime'); channel.current.onmessage = e => receive(e.data); setMode('Live sync'); } catch { setMode('Storage sync'); }
    const storage = (e: StorageEvent) => { if (e.key === 'teleperformance-tms-realtime' && e.newValue) try { receive(JSON.parse(e.newValue)); } catch { /* Ignore unrelated storage. */ } };
    window.addEventListener('storage', storage);
    return () => { channel.current?.close(); channel.current = null; window.removeEventListener('storage', storage); };
  }, [query]);
  const broadcast = (message: string) => { const event = { message, id: crypto.randomUUID() }; if (channel.current) channel.current.postMessage(event); else try { localStorage.setItem('teleperformance-tms-realtime', JSON.stringify(event)); } catch { setMode('Local session'); } };
  return <SocketContext.Provider value={{ connected: ['Cloud sync','Live sync','Storage sync'].includes(mode), mode, broadcast }}>{children}</SocketContext.Provider>;
}
export const useSocket = () => useContext(SocketContext);
