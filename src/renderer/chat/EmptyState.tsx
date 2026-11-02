interface EmptyStateProps {
  connected: boolean;
  connError: string | null;
}

export default function EmptyState({ connected, connError }: EmptyStateProps) {
  return (
    <div className="empty-state">
      <div className="arc-reactor" />
      <div>
        <div className="greeting">IA&#8209;companion&#8209;GS</div>
        <div className="greeting-sub">
          {connected
            ? 'SISTEMA OPERATIVO\nEN ESPERA DE INSTRUCCIONES'
            : connError
              ? `SIN CONEXION\n${connError}`
              : 'SISTEMA EN ESPERA\nCONFIGURE CONEXION EN AJUSTES'}
        </div>
      </div>
    </div>
  );
}
