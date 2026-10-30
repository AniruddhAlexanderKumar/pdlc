import { createContext, useContext } from 'react';
export const DashboardDensity = createContext<'compact' | 'expanded'>('expanded');
export const useDashboardDensity = () => useContext(DashboardDensity);
