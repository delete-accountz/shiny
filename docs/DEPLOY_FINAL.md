# Shiny Store — Guia Final de Deploy

Data da preparação: 2026-10-08.

## Serviços

- GitHub: https://github.com/delete-accountz/shiny
- Vercel: https://vercel.com/delete-accountz/shiny-store
- Preview validado: https://shiny-store-41qucnyzt-delete-accountz.vercel.app
- Deploy inspect: https://vercel.com/delete-accountz/shiny-store/F7bkg4w1KDALfVJAGiHF6BFmSci6
- Alias de produção informado pelo Vercel: https://shiny-store-eight.vercel.app
- Neon: projeto `shiny-store-prod`, id `square-flower-70047569`, região `aws-sa-east-1`

## Neon

A branch principal contém as migrations 001–005. O comando idempotente de migração foi executado com a connection string obtida diretamente do Neon, sem exibir o segredo.

Validações executadas:
- migrations: PASS; nenhuma migration pendente.
- concorrência de estoque: PASS; duas conexões reais, uma reserva.
- concorrência de cupom: PASS; duas conexões reais, uma reserva.
- restore: PASS; snapshot `post-migration-history` foi restaurado para uma branch isolada, confirmada como ready, com 27 tabelas públicas e 5 migrations, e a branch temporária foi removida.
- snapshot manual disponível: `post-migration-history`, expiração 2026-10-15.

Backup automático:
- NÃO configurado.
- O Neon recusou a criação de schedule: `backup schedule creation is not enabled for this project`.
- A API atual do Neon exige plano pago para backup schedule.
- Não foi feito upgrade nem cobrança.

## Vercel

O projeto foi relinkado a `delete-accountz/shiny-store` e ao repositório GitHub.

Segredos configurados no Preview:
- DATABASE_URL: Secret, Neon `shiny-store`
- SESSION_HMAC_SECRET: Secret gerado aleatoriamente
- WEBHOOK_ENCRYPTION_KEY: Secret gerado aleatoriamente
- CRON_SECRET: Secret gerado aleatoriamente
- HCAPTCHA_SECRET_KEY: Secret de teste oficial do hCaptcha

Configurações do Preview:
- DATABASE_REQUIRED=true
- SHINY_STORAGE_MODE=database
- ADMIN_ACCESS_LEVEL=OWNER
- RECONCILIATION_AUTOMATION_ENABLED=true
- TRUSTED_PROXY=false
- TRUSTED_PROXY_HEADER=x-real-ip
- PROMISSE_API_BASE_URL=https://api.promisse.com.br
- NEXT_PUBLIC_HCAPTCHA_SITE_KEY: sitekey de teste oficial do hCaptcha

O build remoto passou:
- Next.js 16.3.8
- TypeScript PASS
- 29 páginas estáticas
- todas as rotas compiladas
- deploy Ready

Proteção:
- Deployment Protection do Vercel está ligada.

O Preview respondeu `503 production_configuration_incomplete`. Isso é esperado neste estado porque `ADMIN_USER` e `ADMIN_ACCESS_KEY` reais não foram definidos. O fail-closed está funcional.

## Cron

O arquivo de produção permanece com:
`*/5 * * * *`

O plano Hobby rejeita essa frequência. Para o Preview foi usado temporariamente um cron diário, e depois o `vercel.json` local foi restaurado para a configuração de produção de 5 minutos.

Para Production, usar um plano que aceite 5 minutos ou um scheduler externo autenticado chamando:
`POST/GET /Api/Internal/Reconciliation` conforme o contrato do projeto, com:
`Authorization: Bearer <CRON_SECRET>`

## HCaptcha

O Preview está configurado com o par oficial de teste do hCaptcha para permitir validação segura sem usar uma credencial real.

O par de teste não fornece proteção anti-bot real e NÃO deve ser promovido para Production.

Para Production:
1. criar/selecionar o sitekey real no Dashboard hCaptcha;
2. adicionar o hostname de produção ao allowlist;
3. colocar o sitekey em `NEXT_PUBLIC_HCAPTCHA_SITE_KEY`;
4. colocar o secret em `HCAPTCHA_SECRET_KEY`;
5. validar `/siteverify` com POST form-encoded.

## Gate financeiro

- Promisse NÃO configurado.
- PROMISSE_API_KEY não configurada.
- PROMISSE_WEBHOOK_SECRET não configurado.
- Nenhuma cobrança real executada.
- Nenhum webhook financeiro real enviado.
- Checkout permanece bloqueado enquanto a configuração obrigatória não estiver completa.

A integração Promisse continua apontando apenas para a base contratual:
https://api.promisse.com.br

## Endpoints principais

- `/Api/Csrf`
- `/Api/Admin/Login`
- `/Api/Admin/Logout`
- `/Api/Auth/Login`
- `/Api/Auth/Logout`
- `/Api/Auth/Me`
- `/Api/Checkout`
- `/Api/Orders/[id]`
- `/Api/Orders/[id]/Reconcile`
- `/Api/Payment/[Id]`
- `/Api/Webhooks/Promisse`
- `/Api/Internal/Reconciliation`

## Artefato de deploy

`.vercelignore` exclui do upload:
- /docs/
- /tests/
- /scripts/
- /migrations/
- /Logs/
- /Storage/
- node_modules, .next e arquivos de segredo/backup.

Esses diretórios continuam no repositório para manutenção e auditoria, mas não entram no artefato do Vercel.

## Próxima liberação

Antes de Production:
- definir ADMIN_USER e ADMIN_ACCESS_KEY de Production;
- definir todos os secrets obrigatórios de Production;
- configurar sitekey/secret reais do hCaptcha e o hostname;
- garantir backup automático Neon quando o projeto tiver plano elegível;
- resolver o cron de 5 minutos com plano compatível ou scheduler externo;
- manter Promisse desativado até a autorização financeira explícita.

Gate financeiro final:
`AUTORIZO TESTE FINANCEIRO REAL CONTROLADO`
