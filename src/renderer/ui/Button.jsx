import useLoadingGate from '../hooks/useLoadingGate.js';

export default function Button({
  variant = 'ghost',
  size,
  loading = false,
  loadingLabel,
  className = '',
  disabled,
  type = 'button',
  children,
  ...props
}) {
  const gate = useLoadingGate(loading);
  return (
    <button
      type={type}
      className={['btn', `btn-${variant}`, size === 'sm' && 'btn-sm', className]
        .filter(Boolean)
        .join(' ')}
      disabled={disabled ?? loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {gate.show && <span className="btn-spinner" aria-hidden="true" />}
      {gate.show && loadingLabel !== undefined ? loadingLabel : children}
    </button>
  );
}
