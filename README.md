# Sola.chic: Sistema de Gestão de Loja

App web instalável (iPhone e Android) para a Sola.chic aceitar encomendas, cobrar em parcelas e entregar a mercadoria quando chega e está paga.

## O que faz

- Encomendas com número por loja (ex.: SOL-0042), cliente sugerida pelo telefone e artigos escritos à mão (descrição, quantidade e preço), sem catálogo.
- Pagamentos em parcelas (Numerário, M-Pesa, e-Mola, mKesh, Transferência, Outro), estornos e reembolsos, sem apagar nada.
- Chegada da mercadoria marcada à mão, no detalhe da encomenda ou várias de uma vez em "Mercadoria chegou".
- Levantamento só com a encomenda paga e com a mercadoria na loja; anulação de levantamento com motivo.
- Avisos e comprovativos por WhatsApp (abre o WhatsApp com a mensagem escrita).
- Relatórios: recebido por dia ou semana, por método, fecho de caixa, dívidas por antiguidade, prontas por levantar, correções.
- Entrada com utilizador e palavra-passe. A administradora cria as contas em Definições, repõe palavras-passe e remove contas; cada pessoa escolhe a sua palavra-passe na primeira entrada.

## Tecnologia

- Next.js 16 (App Router, server actions) no Vercel.
- Firestore, sempre através do servidor com o Firebase Admin; as regras do Firestore recusam acesso direto.
- Palavras-passe guardadas com scrypt e sal aleatório; 5 tentativas erradas bloqueiam a conta durante 10 minutos. Sessão num cookie httpOnly assinado; mudar a palavra-passe termina as outras sessões.
- Encomendas, pagamentos e levantamentos são gravados em transações, com uma chave única por ação para não duplicar com toques repetidos.
- Valores guardados em centavos (inteiros).

## Variáveis de ambiente (Vercel)

| Variável | Para quê |
| --- | --- |
| `FIREBASE_CLIENT_EMAIL` | ficheiro JSON da conta de serviço (`client_email`) |
| `FIREBASE_PRIVATE_KEY` | ficheiro JSON da conta de serviço (`private_key`), colado tal como está |
| `SETUP_CODE` | código para criar a primeira conta (administradora) em `/primeiro-acesso`; deixa de servir depois disso |
| `SESSION_SECRET` | opcional; chave das sessões (por omissão é derivada da chave privada) |

Todas são segredos: só no Vercel, nunca no código.

## Primeiro acesso

1. No Firestore, criar a base de dados e publicar as regras de `firestore.rules`.
2. Definir `SETUP_CODE` no Vercel e fazer Redeploy.
3. Abrir `/primeiro-acesso`, escrever o código e criar a conta da administradora. Se já existir um negócio, a conta fica ligada a ele.
4. A administradora cria as outras contas em Definições › Contas.

## Desenvolvimento

```bash
npm install
npm test        # regras de negócio (saldos, valores, datas, palavras-passe)
npm run dev
```

O build (`npm run build`) corre os testes antes de compilar.
