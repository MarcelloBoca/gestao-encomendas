/** Terminar sessão: o caminho /sair apaga o cookie e volta à entrada. */
export default function LogoutButton() {
  return (
    <a href="/sair" className="btn">
      Terminar sessão
    </a>
  );
}
