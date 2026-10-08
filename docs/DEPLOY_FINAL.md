# Shiny Store — Guia Final de Deploy

Preparação: 2026-10-08.

## URLs

- GitHub: https://github.com/delete-accountz/shiny
- Vercel: https://vercel.com/delete-accountz/shiny-store
- Preview seguro atual: https://shiny-store-t2hw8ph4c-delete-accountz.vercel.app
- Deploy inspect: https://vercel.com/delete-accountz/shiny-store/27YZfHdGmfsdY46Y8N6UFfmUeDYH
- Alias de produção informado pelo Vercel: https://shiny-store-eight.vercel.app
- Neon: projeto shiny-store-prod, id square-flower-70047569, região aws-sa-east-1

## Estado do Preview

Deploy Ready e build remoto PASS.

Configuração segura:
- DATABASE_URL: Secret do Neon
- SESSION_HMAC_SECRET: Secret aleatório
- WEBHOOK_ENCRYPTION_KEY: Secret aleatório
- CRON_SECRET: Secret aleatório
- HCAPTCHA_SECRET_KEY: Secret oficial de teste do hCaptcha
- NEXT_PUBLIC_HCAPTCHA_SITE_KEY: sitekey oficial de teste do hCaptcha
- DATABASE_REQUIRED=true
- SHINY_STORAGE_MODE=database
- ADMIN_ACCESS_LEVEL=OWNER
- RECONCILIATION_AUTOMATION_ENABLED=false
- TRUSTED_PROXY=false
- TRUSTED_PROXY_HEADER=x-real-ip
- PROMISSE_API_BASE_URL=https://api.promisse.com.br

O Preview não possui cron. A reconciliação automática está desligada para impedir qualquer alteração automática no banco de produção.

O endpoint raiz e /Api/Csrf respondem 503 production_configuration_incomplete. Isso é esperado e confirma o fail-closed enquanto ADMIN_USER/ADMIN_ACCESS_KEY de Preview não forem fornecidos.

## Neon

Projeto: shiny-store-prod
Região: aws-sa-east-1
Banco: shiny_store
Role: shiny_store_owner

Validações:
- migrations 001–005: PASS; nenhuma migration pendente.
- estoque concorrente: PASS; duas conexões reais, uma reserva.
- cupom concorrente: PASS; duas conexões reais, uma reserva.
- restore: PASS; snapshot restaurado para branch isolada, branch ficou ready, 27 tabelas públicas e 5 migrations verificadas; branch temporária removida.
- snapshot manual: post-migration-history, expira em 2026-10-15.

Backup automático:
- NÃO configurado.
- O projeto retornou que a criação de backup schedule não está habilitada.
- Não houve upgrade de plano nem cobrança.

## Vercel

O repositório GitHub está ligado ao projeto delete-accountz/shiny-store.

Preview publicado com uma configuração sem cron para compatibilidade com Hobby e segurança operacional.

O vercel.json local de Production permanece com:
*/5 * * * *

Esse cron continua bloqueado pelo plano Hobby. Para Production, usar plano compatível ou scheduler externo autenticado.

## HCaptcha

O Preview usa o par oficial de teste do hCaptcha.

Esse par é somente para teste e não oferece proteção anti-bot real.

Production deve usar sitekey/secret reais e, quando o allowlist estiver habilitado, registrar o hostname de produção no Dashboard do hCaptcha.

## Gate financeiro

Promisse não está configurado.
PROMISSE_API_KEY não está configurada.
PROMISSE_WEBHOOK_SECRET não está configurado.
Nenhuma cobrança foi criada.
Nenhum webhook financeiro real foi enviado.
Nenhuma chamada financeira real foi executada nesta preparação.

Checkout está bloqueado pelo fail-closed de configuração.

## Endpoints principais

- /Api/Csrf
- /Api/Admin/Login
- /Api/Admin/Logout
- /Api/Auth/Login
- /Api/Auth/Logout
- /Api/Auth/Me
- /Api/Checkout
- /Api/Orders/[id]
- /Api/Orders/[id]/Reconcile
- /Api/Payment/[Id]
- /Api/Webhooks/Promisse
- /Api/Internal/Reconciliation

## Artefato Vercel

.vercelignore exclui do upload:
- /docs/
- /tests/
- /scripts/
- /migrations/
- /Logs/
- /Storage/
- node_modules
- .next
- arquivos de segredo e backups

Os diretórios continuam no GitHub para manutenção e auditoria; apenas não entram no artefato do Vercel.

## Git

Commit principal desta preparação:
7a523f7 — Prepare production deployment

Remote:
https://github.com/delete-accountz/shiny.git

O scanner do índice retornou SECRET_SCAN_PASS antes do commit.

## Próxima etapa para Production

Definir ADMIN_USER e ADMIN_ACCESS_KEY de Production.
Definir DATABASE_URL e secrets obrigatórios no ambiente Production.
Configurar sitekey/secret reais do hCaptcha e hostname.
Habilitar backup automático Neon quando o projeto tiver plano elegível.
Resolver o cron de 5 minutos com plano compatível ou scheduler externo.
Manter Promisse desativado até autorização financeira explícita.

Gate financeiro final:
AUTORIZO TESTE FINANCEIRO REAL CONTROLADO
