export default function Loading() {
  return (
    <main className="screen dark-page" aria-busy="true" aria-label="A carregar" style={{ gap: 16 }}>
      <div className="skel dark" style={{ width: "50%", height: 36, borderRadius: 12 }} />
      <div className="skel dark" style={{ height: 48, borderRadius: 999 }} />
      <div className="skel dark" style={{ height: 260, borderRadius: 24 }} />
      <div className="dark-grid">
        <div className="skel dark" style={{ height: 220, borderRadius: 22 }} />
        <div className="skel dark" style={{ height: 220, borderRadius: 22 }} />
      </div>
    </main>
  );
}
