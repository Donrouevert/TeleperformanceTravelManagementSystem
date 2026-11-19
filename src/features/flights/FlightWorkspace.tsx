import { lazy, Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Tabs } from '@base-ui/react/tabs';
import { Activity, PlaneTakeoff } from 'lucide-react';
import { Loading, PageTitle } from '../../components/ui';
import { modules } from '../../lib/modules';
import {useAuth} from '../../contexts/AuthContext';
import { FlightSearch } from './FlightSearch';
import './flight-workspace.css';

const LiveStatus = lazy(modules.status);

export function FlightWorkspace() {
  const {user}=useAuth();
  const [params, setParams] = useSearchParams();
  const view = params.get('view') === 'status' ? 'status' : 'search';
  const [visited, setVisited] = useState({ search: view === 'search', status: view === 'status' });
  useEffect(() => { setVisited(old => old[view] ? old : { ...old, [view]: true }); }, [view]);
  return <div className="flight-workspace">
    <PageTitle eyebrow="PLAN YOUR NEXT JOURNEY" title="Find a flight" description="Plan your next journey or check a flight’s live status, all in one place."/>
    <Tabs.Root value={view} onValueChange={value => {
      const next = new URLSearchParams(params);
      if (value === 'status') next.set('view', 'status'); else next.delete('view');
      setParams(next, { preventScrollReset: true });
    }}>
      <div className="flight-tool-bar"><Tabs.List activateOnFocus className="flight-tool-tabs" aria-label="Flight tools">
        <Tabs.Tab value="search"><PlaneTakeoff size={17}/><span>Find flights</span></Tabs.Tab>
        <Tabs.Tab value="status"><Activity size={17}/><span>Live flight status</span></Tabs.Tab>
      </Tabs.List><span className="flight-tool-note">Your journey, from planning to arrival</span></div>
      <Tabs.Panel value="search" keepMounted className="flight-tool-panel">{(visited.search || view === 'search') && <FlightSearch embedded canRequest={user.role==='REQUESTOR'}/>}</Tabs.Panel>
      <Tabs.Panel value="status" keepMounted className="flight-tool-panel">{(visited.status || view === 'status') && <Suspense fallback={<Loading layout="status" label="Opening flight status"/>}><LiveStatus/></Suspense>}</Tabs.Panel>
    </Tabs.Root>
  </div>;
}
