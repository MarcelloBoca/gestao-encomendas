# Gestão de Encomendas

App web instalável (iPhone e Android) para lojas que aceitam encomendas, cobram em parcelas e entregam a mercadoria quando chega e está paga. Construída a partir do PRD v2.

## O que faz

- Encomendas com número por loja (ex.: MAP-0042), cliente sugerido pelo telefone, desconto e data prevista de chegada.
- Pagamentos em parcelas (Numerário, M-Pesa, e-Mola, mKesh, Transferência, Outro), estornos e reembolsos, sem apagar nada.
- Receção de mercadoria com reserva automática para as encomendas mais antigas; ajustes e transferências entre lojas.
- Levantamento só com a encomenda paga e pronta; anulação de levantamento com motivo.
- Avisos e comprovativos por WhatsApp (abre o WhatsApp com a mensagem escrita).
- Relatórios: painel por período, fecho de caixa, dívidas por antiguidade, prontas por levantar, artigos a pedir, correções.
- Login Google, vários utilizadores e lojas; o proprietário é o único que remove utilizadores.

## Tecnologia

- Next.js 16 (App Router, server actions) no Vercel.
- Firebase Authentication (Google) e Firestore. Todas as leituras e escritas passam pelo servidor com o Firebase Admin; as regras do Firestore recusam acesso direto.
- Pagamentos, reservas e movimentos de stock são gravados em transações, com uma chave única por ação para não duplicar com toques repetidos.
- Valores guardados em centavos (inteiros).

## Variáveis de ambiente (Vercel)

| Variável | Onde encontrar |
| --- | --- |
| `NEXT_PUBLIC_FIREBASE_API_KEY` | Firebase › Definições do projeto › App Web |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | idem (`<projeto>.firebaseapp.com`) |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | idem |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | idem |
| `FIREBASE_PROJECT_ID` | ficheiro JSON da conta de serviço (`project_id`) |
| `FIREBASE_CLIENT_EMAIL` | ficheiro JSON da conta de serviço (`client_email`) |
| `FIREBASE_PRIVATE_KEY` | ficheiro JSON da conta de serviço (`private_key`), colado tal como está |

As três últimas são segredos: só no Vercel, nunca no código.

## Configuração no Firebase

1. Authentication › Sign-in method: ativar Google.
2. Authentication › Settings › Authorized domains: acrescentar o domínio do Vercel (ex.: `gestao-encomendas.vercel.app`).
3. Firestore: criar a base de dados e publicar as regras de `firestore.rules`.

## Desenvolvimento

```bash
npm install
npm test        # regras de negócio (reservas, saldos, valores, datas)
npm run dev
```

O build (`npm run build`) corre os testes antes de compilar.
