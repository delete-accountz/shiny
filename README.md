# Shiny Store

Loja digital Shiny Store em Next.js 16 + TypeScript.

## Estado atual

O projeto foi validado nas etapas P0, P1 e P2-A, incluindo regressões, TypeScript e build. Esta preparação adiciona higiene para GitHub, documentação de ambiente e avaliação para Vercel.

**Importante:** o checkout financeiro e as rotas que dependem de Storage/*.json continuam **não aprovados para produção na Vercel**. O motivo é arquitetural: o estado atual depende de filesystem local e locks/memória por processo. Vercel Functions executam em ambiente distribuído e o estado durável deve viver em um serviço compartilhado. Não remover o bloqueio SHINY_STORAGE_MODE=single-process para fazer um deploy passar.

## Rodar localmente

1. Copie `.env.example` para `.env.local`.
2. Preencha somente as variáveis necessárias. Nunca publique `.env.local`.
3. Execute `npm run dev`.
4. Abra `http://localhost:3000`.

**Não execute `npm install` nesta etapa de preparação.** O projeto não possui lockfile raiz e a criação de lockfile deve ser uma decisão explícita antes da produção.

## Variáveis de ambiente

Server-only:
- `SHINY_STORAGE_MODE`
- `ADMIN_USER`
- `ADMIN_ACCESS_KEY`
- `ADMIN_ACCESS_LEVEL`
- `PROMISSE_API_BASE_URL`
- `PROMISSE_API_KEY`
- `PROMISSE_WEBHOOK_SECRET`
- `PROMISSE_WEBHOOK_URL`
- `HCAPTCHA_SECRET_KEY`
- `TRUSTED_PROXY`
- `TRUSTED_PROXY_HEADER`

Client-safe:
- `NEXT_PUBLIC_HCAPTCHA_SITE_KEY`

`NODE_ENV` é controlado pelo runtime/Next.js e não deve ser usado como secret.
Secrets nunca podem receber prefixo `NEXT_PUBLIC_`.

## Rotas relevantes

- `/` — loja.
- `/Vault` — área administrativa protegida.
- `/api/csrf` — emissão de CSRF.
- `/api/auth/login` e `/api/auth/register` — autenticação de usuário.
- `/api/admin/login` — autenticação administrativa.
- `/api/checkout` — checkout server-side; depende do Storage local e de Promisse.
- `/api/payment/:id` — consulta server-side de transação.
- `/api/webhooks/promisse` — webhook Promisse com HMAC sobre corpo bruto.
- `/api/admin/orders/reconcile` — reconciliação administrativa.

## Segurança

- P0, P1 e P2-A permanecem preservados.
- `proxy.ts` exige `SHINY_STORAGE_MODE=single-process` em produção.
- CSRF é limitado, expirável e de uso único.
- Sessões e revogações usam estado local.
- Promisse usa chave somente server-side.
- hCaptcha usa somente a site key no client; o secret é server-only.
- Webhook Promisse valida HMAC antes de processar/registrar o evento.
- Não foram executados cobrança real, webhook real ou deploy real.

## GitHub

O diretório atual não é um repositório Git local. Antes de criar ou conectar um repositório:
- valide os arquivos ignorados;
- faça scan local de secrets;
- confirme que Storage/, Logs/, .next/, node_modules/ e .env.local não serão versionados;
- habilite Secret Scanning e Push Protection;
- configure Dependabot;
- proteja a branch de produção e exija revisão.

Nunca use `git add`, `git commit` ou `git push` como parte desta etapa.

## Vercel

Next.js App Router e `proxy.ts` são compatíveis com o runtime Node.js da Vercel, mas a aplicação financeira atual não é compatível com persistência serverless usando JSON local.

A Vercel deve ser tratada como camada de execução, não como banco de dados. Para liberar checkout, usuários, estoque, cupons, eventos Promisse e sessões em produção será necessário armazenamento transacional/shared state oficialmente compatível.

Consulte `docs/DEPLOY_VERCEL.md`.

## Validação

Com o ambiente local configurado, a sequência esperada é:
- `npm run typecheck`
- `npm run build`
- `node tests/p0-regression.cjs`
- `node tests/p1-regression.cjs`
- `node tests/p2a-regression.cjs`
- `npm audit --audit-level=high` — atualmente bloqueado por ausência de lockfile.

Nenhum desses testes autoriza cobrança real ou webhook real.

## Documentação

- `docs/DEPLOY_GITHUB.md`
- `docs/DEPLOY_VERCEL.md`
- `docs/SECURITY.md`
- `docs/ENVIRONMENT.md`
- `docs/ARCHITECTURE_LIMITATIONS.md`
- `docs/PROMISSE_INTEGRATION.md`
