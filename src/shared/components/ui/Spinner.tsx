import React from 'react';
import { Loader2 } from 'lucide-react';

interface SpinnerProps {
  size?: number;
  className?: string;
}

/** 加载指示（统一 lucide Loader2 旋转） */
export const Spinner: React.FC<SpinnerProps> = ({ size = 20, className = '' }) => (
  <Loader2 size={size} className={`animate-spin text-neutral-400 ${className}`} />
);

export default Spinner;
