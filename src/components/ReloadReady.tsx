import { useEffect } from 'react';
import { completeReloadAnimation } from '../lib/reloadAnimation';
export function ReloadReady() { useEffect(()=>{completeReloadAnimation();},[]);return null; }
