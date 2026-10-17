// Mostrado de imediato ao tocar num link, enquanto o servidor prepara a página.
export default function Loading() {
  return (
    <main className="screen" aria-busy="true" aria-label="A carregar">
      <div className="skel" style={{ width: "55%", height: 36, borderRadius: 12 }} />
      <div className="skel" style={{ height: 48, borderRadius: 16 }} />
      <div className="skel" style={{ height: 120, borderRadius: 24 }} />
      <div className="cards">
        <div className="skel" style={{ height: 92, borderRadius: 20 }} />
        <div className="skel" style={{ height: 92, borderRadius: 20 }} />
        <div className="skel" style={{ height: 92, borderRadius: 20 }} />
      </div>
    </main>
  );
}
