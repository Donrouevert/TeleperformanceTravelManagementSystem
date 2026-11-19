import type {ReactNode} from 'react';
import {Navigate} from 'react-router-dom';
import {useAuth} from '../contexts/AuthContext';
import type {Role} from '../types/travel';
export function RoleGate({roles,children}:{roles:Role[];children:ReactNode}){const {user}=useAuth();return roles.includes(user.role)?children:<Navigate to="/dashboard" replace/>;}
