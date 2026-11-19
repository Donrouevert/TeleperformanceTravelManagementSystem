import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { repository } from '../db/repositories';
import { useAuth } from '../contexts/AuthContext';
import { useSocket } from '../contexts/SocketContext';
import { displayName, displayRequestNames } from '../lib/identity';
import type { TravelRequest } from '../types/travel';
export const useRequests = () => {const {user}=useAuth();return useQuery({ queryKey: ['requests',user.authId??user.employeeId,user.role], queryFn: async () => (await repository.listRequests()).map(displayRequestNames).filter(r=>user.role==='REQUESTOR'?r.requestor.employeeId===user.employeeId:user.role==='MANAGER'?r.requestor.approvingManagerId===user.employeeId&&r.status!=='PENDING_ADMIN':true) });};
export const useFlights = () => useQuery({ queryKey: ['flights'], queryFn: () => repository.listFlights() });
export const useEvents = () => useQuery({ queryKey: ['events'], queryFn: async () => (await repository.listEvents()).map(event=>({...event,message:displayName(event.message)})) });
export function useTravelMutation<T, R>(fn: (input: T) => Promise<R>, message: string, optimistic?: (old: TravelRequest[], input: T) => TravelRequest[]) {
  const query = useQueryClient(), socket = useSocket();
  return useMutation({ mutationFn: fn,
    onMutate: async input => { await query.cancelQueries({queryKey:['requests']});const previous=query.getQueriesData<TravelRequest[]>({queryKey:['requests']});if(optimistic)query.setQueriesData<TravelRequest[]>({queryKey:['requests']},old=>old?optimistic(old,input):old);return {previous}; },
    onError: (error, _input, context) => { context?.previous.forEach(([key,data])=>query.setQueryData(key,data)); toast.error(error.message); },
    onSuccess: () => { toast.success(message); socket.broadcast(message); },
    onSettled: async () => { await Promise.all([query.invalidateQueries({ queryKey: ['requests'] }), query.invalidateQueries({ queryKey: ['flights'] }), query.invalidateQueries({ queryKey: ['events'] })]); },
  });
}
