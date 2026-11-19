import { useId, type ReactNode } from 'react';
import { Select } from '@base-ui/react/select';
import { Check, ChevronDown, ListFilter } from 'lucide-react';

interface FlightSelectProps {
  label: string;
  value: string;
  options: { value: string; label: string; disabled?: boolean }[];
  onChange: (value: string) => void;
  sort?: boolean;
  icon?: ReactNode;
  destination?: boolean;
}

export function FlightSelect({ label, value, options, onChange, sort = false, icon, destination }: FlightSelectProps) {
  const id = useId();
  return <div className="field flight-select-field">
    <label id={id}>{label}</label>
    <Select.Root value={value} items={options} modal={false} onValueChange={next => { if (next !== null) onChange(next); }}>
      <Select.Trigger aria-labelledby={id} className="flight-select-trigger" data-flight-destination={destination || undefined}>
        {(icon || sort) && <span className="flight-select-leading">{icon || <ListFilter size={17}/>}</span>}
        <Select.Value className="flight-select-value"/>
        <Select.Icon className="flight-select-chevron"><ChevronDown size={15}/></Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Positioner className="flight-select-positioner" alignItemWithTrigger={false} side="bottom" align="start" sideOffset={8} collisionPadding={12}>
          <Select.Popup className="flight-select-menu">
            <Select.List className="flight-select-list">
              {options.map(option => <Select.Item key={option.value} value={option.value} label={option.label} disabled={option.disabled} className="flight-select-item">
                <Select.ItemText>{option.label}</Select.ItemText>
                <Select.ItemIndicator className="flight-select-check"><Check size={15}/></Select.ItemIndicator>
              </Select.Item>)}
            </Select.List>
          </Select.Popup>
        </Select.Positioner>
      </Select.Portal>
    </Select.Root>
  </div>;
}
