
import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
}

export const Button: React.FC<ButtonProps> = ({ 
  children, 
  variant = 'primary', 
  size = 'md', 
  className = '', 
  ...props 
}) => {
  const baseStyles = 'inline-flex items-center justify-center font-bold transition-all duration-300 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed rounded-3xl active:scale-95';
  
  const variants = {
    primary: 'bg-black text-white hover:bg-neutral-800 shadow-lg shadow-black/5',
    secondary: 'bg-neutral-100 text-black hover:bg-neutral-200',
    outline: 'bg-transparent text-black border-2 border-neutral-100 hover:border-black',
    ghost: 'bg-transparent text-black hover:bg-neutral-50',
  };

  const sizes = {
    sm: 'px-4 py-2 text-xs',
    md: 'px-6 py-2.5 text-sm',
    lg: 'px-8 py-3 text-base',
  };

  return (
    <button 
      className={`${baseStyles} ${variants[variant]} ${sizes[size]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
};
