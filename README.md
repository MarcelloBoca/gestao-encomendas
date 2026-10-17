# Sola.chic: Sistema de Gestão de Loja

App web instalável (iPhone e Android) para a Sola.chic aceitar encomendas, cobrar em parcelas e entregar a mercadoria quando chega e está paga.

## O que faz

- Encomendas com número por loja (ex.: SOL-0042), cliente sugerida pelo telefone e artigos escritos à mão (descrição, quantidade e preço), sem catálogo.
- Pagamentos em parcelas (Numerário, M-Pesa, e-Mola, mKesh, Transferência, Outro), estornos e reembolsos, sem apagar nada.
- Chegada da mercadoria marcada à mão, no detalhe da encomenda ou várias de uma vez em "Mercadoria chegou".
- Levantamento só com a encomenda paga e com a mercadoria na loja; anulação de levantamento com motivo.
- Avisos e comprovativos por WhatsApp (abre o WhatsApp com a mensagem escrita).
- Relatórios: recebido por dia ou semana, por método, fecho de caixa, dívidas por antiguidade, prontas por levantar, correções.
- Login Google, vários utilizadores e lojas; o proprietário é o único que remove utilizadores.

## Tecnologia

- Next.js 16 (App Router, server actions) no Vercel.
- Firebase Authentication (Google) e Firestore. Todas as leituras e escritas passam pelo servidor com o Firebase Admin; as regras do Firestore recusam acesso direto.
- Encomendas, pagamentos e levantamentos são gravados em transações, com uma chave única por ação para não duplicar com toques repetidos.
- Valores guardados em centavos (inteiros).

## Variáveis de ambiente (Vercel)

| Variável | Onde encontrar |
| --- | --- |
| `NEXT_PUBLIC_FIREBASE_API_KEY` | Firebase › Definições do projeto › App Web |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | idem (`<projeto>.firebaseapp.com`) |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | idem |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | idem |
| `FIREBASE_CLIENT_EMAIL` | ficheiro JSON da conta de serviço (`client_email`) |
| `FIREBASE_PRIVATE_KEY` | ficheiro JSON da conta de serviço (`private_key`), colado tal como está |

As duas últimas são segredos e são as únicas obrigatórias: só no Vercel, nunca no código. A configuração pública do Firebase (`NEXT_PUBLIC_*`) já tem valores por omissão no código para o projeto `gestao-encomendas-2a060`.

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
